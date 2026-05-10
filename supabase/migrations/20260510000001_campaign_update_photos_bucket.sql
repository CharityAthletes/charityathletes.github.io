-- Storage bucket for campaign update photos
-- Photos are public-read; only the backend (service role) writes to the bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-update-photos',
  'campaign-update-photos',
  true,
  5242880,          -- 5 MB max per file
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

-- Public read policy (anyone can view photos via the public URL)
create policy "campaign_update_photos_read"
  on storage.objects for select
  using (bucket_id = 'campaign-update-photos');
