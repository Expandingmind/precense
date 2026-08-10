-- Precense schema v0.5 — roles, brand orgs, campaigns, deliverables, post stats.
-- Additive on top of v0.4. Safe to re-run (uses if not exists / drop constraint if exists).

------------------------------------------------------------------------
-- 1. USERS: role + optional links to a creator profile or brand membership
------------------------------------------------------------------------

alter table users add column if not exists role text
  not null default 'creator'
  check (role in ('creator', 'brand'));

alter table users add column if not exists onboarded_at timestamptz;

-- Convenience: a user's currently-active brand org (for members of multiple orgs).
alter table users add column if not exists active_brand_org_id bigint;


------------------------------------------------------------------------
-- 2. CREATOR PROFILES — public-facing scorecard brands can browse
------------------------------------------------------------------------

create table if not exists creator_profiles (
  id bigserial primary key,
  user_id bigint not null unique references users(id) on delete cascade,
  display_name text,
  bio text,
  niche text,
  rate_card jsonb,           -- { per_ugc: 250, per_repurpose: 100, currency: 'USD' }
  sample_reels jsonb,        -- [{ url, thumb, caption }]
  contact_email text,
  visibility text not null default 'private'
    check (visibility in ('private','unlisted','public')),
  created_at timestamptz not null default now()
);

create index if not exists creator_profiles_niche_idx on creator_profiles (niche);


------------------------------------------------------------------------
-- 3. BRAND ORGS + MEMBERSHIP (multi-tenant)
------------------------------------------------------------------------

create table if not exists brand_orgs (
  id bigserial primary key,
  name text not null,
  slug text unique,
  logo_url text,
  website text,
  owner_user_id bigint not null references users(id) on delete restrict,
  brand_kit jsonb,           -- { colors, fonts, tone, banned_claims: [] }
  created_at timestamptz not null default now()
);

create table if not exists brand_org_members (
  org_id bigint not null references brand_orgs(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner','admin','member','viewer')),
  invited_email text,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (org_id, user_id)
);

create index if not exists brand_org_members_user_idx on brand_org_members (user_id);

-- Fkey the users.active_brand_org_id now that brand_orgs exists.
alter table users drop constraint if exists users_active_brand_org_fkey;
alter table users add constraint users_active_brand_org_fkey
  foreign key (active_brand_org_id) references brand_orgs(id) on delete set null;


------------------------------------------------------------------------
-- 4. CAMPAIGNS — a brand's brief that creators fulfill
------------------------------------------------------------------------

create table if not exists campaigns (
  id bigserial primary key,
  brand_org_id bigint not null references brand_orgs(id) on delete cascade,
  name text not null,
  brief text,
  target_hooks text[],
  target_formats text[],
  budget_cents bigint,
  currency text default 'USD',
  status text not null default 'draft'
    check (status in ('draft','active','paused','completed','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_org_status_idx on campaigns (brand_org_id, status);


------------------------------------------------------------------------
-- 5. CREATOR ROSTER — brand's saved creators + invite state
------------------------------------------------------------------------

create table if not exists creator_roster (
  brand_org_id bigint not null references brand_orgs(id) on delete cascade,
  creator_profile_id bigint not null references creator_profiles(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited','active','paused','removed')),
  added_at timestamptz not null default now(),
  notes text,
  primary key (brand_org_id, creator_profile_id)
);


------------------------------------------------------------------------
-- 6. POST STATS — time-series performance for own_posts / deliverables
------------------------------------------------------------------------

-- Distinguish "reference I scanned" from "post I published".
alter table submissions add column if not exists kind text
  not null default 'reference'
  check (kind in ('reference','own_post'));

alter table submissions add column if not exists post_url text;
alter table submissions add column if not exists platform text
  check (platform in ('instagram','tiktok','youtube','other'));
alter table submissions add column if not exists posted_at timestamptz;

create index if not exists submissions_user_kind_idx
  on submissions (user_id, kind, submitted_at desc);

create table if not exists post_stats (
  id bigserial primary key,
  submission_id bigint not null references submissions(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  watch_time_avg_ms bigint,
  retention_curve jsonb,     -- [{ t_ms, pct_watching }]
  raw jsonb                  -- provider payload, for debugging
);

create index if not exists post_stats_submission_time_idx
  on post_stats (submission_id, fetched_at desc);


------------------------------------------------------------------------
-- 7. DELIVERABLES — the join between a campaign and a creator's scan/post
------------------------------------------------------------------------

create table if not exists deliverables (
  id bigserial primary key,
  campaign_id bigint not null references campaigns(id) on delete cascade,
  creator_profile_id bigint not null references creator_profiles(id) on delete cascade,
  submission_id bigint references submissions(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','submitted','revising','approved','live','paid','rejected')),
  payout_cents bigint,
  payout_tier text,
  submitted_at timestamptz,
  approved_at timestamptz,
  live_at timestamptz,
  paid_at timestamptz,
  brand_notes text,
  created_at timestamptz not null default now()
);

create index if not exists deliverables_campaign_status_idx
  on deliverables (campaign_id, status);
create index if not exists deliverables_creator_idx
  on deliverables (creator_profile_id, status);


------------------------------------------------------------------------
-- 8. Bootstrap RPC: set_user_role — called by the onboarding screen
------------------------------------------------------------------------

create or replace function set_user_role(p_role text, p_brand_name text default null)
returns table (id bigint, role text, active_brand_org_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_user users;
  v_org_id bigint;
begin
  if v_auth_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_role not in ('creator','brand') then
    raise exception 'invalid role %', p_role;
  end if;

  select * into v_user from users where auth_user_id = v_auth_uid;
  if not found then
    raise exception 'no user row for auth uid';
  end if;

  update users
     set role = p_role,
         onboarded_at = coalesce(onboarded_at, now())
   where users.id = v_user.id;

  if p_role = 'creator' then
    insert into creator_profiles (user_id, display_name, niche)
    values (v_user.id, coalesce(v_user.first_name, v_user.handle), v_user.niche)
    on conflict (user_id) do nothing;

  elsif p_role = 'brand' then
    if p_brand_name is null or length(trim(p_brand_name)) = 0 then
      raise exception 'brand_name required for brand role';
    end if;
    insert into brand_orgs (name, owner_user_id)
    values (trim(p_brand_name), v_user.id)
    returning brand_orgs.id into v_org_id;

    insert into brand_org_members (org_id, user_id, role, accepted_at)
    values (v_org_id, v_user.id, 'owner', now());

    update users set active_brand_org_id = v_org_id where users.id = v_user.id;
  end if;

  return query
    select u.id, u.role, u.active_brand_org_id
      from users u where u.id = v_user.id;
end;
$$;

grant execute on function set_user_role(text, text) to authenticated;
