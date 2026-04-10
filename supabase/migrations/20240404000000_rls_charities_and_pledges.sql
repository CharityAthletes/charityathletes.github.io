-- =============================================================
-- チャリアス — Migration 004: RLS for charities, charity_requests,
--   and donor_pledges
--
-- These tables were created directly in Supabase without a
-- migration, so they had no Row-Level Security.  The backend
-- always uses the service-role key (bypasses RLS), so enabling
-- RLS here does NOT break any existing functionality.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- CHARITIES  (public read-only directory)
-- Anyone may read active charities; only the service role
-- (backend) may insert / update / delete.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.charities (
  id              uuid primary key default uuid_generate_v4(),
  name_en         text not null,
  name_ja         text not null default '',
  description_en  text not null default '',
  description_ja  text not null default '',
  category        text not null default 'other',
  logo_url        text,
  website_url     text,
  donorbox_url    text,
  is_active       boolean not null default true,
  is_featured     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.charities enable row level security;

-- Public read: anyone (including unauthenticated visitors) can
-- browse the charity directory.
drop policy if exists "public read charities" on public.charities;
create policy "public read charities"
  on public.charities for select
  using (true);

-- No INSERT / UPDATE / DELETE policies → only service role can write.


-- ─────────────────────────────────────────────────────────────
-- CHARITY REQUESTS  (anyone can submit; only service role reads)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.charity_requests (
  id            uuid primary key default uuid_generate_v4(),
  org_name      text not null,
  donorbox_url  text not null,
  website_url   text,
  category      text not null default 'other',
  reason        text,
  submitted_by  text,
  athlete_id    uuid references auth.users(id) on delete set null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now()
);

alter table public.charity_requests enable row level security;

-- Anyone (even unauthenticated donors) may submit a new request.
drop policy if exists "anyone can submit charity request" on public.charity_requests;
create policy "anyone can submit charity request"
  on public.charity_requests for insert
  with check (true);

-- No SELECT / UPDATE / DELETE policies → submissions are only
-- readable by the service role (admin backend).


-- ─────────────────────────────────────────────────────────────
-- DONOR PLEDGES  (sensitive PII — block all direct access)
-- Contains donor names, emails, and Stripe payment references.
-- The backend always uses the service-role key, so it is
-- unaffected by these restrictions.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.donor_pledges (
  id                          uuid primary key default uuid_generate_v4(),
  campaign_id                 uuid not null references public.campaigns(id) on delete cascade,
  athlete_user_id             uuid references auth.users(id) on delete set null,
  donor_name                  text not null,
  donor_email                 text not null,
  flat_amount_jpy             integer check (flat_amount_jpy > 0),
  per_km_rate_jpy             integer check (per_km_rate_jpy > 0),
  is_anonymous                boolean not null default false,
  stripe_customer_id          text,
  stripe_payment_intent_id    text unique,
  stripe_setup_intent_id      text unique,
  stripe_payment_method_id    text,
  charged_amount_jpy          integer,
  charged_at                  timestamptz,
  status                      text not null default 'pending'
                                check (status in ('pending', 'confirmed', 'charged', 'failed', 'refunded')),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists donor_pledges_campaign_idx
  on public.donor_pledges(campaign_id);
create index if not exists donor_pledges_athlete_idx
  on public.donor_pledges(athlete_user_id);
create index if not exists donor_pledges_status_idx
  on public.donor_pledges(status);

alter table public.donor_pledges enable row level security;

-- No policies at all: zero direct access for anon or authenticated
-- users.  The service role bypasses RLS and handles all reads and
-- writes from the trusted backend.
