-- Add photo URLs array to activities table.
-- Strava photos are fetched via GET /activities/{id}/photos after each sync.

alter table public.activities
  add column if not exists photo_urls text[] not null default '{}';
