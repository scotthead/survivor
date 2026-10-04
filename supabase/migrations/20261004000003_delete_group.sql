-- Owner-only group deletion. Members, games, picks, players and winners go with it via ON DELETE CASCADE.
create function public.delete_group(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.groups where id = gid and owner_id = auth.uid();
  if not found then raise exception 'Only the group owner can delete this group'; end if;
end $$;

revoke execute on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;
