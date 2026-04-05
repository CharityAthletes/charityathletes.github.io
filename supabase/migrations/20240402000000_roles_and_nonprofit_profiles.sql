-- =============================================================
-- チャリアス — Migration 002: User Roles + Nonprofit Profiles
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- USER ROLES
-- One row per user; default 'athlete'. Assigned at signup.
-- ─────────────────────────────────────────────────────────────

create table public.user_roles (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  role       text not null default 'athlete'
               check (role in ('athlete', 'nonprofit', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-assign 'athlete' role when a user is created
create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Role can be overridden by raw_user_meta_data.role (used by nonprofit signup)
  insert into public.user_roles (user_id, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'athlete')
  );
  return new;
end;
$$;

create trigger on_auth_user_role_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user_role();

create trigger trg_user_roles_updated_at
  before update on public.user_roles
  for each row execute procedure public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- NONPROFIT PROFILES
-- Created at signup; awaits admin approval before the nonprofit
-- user can access the full app. On approval, a row in the
-- `nonprofits` table (from migration 001) is created and linked.
-- ─────────────────────────────────────────────────────────────

create table public.nonprofit_profiles (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null unique references auth.users(id) on delete cascade,

  -- Bilingual identity
  name_ja              text not null,
  name_en              text not null,
  description_ja       text not null default '',
  description_en       text not null default '',
  logo_url             text,
  website_url          text,

  -- Classification
  category             text not null default 'other'
                         check (category in (
                           'education', 'environment', 'health',
                           'children', 'disaster_relief', 'animal_welfare', 'other'
                         )),

  -- Donorbox integration (their own account)
  donorbox_campaign_id    text not null,
  donorbox_account_email  text not null,

  -- Approval workflow
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'rejected')),
  rejection_reason     text,
  reviewed_by          uuid references auth.users(id),
  reviewed_at          timestamptz,

  -- Link to the public `nonprofits` entity created on approval
  nonprofit_id         uuid references public.nonprofits(id),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index nonprofit_profiles_status_idx on public.nonprofit_profiles(status);
create index nonprofit_profiles_user_idx   on public.nonprofit_profiles(user_id);

create trigger trg_nonprofit_profiles_updated_at
  before update on public.nonprofit_profiles
  for each row execute procedure public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- APPROVAL FUNCTION
-- Called by the backend (service role) when an admin approves.
-- Creates a `nonprofits` row and links it back.
-- ─────────────────────────────────────────────────────────────

create or replace function public.approve_nonprofit(
  p_profile_id   uuid,
  p_admin_id     uuid
) returns uuid language plpgsql security definer as $$
declare
  v_profile  public.nonprofit_profiles;
  v_np_id    uuid;
begin
  select * into v_profile
    from public.nonprofit_profiles
    where id = p_profile_id and status = 'pending';

  if not found then
    raise exception 'Profile not found or not pending: %', p_profile_id;
  end if;

  -- Create the public nonprofits entity
  insert into public.nonprofits (
    name_ja, name_en, description_ja, description_en,
    logo_url, website_url, donorbox_account_id, is_active
  )
  values (
    v_profile.name_ja, v_profile.name_en,
    v_profile.description_ja, v_profile.description_en,
    v_profile.logo_url, v_profile.website_url,
    v_profile.donorbox_account_email,
    true
  )
  returning id into v_np_id;

  -- Update the profile
  update public.nonprofit_profiles
    set status       = 'approved',
        nonprofit_id = v_np_id,
        reviewed_by  = p_admin_id,
        reviewed_at  = now(),
        updated_at   = now()
    where id = p_profile_id;

  return v_np_id;
end;
$$;

create or replace function public.reject_nonprofit(
  p_profile_id     uuid,
  p_admin_id       uuid,
  p_reason         text default ''
) returns void language plpgsql security definer as $$
begin
  update public.nonprofit_profiles
    set status           = 'rejected',
        rejection_reason = p_reason,
        reviewed_by      = p_admin_id,
        reviewed_at      = now(),
        updated_at       = now()
    where id = p_profile_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- HELPER: get current user's role (used in RLS)
-- ─────────────────────────────────────────────────────────────

create or replace function public.current_user_role()
returns text language sql security definer stable as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

alter table public.user_roles         enable row level security;
alter table public.nonprofit_profiles enable row level security;

-- user_roles: own row + admins can read all
create policy "own role"
  on public.user_roles for select
  using (auth.uid() = user_id or public.current_user_role() = 'admin');

-- user_roles: only service role can insert/update (via triggers & backend)
create policy "service insert role"
  on public.user_roles for insert
  with check (false);   -- blocked for anon/authenticated; service role bypasses RLS

-- nonprofit_profiles: owners see their own; admins see all
create policy "own nonprofit profile"
  on public.nonprofit_profiles for select
  using (auth.uid() = user_id or public.current_user_role() = 'admin');

create policy "owner update nonprofit profile"
  on public.nonprofit_profiles for update
  using (auth.uid() = user_id and status = 'pending');

-- Athletes can browse approved nonprofit profiles (for campaign pages)
create policy "athletes see approved nonprofits"
  on public.nonprofit_profiles for select
  using (status = 'approved' and auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────
-- ADMIN STATS VIEW (materialised in a view for convenience)
-- ─────────────────────────────────────────────────────────────

create or replace view public.admin_platform_stats as
select
  (select count(*) from public.user_roles where role = 'athlete')   as total_athletes,
  (select count(*) from public.user_roles where role = 'nonprofit')  as total_nonprofits,
  (select count(*) from public.nonprofit_profiles where status = 'pending')  as pending_approvals,
  (select count(*) from public.nonprofit_profiles where status = 'approved') as approved_nonprofits,
  (select count(*) from public.campaigns where is_active = true)     as active_campaigns,
  (select coalesce(sum(total_amount_jpy), 0) from public.donations where status = 'completed') as total_donated_jpy,
  (select count(*) from public.donations where status = 'completed') as total_donations,
  (select count(*) from public.activities where deleted_at is null)  as total_activities;

-- Only admins can query this view
create policy "admin stats view"
  on public.admin_platform_stats for select
  using (public.current_user_role() = 'admin');
-- Note: views don't use RLS directly; enforce in the backend with requireRole('admin').

-- ─────────────────────────────────────────────────────────────
-- NONPROFIT TOP ATHLETES  (used by nonprofit dashboard)
-- ─────────────────────────────────────────────────────────────

create or replace function public.nonprofit_top_athletes(
  p_nonprofit_id uuid,
  p_limit        int default 10
)
returns table (
  user_id          uuid,
  display_name     text,
  avatar_url       text,
  total_donated_jpy bigint,
  total_distance_km numeric,
  activity_count   bigint
)
language sql security definer stable as $$
  select
    cp.user_id,
    up.display_name,
    up.avatar_url,
    sum(cp.total_donated_jpy)  as total_donated_jpy,
    sum(cp.total_distance_km)  as total_distance_km,
    sum(cp.activity_count)     as activity_count
  from public.campaign_participations cp
  join public.campaigns c         on c.id = cp.campaign_id
  join public.user_profiles up    on up.user_id = cp.user_id
  where c.nonprofit_id = p_nonprofit_id
  group by cp.user_id, up.display_name, up.avatar_url
  order by total_donated_jpy desc
  limit p_limit;
$$;
