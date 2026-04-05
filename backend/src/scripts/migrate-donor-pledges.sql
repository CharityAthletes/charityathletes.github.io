-- Run this in the Supabase SQL Editor if donor_pledges doesn't exist yet,
-- or if you need to add the charged/skipped columns.

-- Create table (skip if already exists)
create table if not exists donor_pledges (
  id                        uuid primary key default gen_random_uuid(),
  campaign_id               uuid references campaigns(id) on delete cascade,
  donor_name                text not null,
  donor_email               text not null,
  flat_amount_jpy           integer,
  per_km_rate_jpy           integer,
  stripe_customer_id        text,
  stripe_payment_intent_id  text,
  stripe_setup_intent_id    text,
  stripe_payment_method_id  text,
  status                    text not null default 'pending',
  charged_amount_jpy        integer,
  charged_at                timestamptz,
  created_at                timestamptz not null default now()
);

-- Add any missing columns (safe to run even if they already exist)
alter table donor_pledges
  add column if not exists charged_amount_jpy       integer,
  add column if not exists charged_at               timestamptz,
  add column if not exists stripe_payment_method_id text;

-- Allowed statuses: pending → confirmed → charged | failed | skipped
-- (enforced in app logic, not a DB constraint, to keep migrations simple)

-- Index for the charge job query
create index if not exists donor_pledges_campaign_status
  on donor_pledges(campaign_id, status);
