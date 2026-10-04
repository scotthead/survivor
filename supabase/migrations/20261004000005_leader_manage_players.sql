-- Group leaders (owners) can add players (guests with no account, or existing group members) to a game and set their picks.
-- Leader changes ignore the pick lock and are written to leader_actions.

-- 1. Guest players: profiles no longer have to be auth users.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles add column is_guest boolean not null default false;

-- Replaces the old ON DELETE CASCADE from auth.users.
create function public.handle_deleted_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.profiles where id = old.id and not is_guest;
  return old;
end $$;
create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- 2. Audit log of leader actions.
create table public.leader_actions (
  id bigserial primary key,
  game_id uuid not null references public.games on delete cascade,
  performed_by uuid references public.profiles on delete set null,
  action text not null check (action in ('add_guest','add_player','set_pick')),
  target_user_id uuid references public.profiles on delete set null,
  contestant_id int references public.contestants,
  previous_contestant_id int references public.contestants,
  game_status text,
  created_at timestamptz not null default now()
);
create index on public.leader_actions (game_id);
alter table public.leader_actions enable row level security;
create policy leader_actions_read on public.leader_actions for select to authenticated
  using (public.is_group_member(public.game_group(game_id)));

-- 3. Split the per-game winner logic out so it can be re-run after a leader changes a pick.
create function public.resolve_game(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare alive int; total int; max_ep int; max_votes int;
begin
  delete from public.game_winners where game_id = gid;
  update public.games set status = 'in_progress', completed_at = null where id = gid;

  select count(*), count(*) filter (where c.status <> 'eliminated') into total, alive
    from public.picks p join public.contestants c on c.id = p.contestant_id where p.game_id = gid;
  if total < 2 then return; end if;

  if alive = 1 then
    insert into public.game_winners select gid, p.user_id
      from public.picks p join public.contestants c on c.id = p.contestant_id
      where p.game_id = gid and c.status <> 'eliminated';
  elsif alive = 0 then
    select max(c.eliminated_episode) into max_ep
      from public.picks p join public.contestants c on c.id = p.contestant_id where p.game_id = gid;
    select max(c.jury_votes_received) into max_votes
      from public.picks p join public.contestants c on c.id = p.contestant_id
      where p.game_id = gid and c.eliminated_episode = max_ep;
    insert into public.game_winners select gid, p.user_id
      from public.picks p join public.contestants c on c.id = p.contestant_id
      where p.game_id = gid and c.eliminated_episode = max_ep
        and (max_votes is null or c.jury_votes_received = max_votes);
  else
    return;
  end if;
  update public.games set status = 'completed', completed_at = now() where id = gid;
end $$;

create or replace function public.resolve_season_games() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g record; eliminated_count int;
begin
  select count(*) into eliminated_count from public.contestants where season_id = new.season_id and status = 'eliminated';
  if eliminated_count >= 2 then
    update public.games set status = 'in_progress' where season_id = new.season_id and status = 'picking';
  end if;
  for g in select id from public.games where season_id = new.season_id and status in ('in_progress','completed') loop
    perform public.resolve_game(g.id);
  end loop;
  return new;
end $$;

-- 4. Leader RPCs.
create function public.add_guest_player(gid uuid, guest_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid := gen_random_uuid(); nm text := trim(coalesce(guest_name, ''));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.groups where id = gid and owner_id = auth.uid()) then
    raise exception 'Only the group owner can add players'; end if;
  if nm = '' or length(nm) > 50 then raise exception 'Player name must be 1-50 characters'; end if;
  insert into public.profiles (id, display_name, is_guest) values (new_id, nm, true);
  insert into public.group_members (group_id, user_id, role) values (gid, new_id, 'member');
  return new_id;
end $$;

create function public.leader_add_player(gid uuid, uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.games;
begin
  select * into g from public.games where id = gid;
  if g.id is null or auth.uid() is null
     or not exists (select 1 from public.groups where id = g.group_id and owner_id = auth.uid()) then
    raise exception 'Only the group owner can add players'; end if;
  if not exists (select 1 from public.group_members where group_id = g.group_id and user_id = uid) then
    raise exception 'That person is not in this group'; end if;
  insert into public.game_players (game_id, user_id) values (gid, uid) on conflict do nothing;
  insert into public.leader_actions (game_id, performed_by, action, target_user_id, game_status)
    values (gid, auth.uid(), 'add_player', uid, g.status);
end $$;

create function public.leader_set_pick(gid uuid, uid uuid, cid int) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.games; c public.contestants; prev int;
begin
  select * into g from public.games where id = gid;
  if g.id is null or auth.uid() is null
     or not exists (select 1 from public.groups where id = g.group_id and owner_id = auth.uid()) then
    raise exception 'Only the group owner can set picks'; end if;
  if not exists (select 1 from public.group_members where group_id = g.group_id and user_id = uid) then
    raise exception 'That person is not in this group'; end if;
  select * into c from public.contestants where id = cid;
  if c.id is null or c.season_id <> g.season_id then raise exception 'Contestant is not in this season'; end if;
  if c.status <> 'active' then raise exception 'That castaway has already been eliminated'; end if;

  select contestant_id into prev from public.picks where game_id = gid and user_id = uid;
  insert into public.game_players (game_id, user_id) values (gid, uid) on conflict do nothing;
  insert into public.picks (game_id, user_id, contestant_id) values (gid, uid, cid)
    on conflict (game_id, user_id) do update set contestant_id = excluded.contestant_id, picked_at = now();
  insert into public.leader_actions (game_id, performed_by, action, target_user_id, contestant_id, previous_contestant_id, game_status)
    values (gid, auth.uid(), 'set_pick', uid, cid, prev, g.status);
  if g.status <> 'picking' then perform public.resolve_game(gid); end if;
exception when unique_violation then
  raise exception 'That castaway has already been picked by someone else in this game';
end $$;

revoke execute on function public.handle_deleted_user(), public.resolve_game(uuid), public.resolve_season_games() from public, anon, authenticated;
revoke execute on function public.add_guest_player(uuid, text), public.leader_add_player(uuid, uuid), public.leader_set_pick(uuid, uuid, int) from public, anon;
grant execute on function public.add_guest_player(uuid, text), public.leader_add_player(uuid, uuid), public.leader_set_pick(uuid, uuid, int) to authenticated;

-- Users must not be able to flip their own is_guest flag.
alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid())
    and is_admin = (select p.is_admin from public.profiles p where p.id = (select auth.uid()))
    and is_guest = (select p.is_guest from public.profiles p where p.id = (select auth.uid())));
