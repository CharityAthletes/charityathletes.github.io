-- =============================================================
-- チャリアス — Migration 005: Multi-currency + platform tip
--   on donor_pledges
-- =============================================================

-- Currency the donor selected at pledge time (default JPY).
alter table public.donor_pledges
  add column if not exists currency text not null default 'jpy'
    check (currency in ('jpy', 'usd', 'aud'));

-- Optional platform support tip amount (human-readable units:
-- ¥100 stored as 100, $1 stored as 1, A$1 stored as 1).
alter table public.donor_pledges
  add column if not exists tip_amount integer;
