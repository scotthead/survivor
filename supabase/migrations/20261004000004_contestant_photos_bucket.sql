-- Public bucket for castaway photos. Reads are public via the CDN URL; writes need the service-role key (no policies on purpose).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contestant-photos', 'contestant-photos', true, 2097152, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;
