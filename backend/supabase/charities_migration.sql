-- ── Charity directory tables ──────────────────────────────────────────────────

create table if not exists public.charities (
  id               uuid primary key default gen_random_uuid(),
  name_en          text not null,
  name_ja          text,
  description_en   text,
  description_ja   text,
  category         text,            -- Health | Education | Environment | Community | Animal Welfare | Disaster Relief
  website_url      text,
  donorbox_url     text,
  avatar_initials  text,            -- 2-char fallback when no logo
  is_featured      boolean default false,
  is_active        boolean default true,
  created_at       timestamptz default now()
);

create table if not exists public.charity_requests (
  id             uuid primary key default gen_random_uuid(),
  org_name       text not null,
  donorbox_url   text not null,
  website_url    text,
  category       text,
  reason         text,
  submitted_by   text,
  athlete_id     uuid references auth.users(id) on delete set null,
  status         text default 'pending',
  created_at     timestamptz default now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.charities        enable row level security;
alter table public.charity_requests enable row level security;

create policy "charities_public_read"
  on public.charities for select using (is_active = true);

create policy "charity_requests_insert"
  on public.charity_requests for insert with check (true);

-- ── Seed: 5 featured organisations ───────────────────────────────────────────

insert into public.charities
  (name_en, name_ja, description_en, description_ja, category, website_url, donorbox_url, avatar_initials, is_featured)
values
  (
    'Cycling for Charity',
    'サイクリング・フォー・チャリティ',
    'Raising funds through cycling events to support charitable causes worldwide.',
    '自転車イベントを通じて世界中のチャリティ活動を支援しています。',
    'Community',
    'https://www.cyclingforcharity.org',
    'https://donorbox.org/cyclingforcharity',
    'CC',
    true
  ),
  (
    'Mirai no Mori',
    '未来の森',
    'Empowering at-risk youth through outdoor experiences and nature-based education in Japan.',
    'アウトドア活動と自然体験を通じて、困難な状況にある若者を支援します。',
    'Community',
    'https://www.miraifdn.org',
    'https://donorbox.org/mirai-no-mori',
    'MN',
    true
  ),
  (
    'Bridge for Smile',
    'ブリッジフォースマイル',
    'Supporting young people aging out of the child welfare system with education and life skills.',
    '児童養護施設を退所する若者に、教育と生活スキルのサポートを提供します。',
    'Education',
    'https://www.b4s.jp',
    'https://donorbox.org/bridge-for-smile',
    'BS',
    true
  ),
  (
    'Learning for All',
    'ラーニング フォー オール',
    'Providing free tutoring and learning support for children living in poverty across Japan.',
    '貧困家庭の子どもたちに無料の学習支援を提供し、教育格差の解消を目指します。',
    'Education',
    'https://learningforall.or.jp',
    'https://donorbox.org/learning-for-all',
    'LA',
    true
  ),
  (
    'Living in Peace',
    'リビング・イン・ピース',
    'Fighting child poverty in Japan through advocacy, policy change, and direct community support.',
    '日本の子どもの貧困問題に取り組み、政策提言と直接支援を通じて社会変革を目指します。',
    'Community',
    'https://www.livinginpeace.com',
    'https://donorbox.org/living-in-peace',
    'LP',
    true
  );
