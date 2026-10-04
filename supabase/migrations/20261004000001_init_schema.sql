-- Survivor Last Man Standing: schema, RLS, RPCs, triggers

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id serial primary key,
  number int unique not null,
  title text, location text, start_date date, end_date date,
  status text not null default 'upcoming' check (status in ('upcoming','airing','completed')),
  winner_contestant_id int null
);

create table public.contestants (
  id serial primary key,
  season_id int not null references public.seasons on delete cascade,
  name text not null,
  photo_url text, age int, occupation text, hometown text, current_residence text, bio text, wiki_url text,
  status text not null default 'active' check (status in ('active','eliminated','winner')),
  eliminated_episode int null, finish_place int null,
  jury_votes_received int null,
  photo_source_url text, bio_source_url text, bio_license text,
  unique (season_id, name)
);
alter table public.seasons add constraint seasons_winner_fk
  foreign key (winner_contestant_id) references public.contestants(id);

create table public.episodes (
  id serial primary key,
  season_id int not null references public.seasons on delete cascade,
  number int not null, air_date date,
  unique (season_id, number)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles,
  invite_code text unique not null default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  season_id int not null references public.seasons,
  status text not null default 'picking' check (status in ('picking','in_progress','completed')),
  picks_open_after_episode int not null default 1,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (group_id, season_id)
);

create table public.game_players (
  game_id uuid not null references public.games on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  contestant_id int not null references public.contestants,
  picked_at timestamptz not null default now(),
  unique (game_id, user_id),
  unique (game_id, contestant_id)
);

create table public.game_winners (
  game_id uuid not null references public.games on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (game_id, user_id)
);

create table public.elimination_events (
  id serial primary key,
  contestant_id int not null references public.contestants,
  episode int not null,
  jury_votes int,
  recorded_by uuid references public.profiles,
  recorded_at timestamptz not null default now(),
  previous_status text not null,
  previous_episode int,
  previous_jury_votes int,
  reverted_at timestamptz
);

create index on public.contestants (season_id);
create index on public.group_members (user_id);
create index on public.games (group_id);
create index on public.picks (game_id);
create index on public.picks (contestant_id);
create index on public.game_players (user_id);

-- ---------- helpers ----------
create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = (select auth.uid()));
$$;

create function public.shares_group_with(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
    where a.user_id = (select auth.uid()) and b.user_id = uid);
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false);
$$;

create function public.game_group(gid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select group_id from public.games where id = gid;
$$;

-- ---------- profile auto-create ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Player'),
          new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.contestants enable row level security;
alter table public.episodes enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.picks enable row level security;
alter table public.game_winners enable row level security;
alter table public.elimination_events enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()) and is_admin = (select p.is_admin from public.profiles p where p.id = (select auth.uid())));

create policy seasons_read on public.seasons for select using (true);
create policy contestants_read on public.contestants for select using (true);
create policy episodes_read on public.episodes for select using (true);

create policy groups_read on public.groups for select to authenticated using (public.is_group_member(id));
create policy members_read on public.group_members for select to authenticated using (public.is_group_member(group_id));
create policy games_read on public.games for select to authenticated using (public.is_group_member(group_id));
create policy players_read on public.game_players for select to authenticated using (public.is_group_member(public.game_group(game_id)));
create policy picks_read on public.picks for select to authenticated using (public.is_group_member(public.game_group(game_id)));
create policy winners_read on public.game_winners for select to authenticated using (public.is_group_member(public.game_group(game_id)));
create policy elim_events_read on public.elimination_events for select to authenticated using (true);

-- ---------- game state helpers ----------
create function public.picks_are_open(g public.games) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.episodes e
                 where e.season_id = g.season_id and e.number >= g.picks_open_after_episode and e.air_date <= current_date)
      or (not exists (select 1 from public.episodes e where e.season_id = g.season_id)
          and (select s.status from public.seasons s where s.id = g.season_id) <> 'upcoming');
$$;

-- ---------- RPCs ----------
create function public.create_group(group_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare gid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(group_name), '') = '' then raise exception 'Group name required'; end if;
  insert into public.groups (name, owner_id) values (trim(group_name), uid) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'owner');
  return gid;
end $$;

create function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare gid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select id into gid from public.groups where invite_code = code;
  if gid is null then raise exception 'Invalid invite code'; end if;
  insert into public.group_members (group_id, user_id) values (gid, uid) on conflict do nothing;
  return gid;
end $$;

create function public.create_game(gid uuid, sid int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.is_group_member(gid) then raise exception 'Not a member of this group'; end if;
  insert into public.games (group_id, season_id) values (gid, sid) returning id into new_id;
  return new_id;
exception when unique_violation then raise exception 'This group already has a game for that season';
end $$;

create function public.join_game(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.games; uid uuid := auth.uid();
begin
  select * into g from public.games where id = gid;
  if g.id is null or not public.is_group_member(g.group_id) then raise exception 'Game not found'; end if;
  if g.status <> 'picking' then raise exception 'This game is locked; no new players can join'; end if;
  insert into public.game_players (game_id, user_id) values (gid, uid) on conflict do nothing;
end $$;

create function public.make_pick(gid uuid, cid int) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.games; c public.contestants; uid uuid := auth.uid();
begin
  select * into g from public.games where id = gid;
  if g.id is null or not public.is_group_member(g.group_id) then raise exception 'Game not found'; end if;
  if g.status <> 'picking' then raise exception 'Picks are locked for this game'; end if;
  if not public.picks_are_open(g) then raise exception 'Picks are not open yet'; end if;
  select * into c from public.contestants where id = cid;
  if c.id is null or c.season_id <> g.season_id then raise exception 'Contestant is not in this season'; end if;
  if c.status <> 'active' then raise exception 'That castaway has already been eliminated'; end if;
  insert into public.game_players (game_id, user_id) values (gid, uid) on conflict do nothing;
  insert into public.picks (game_id, user_id, contestant_id) values (gid, uid, cid)
    on conflict (game_id, user_id) do update set contestant_id = excluded.contestant_id, picked_at = now();
exception when unique_violation then
  raise exception 'That castaway has already been picked by someone else in this game';
end $$;

create function public.record_elimination(cid int, ep int, jury_votes int default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.contestants; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not (public.is_admin() or exists (select 1 from public.groups where owner_id = uid)) then
    raise exception 'Only admins or group owners can record eliminations';
  end if;
  select * into c from public.contestants where id = cid for update;
  if c.id is null then raise exception 'Contestant not found'; end if;
  if c.status <> 'active' then raise exception 'Contestant is already eliminated'; end if;
  insert into public.elimination_events (contestant_id, episode, jury_votes, recorded_by, previous_status, previous_episode, previous_jury_votes)
    values (cid, ep, jury_votes, uid, c.status, c.eliminated_episode, c.jury_votes_received);
  update public.contestants set status = 'eliminated', eliminated_episode = ep, jury_votes_received = jury_votes where id = cid;
end $$;

create function public.revert_elimination(event_id int) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.elimination_events;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select * into e from public.elimination_events where id = event_id and reverted_at is null;
  if e.id is null then raise exception 'Event not found or already reverted'; end if;
  update public.elimination_events set reverted_at = now() where id = event_id;
  update public.contestants set status = e.previous_status, eliminated_episode = e.previous_episode,
    jury_votes_received = e.previous_jury_votes where id = e.contestant_id;
end $$;

-- ---------- lock + winner trigger ----------
create function public.resolve_season_games() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g record; alive int; total int; max_ep int; max_votes int; eliminated_count int;
begin
  select count(*) into eliminated_count from public.contestants where season_id = new.season_id and status = 'eliminated';
  if eliminated_count >= 2 then
    update public.games set status = 'in_progress' where season_id = new.season_id and status = 'picking';
  end if;

  for g in select id from public.games where season_id = new.season_id and status in ('in_progress','completed') loop
    delete from public.game_winners where game_id = g.id;
    update public.games set status = 'in_progress', completed_at = null where id = g.id;

    select count(*), count(*) filter (where c.status <> 'eliminated') into total, alive
      from public.picks p join public.contestants c on c.id = p.contestant_id where p.game_id = g.id;
    continue when total < 2;

    if alive = 1 then
      insert into public.game_winners select g.id, p.user_id
        from public.picks p join public.contestants c on c.id = p.contestant_id
        where p.game_id = g.id and c.status <> 'eliminated';
    elsif alive = 0 then
      select max(c.eliminated_episode) into max_ep
        from public.picks p join public.contestants c on c.id = p.contestant_id where p.game_id = g.id;
      select max(c.jury_votes_received) into max_votes
        from public.picks p join public.contestants c on c.id = p.contestant_id
        where p.game_id = g.id and c.eliminated_episode = max_ep;
      insert into public.game_winners select g.id, p.user_id
        from public.picks p join public.contestants c on c.id = p.contestant_id
        where p.game_id = g.id and c.eliminated_episode = max_ep
          and (max_votes is null or c.jury_votes_received = max_votes);
    else
      continue;
    end if;
    update public.games set status = 'completed', completed_at = now() where id = g.id;
  end loop;
  return new;
end $$;

create trigger contestants_resolve after update of status, eliminated_episode, jury_votes_received on public.contestants
  for each row when (old.status is distinct from new.status or old.eliminated_episode is distinct from new.eliminated_episode
                     or old.jury_votes_received is distinct from new.jury_votes_received)
  execute function public.resolve_season_games();

-- ---------- standings view ----------
create view public.game_standings with (security_invoker = true) as
select p.game_id, p.user_id, p.contestant_id,
       (c.status <> 'eliminated') as is_alive, c.eliminated_episode
from public.picks p join public.contestants c on c.id = p.contestant_id;

-- ---------- privileges ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_group(text), public.join_group(text), public.create_game(uuid,int),
  public.join_game(uuid), public.make_pick(uuid,int), public.record_elimination(int,int,int),
  public.revert_elimination(int), public.is_group_member(uuid), public.shares_group_with(uuid),
  public.is_admin(), public.game_group(uuid) to authenticated;
revoke all on public.game_standings from anon;

alter publication supabase_realtime add table public.contestants, public.games;
