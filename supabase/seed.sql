-- ============================================================
-- Seed data for local development
-- Run automatically by: supabase db reset
-- ============================================================

-- ── Sample nonprofit ──────────────────────────────────────────────────────────
insert into public.nonprofits
  (id, name_ja, name_en, description_ja, description_en, donorbox_account_id, is_active)
values
  (
    '11111111-0000-0000-0000-000000000001',
    '子ども支援財団',
    'Children Support Foundation',
    '困難な状況にある子どもたちへの教育・生活支援を行う非営利団体です。',
    'A nonprofit providing education and life support for children in difficult circumstances.',
    'children-support@example.org',
    true
  ),
  (
    '11111111-0000-0000-0000-000000000002',
    '環境保護協会',
    'Environmental Protection Society',
    '自然環境の保護と持続可能な社会の実現を目指します。',
    'Working toward protection of the natural environment and a sustainable society.',
    'env-protect@example.org',
    true
  )
on conflict (id) do nothing;

-- ── Sample campaigns ──────────────────────────────────────────────────────────
insert into public.campaigns (
  id, nonprofit_id,
  title_ja, title_en,
  description_ja, description_en,
  sport_types,
  flat_amount_jpy, per_km_rate_jpy, suggested_per_km_jpy,
  donorbox_campaign_id,
  start_date, end_date,
  goal_amount_jpy, is_active
)
values
  (
    '22222222-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'サイクリング for チルドレン 2024',
    'Cycling for Children 2024',
    '自転車で走った距離が子どもたちへの支援につながります。フラット寄付＋距離連動の両方が有効です。',
    'Every kilometer you ride supports children in need. Both flat and per-km donations are active.',
    '{"Ride","VirtualRide","EBikeRide"}',
    200,      -- ¥200 flat per qualifying activity
    10,       -- ¥10 per km
    '{5,10,20,50}',
    'cycling-for-children-2024',
    now(),
    now() + interval '90 days',
    1000000,
    true
  ),
  (
    '22222222-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000002',
    'ランニングで緑を守ろう',
    'Run for Green',
    'ランニングの距離に応じた寄付で環境保護活動を支援します。',
    'Support environmental protection by donating based on your running distance.',
    '{"Run","Walk","Hike","TrailRun"}',
    null,     -- no flat donation (per-km only)
    20,       -- ¥20 per km
    '{10,20,30,50}',
    'run-for-green-2024',
    now(),
    now() + interval '60 days',
    500000,
    true
  )
on conflict (id) do nothing;
