-- Strava API compliance: remove fields that were used to expose activity details publicly.
-- map_polyline revealed athlete routes/locations; photo_urls exposed Strava photos.
-- Aggregate distance totals (not individual activity records) are shown on public pages instead.

alter table public.activities drop column if exists map_polyline;
alter table public.activities drop column if exists photo_urls;

-- Update the default scope recorded on new tokens to reflect the reduced permission level.
alter table public.strava_tokens
  alter column scope set default 'read,activity:read';
