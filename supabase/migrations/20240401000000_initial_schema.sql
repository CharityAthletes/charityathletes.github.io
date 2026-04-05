-- =============================================================
-- チャリアス (Charity Athletes) — Migration 001: Initial Schema
-- =============================================================

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- USERS
-- Extends auth.users; created automatically on signup.
-- ─────────────────────────────────────────────────────────────

create table public.user_profiles (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  display_name        text not null default '',
  avatar_url          text,
  preferred_language  text not null default 'ja' check (preferred_language in ('ja', 'en')),
  strava_athlete_id   bigint unique,
  stripe_customer_id  text unique,
  total_distance_km   numeric(12, 3) not null default 0,
  total_donated_jpy   integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Auto-create profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- STRAVA TOKENS
-- One row per user; refresh automatically via backend.
-- ─────────────────────────────────────────────────────────────

create table public.strava_tokens (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null unique references auth.users(id) on delete cascade,
  athlete_id     bigint not null unique,
  access_token   text not null,
  refresh_token  text not null,
  expires_at     bigint not null,   -- Unix epoch seconds
  scope          text not null default 'read,activity:read_all',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- OAUTH STATES  (short-lived CSRF tokens)
-- ─────────────────────────────────────────────────────────────

create table public.oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- ACTIVITIES
-- Synced from Strava via webhook.
-- ─────────────────────────────────────────────────────────────

create table public.activities (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  strava_activity_id    text not null unique,
  name                  text not null,
  sport_type            text not null,                         -- e.g. 'Ride', 'Run', 'Swim'
  distance_meters       numeric(12, 2) not null default 0,
  moving_time_seconds   integer not null default 0,
  elapsed_time_seconds  integer not null default 0,
  total_elevation_gain  numeric(10, 2) not null default 0,
  start_date            timestamptz not null,
  map_polyline          text,
  average_speed_mps     numeric(8, 4) not null default 0,
  max_speed_mps         numeric(8, 4) not null default 0,
  average_heartrate     numeric(6, 2),
  is_processed          boolean not null default false,
  deleted_at            timestamptz,                           -- soft-delete on Strava delete event
  created_at            timestamptz not null default now()
);

create index activities_user_id_idx      on public.activities(user_id);
create index activities_start_date_idx   on public.activities(start_date desc);
create index activities_unprocessed_idx  on public.activities(is_processed) where not is_processed;

-- ─────────────────────────────────────────────────────────────
-- NONPROFITS
-- Each nonprofit has its own Donorbox account.
-- ─────────────────────────────────────────────────────────────

create table public.nonprofits (
  id                    uuid primary key default uuid_generate_v4(),
  name_ja               text not null,
  name_en               text not null,
  description_ja        text not null default '',
  description_en        text not null default '',
  logo_url              text,
  website_url           text,
  donorbox_account_id   text not null,                -- Donorbox account identifier
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- CAMPAIGNS
-- Donation types: flat_amount_jpy, per_km_rate_jpy, or both.
-- ─────────────────────────────────────────────────────────────

create table public.campaigns (
  id                    uuid primary key default uuid_generate_v4(),
  nonprofit_id          uuid not null references public.nonprofits(id),
  title_ja              text not null,
  title_en              text not null,
  description_ja        text not null default '',
  description_en        text not null default '',
  cover_image_url       text,

  -- Which sport types count toward this campaign
  sport_types           text[] not null default '{Ride,VirtualRide}',  -- Strava sport_type values

  -- Donation structure: at least one must be non-null
  flat_amount_jpy       integer check (flat_amount_jpy > 0),           -- charged once per qualifying activity
  per_km_rate_jpy       integer check (per_km_rate_jpy > 0),           -- charged per km of the activity
  -- Both can be active simultaneously: total = flat + (distance_km × rate)

  -- Suggested pledge options shown to users (per-km), e.g. {10,20,50,100}
  suggested_per_km_jpy  integer[] not null default '{10,20,50}',

  -- Donorbox campaign that receives the funds
  donorbox_campaign_id  text not null,                 -- Donorbox campaign ID on the nonprofit's account

  -- Stripe product/price for one-time donations (optional, for manual top-ups)
  stripe_product_id     text,

  start_date            timestamptz not null,
  end_date              timestamptz not null,
  goal_amount_jpy       integer not null default 0,
  raised_amount_jpy     integer not null default 0,
  participant_count     integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint campaign_dates_valid check (end_date > start_date),
  constraint campaign_has_donation_type check (
    flat_amount_jpy is not null or per_km_rate_jpy is not null
  )
);

create index campaigns_nonprofit_idx on public.campaigns(nonprofit_id);
create index campaigns_active_end_idx on public.campaigns(is_active, end_date) where is_active;

-- ─────────────────────────────────────────────────────────────
-- CAMPAIGN PARTICIPATIONS
-- User opts in to a campaign; chooses their per-km rate if applicable.
-- ─────────────────────────────────────────────────────────────

create table public.campaign_participations (
  id                    uuid primary key default uuid_generate_v4(),
  campaign_id           uuid not null references public.campaigns(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,

  -- User's chosen donation config (may differ from campaign defaults)
  pledge_flat_enabled   boolean not null default true,    -- participate in flat portion
  pledge_per_km_jpy     integer check (pledge_per_km_jpy > 0),  -- null = not participating in per-km

  -- Running totals for this participation
  total_distance_km     numeric(12, 3) not null default 0,
  total_donated_jpy     integer not null default 0,
  activity_count        integer not null default 0,

  stripe_customer_id    text,
  joined_at             timestamptz not null default now(),

  unique (campaign_id, user_id),

  constraint participation_has_pledge check (
    pledge_flat_enabled = true or pledge_per_km_jpy is not null
  )
);

create index participations_user_idx     on public.campaign_participations(user_id);
create index participations_campaign_idx on public.campaign_participations(campaign_id);

-- ─────────────────────────────────────────────────────────────
-- DONATIONS
-- One row per charge event (per activity + campaign combination).
-- ─────────────────────────────────────────────────────────────

create table public.donations (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  campaign_id              uuid not null references public.campaigns(id),
  participation_id         uuid not null references public.campaign_participations(id),
  activity_id              uuid references public.activities(id),

  -- Breakdown (both may apply if campaign has both types active)
  flat_amount_jpy          integer not null default 0,
  per_km_amount_jpy        integer not null default 0,
  total_amount_jpy         integer generated always as (flat_amount_jpy + per_km_amount_jpy) stored,

  distance_km              numeric(10, 3),                -- distance that triggered the per-km charge

  -- Payment
  stripe_payment_intent_id text unique,
  stripe_status            text,                          -- 'succeeded', 'requires_payment_method', etc.

  -- Donorbox sync
  donorbox_donation_id     text unique,
  donorbox_synced_at       timestamptz,

  status                   text not null default 'pending'
                             check (status in ('pending', 'completed', 'failed', 'refunded')),
  trigger_type             text not null
                             check (trigger_type in ('activity', 'manual')),
  created_at               timestamptz not null default now()
);

create index donations_user_idx     on public.donations(user_id);
create index donations_campaign_idx on public.donations(campaign_id);
create index donations_status_idx   on public.donations(status) where status = 'pending';

-- ─────────────────────────────────────────────────────────────
-- AGGREGATE HELPERS  (called from backend via rpc)
-- ─────────────────────────────────────────────────────────────

create or replace function public.record_donation_completed(
  p_donation_id        uuid,
  p_participation_id   uuid,
  p_campaign_id        uuid,
  p_user_id            uuid,
  p_total_jpy          integer,
  p_distance_km        numeric
) returns void language plpgsql security definer as $$
begin
  update public.donations
    set status = 'completed', stripe_status = 'succeeded'
    where id = p_donation_id;

  update public.campaign_participations
    set total_donated_jpy  = total_donated_jpy + p_total_jpy,
        total_distance_km  = total_distance_km + coalesce(p_distance_km, 0),
        activity_count     = activity_count + 1
    where id = p_participation_id;

  update public.campaigns
    set raised_amount_jpy = raised_amount_jpy + p_total_jpy,
        updated_at        = now()
    where id = p_campaign_id;

  update public.user_profiles
    set total_donated_jpy = total_donated_jpy + p_total_jpy,
        total_distance_km = total_distance_km + coalesce(p_distance_km, 0),
        updated_at        = now()
    where user_id = p_user_id;
end;
$$;

create or replace function public.increment_campaign_participants(p_campaign_id uuid)
returns void language sql security definer as $$
  update public.campaigns
    set participant_count = participant_count + 1, updated_at = now()
    where id = p_campaign_id;
$$;

-- ─────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ─────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute procedure public.touch_updated_at();

create trigger trg_campaigns_updated_at
  before update on public.campaigns
  for each row execute procedure public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

alter table public.user_profiles          enable row level security;
alter table public.strava_tokens          enable row level security;
alter table public.oauth_states           enable row level security;
alter table public.activities             enable row level security;
alter table public.nonprofits             enable row level security;
alter table public.campaigns              enable row level security;
alter table public.campaign_participations enable row level security;
alter table public.donations              enable row level security;

-- user_profiles
create policy "own profile"   on public.user_profiles for select using (auth.uid() = user_id);
create policy "update own"    on public.user_profiles for update using (auth.uid() = user_id);

-- strava_tokens  (private)
create policy "own tokens"    on public.strava_tokens for all using (auth.uid() = user_id);

-- oauth_states   (private)
create policy "own states"    on public.oauth_states  for all using (auth.uid() = user_id);

-- activities     (private)
create policy "own activities" on public.activities   for select using (auth.uid() = user_id);

-- nonprofits & campaigns  (public read for authenticated users)
create policy "read nonprofits" on public.nonprofits  for select using (auth.role() = 'authenticated');
create policy "read campaigns"  on public.campaigns   for select using (auth.role() = 'authenticated');

-- campaign_participations
create policy "own participations"       on public.campaign_participations for all    using (auth.uid() = user_id);
create policy "leaderboard participations" on public.campaign_participations for select using (auth.role() = 'authenticated');

-- donations
create policy "own donations"   on public.donations   for select using (auth.uid() = user_id);
