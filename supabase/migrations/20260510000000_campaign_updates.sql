-- Campaign Updates (#campaign-updates)
-- Allows athletes to post text updates (with optional photo) during a campaign.
-- Updates are public (visible on the donor page) but only participants/creators can post.

create table campaign_updates (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  message       text not null check (char_length(message) between 1 and 500),
  photo_url     text,
  created_at    timestamptz not null default now()
);

create index campaign_updates_campaign_id_idx on campaign_updates(campaign_id, created_at desc);

-- RLS
alter table campaign_updates enable row level security;

-- Anyone can read updates (public donor page)
create policy "campaign_updates_read"
  on campaign_updates for select
  using (true);

-- Authenticated users can insert their own updates
-- (backend enforces participant/creator check before calling insert)
create policy "campaign_updates_insert"
  on campaign_updates for insert
  with check (auth.uid() = user_id);

-- Authors can delete their own updates
create policy "campaign_updates_delete"
  on campaign_updates for delete
  using (auth.uid() = user_id);
