-- Allow oauth_states to carry an optional web redirect URL
-- (used when Strava login is initiated from the web app instead of iOS)
alter table public.oauth_states
  add column if not exists web_redirect text;

-- Also relax the user_id NOT NULL for login mode (null = login, not connect)
alter table public.oauth_states
  alter column user_id drop not null;
