-- Precense schema v0.6 — teams, invites, admin seed, payout splits.
-- Additive on top of v0.5.1. Safe to re-run.

------------------------------------------------------------------------
-- 1. ROLES: add team_lead + admin
------------------------------------------------------------------------

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('creator','brand','team_lead','admin'));


------------------------------------------------------------------------
-- 2. TEAMS (agency-in-a-box owned by a team lead)
------------------------------------------------------------------------

create table if not exists teams (
  id bigserial primary key,
  name text not null,
  slug text unique,
  owner_user_id bigint not null references users(id) on delete restrict,
  default_team_take_pct numeric(5,2) not null default 20.00
    check (default_team_take_pct >= 0 and default_team_take_pct <= 50),
  created_at timestamptz not null default now()
);

create index if not exists teams_owner_idx on teams (owner_user_id);


------------------------------------------------------------------------
-- 3. TEAM_MEMBERS (creator ↔ team, with per-creator split)
------------------------------------------------------------------------

create table if not exists team_members (
  team_id bigint not null references teams(id) on delete cascade,
  creator_profile_id bigint not null references creator_profiles(id) on delete cascade,
  team_take_pct numeric(5,2) not null
    check (team_take_pct >= 0 and team_take_pct <= 50),
  status text not null default 'active'
    check (status in ('active','paused','removed')),
  joined_at timestamptz not null default now(),
  primary key (team_id, creator_profile_id)
);

create index if not exists team_members_creator_idx
  on team_members (creator_profile_id) where status = 'active';


------------------------------------------------------------------------
-- 4. CREATOR_INVITES (invite-only signup)
------------------------------------------------------------------------

create table if not exists creator_invites (
  token text primary key,
  role text not null default 'creator'
    check (role in ('creator','team_lead','brand')),
  team_id bigint references teams(id) on delete cascade,
  brand_org_id bigint references brand_orgs(id) on delete cascade,
  team_take_pct numeric(5,2)
    check (team_take_pct is null or (team_take_pct >= 0 and team_take_pct <= 50)),
  created_by_user_id bigint not null references users(id) on delete restrict,
  email_hint text,
  expires_at timestamptz,
  used_by_user_id bigint references users(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists creator_invites_team_idx on creator_invites (team_id) where used_at is null;
create index if not exists creator_invites_creator_idx on creator_invites (created_by_user_id);


------------------------------------------------------------------------
-- 5. PLATFORM CONFIG (single row)
------------------------------------------------------------------------

create table if not exists platform_config (
  id int primary key default 1 check (id = 1),
  platform_take_pct numeric(5,2) not null default 10.00
    check (platform_take_pct >= 0 and platform_take_pct <= 30),
  updated_at timestamptz not null default now()
);

insert into platform_config (id) values (1)
  on conflict (id) do nothing;


------------------------------------------------------------------------
-- 6. PAYOUT SPLITS (ledger — one row per split, per deliverable payout)
------------------------------------------------------------------------

create table if not exists payout_splits (
  id bigserial primary key,
  deliverable_id bigint not null references deliverables(id) on delete cascade,
  recipient_user_id bigint references users(id) on delete set null,
  recipient_kind text not null
    check (recipient_kind in ('creator','team_lead','platform')),
  amount_cents bigint not null,
  pct numeric(5,2) not null,
  stripe_transfer_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payout_splits_deliverable_idx on payout_splits (deliverable_id);
create index if not exists payout_splits_recipient_idx on payout_splits (recipient_user_id, paid_at desc);


------------------------------------------------------------------------
-- 7. ADMIN SEED — promote jah@jahmills.com to admin
------------------------------------------------------------------------

update users set role = 'admin', onboarded_at = coalesce(onboarded_at, now())
  where email = 'jah@jahmills.com';


------------------------------------------------------------------------
-- 8. RPCs
------------------------------------------------------------------------

-- create_team: admin only. Team lead role is granted to owner if not already.
create or replace function create_team(
  p_name text,
  p_owner_email text,
  p_default_team_take_pct numeric default 20.00
)
returns table (id bigint, name text, owner_user_id bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_caller users;
  v_owner users;
  v_new_id bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_caller from users where auth_user_id = auth.uid();
  if not found or v_caller.role <> 'admin' then raise exception 'admin only'; end if;
  if p_default_team_take_pct < 0 or p_default_team_take_pct > 50 then
    raise exception 'default_team_take_pct must be between 0 and 50';
  end if;

  select * into v_owner from users where lower(email) = lower(trim(p_owner_email));
  if not found then raise exception 'no user with email %', p_owner_email; end if;

  update users set role = 'team_lead',
                   onboarded_at = coalesce(onboarded_at, now())
    where users.id = v_owner.id and role in ('creator','team_lead');

  insert into teams (name, owner_user_id, default_team_take_pct)
    values (trim(p_name), v_owner.id, p_default_team_take_pct)
    returning teams.id into v_new_id;

  return query select t.id, t.name, t.owner_user_id from teams t where t.id = v_new_id;
end; $$;

grant execute on function create_team(text, text, numeric) to authenticated;


-- generate_invite: team leads invite creators; admins invite anyone.
create or replace function generate_invite(
  p_role text,
  p_team_id bigint default null,
  p_brand_org_id bigint default null,
  p_team_take_pct numeric default null,
  p_email_hint text default null,
  p_expires_days int default 30
)
returns table (token text, role text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_caller users;
  v_token text;
  v_expires timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_caller from users where auth_user_id = auth.uid();
  if not found then raise exception 'no user row'; end if;

  if p_role not in ('creator','team_lead','brand') then raise exception 'invalid role'; end if;

  -- Permission: team_lead can only invite creators to their own team; admin can do anything.
  if v_caller.role = 'admin' then
    -- ok
    null;
  elsif v_caller.role = 'team_lead' then
    if p_role <> 'creator' then raise exception 'team leads can only invite creators'; end if;
    if p_team_id is null then raise exception 'team_id required'; end if;
    if not exists (select 1 from teams where id = p_team_id and owner_user_id = v_caller.id) then
      raise exception 'you do not own this team';
    end if;
  else
    raise exception 'not authorized';
  end if;

  if p_role = 'creator' and p_team_id is null then
    raise exception 'creator invites require team_id';
  end if;
  if p_role = 'brand' and p_brand_org_id is null and v_caller.role = 'admin' then
    -- brand invite may create a new org on redeem; allow null
    null;
  end if;
  if p_team_take_pct is not null and (p_team_take_pct < 0 or p_team_take_pct > 50) then
    raise exception 'team_take_pct must be between 0 and 50';
  end if;

  v_token := encode(gen_random_bytes(18), 'base64');
  v_token := replace(replace(replace(v_token, '/', '_'), '+', '-'), '=', '');
  v_expires := now() + make_interval(days => greatest(1, coalesce(p_expires_days, 30)));

  insert into creator_invites (
    token, role, team_id, brand_org_id, team_take_pct,
    created_by_user_id, email_hint, expires_at
  ) values (
    v_token, p_role, p_team_id, p_brand_org_id, p_team_take_pct,
    v_caller.id, p_email_hint, v_expires
  );

  return query
    select ci.token, ci.role, ci.expires_at from creator_invites ci where ci.token = v_token;
end; $$;

grant execute on function generate_invite(text, bigint, bigint, numeric, text, int) to authenticated;


-- redeem_invite: called after the user signs up via oauth. Attaches them to a team/brand and sets role.
create or replace function redeem_invite(p_token text)
returns table (id bigint, role text, team_id bigint, brand_org_id bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_auth_uid uuid := auth.uid();
  v_invite creator_invites;
  v_user users;
  v_effective_pct numeric(5,2);
  v_team teams;
  v_creator_profile_id bigint;
begin
  if v_auth_uid is null then raise exception 'not authenticated'; end if;
  select * into v_invite from creator_invites where token = p_token;
  if not found then raise exception 'invalid invite'; end if;
  if v_invite.used_at is not null then raise exception 'invite already used'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;

  -- Ensure a users row exists for this auth session (auto-create if not).
  select * into v_user from users where auth_user_id = v_auth_uid;
  if not found then
    insert into users (auth_user_id, email, first_name, telegram_chat_id, role, onboarded_at)
      values (
        v_auth_uid,
        (select email from auth.users where id = v_auth_uid),
        null,
        -abs(hashtext(v_auth_uid::text)),
        v_invite.role,
        now()
      )
      returning * into v_user;
  else
    update users set role = v_invite.role,
                     onboarded_at = coalesce(onboarded_at, now())
      where users.id = v_user.id
      returning * into v_user;
  end if;

  if v_invite.role = 'creator' then
    select * into v_team from teams where id = v_invite.team_id;
    v_effective_pct := coalesce(v_invite.team_take_pct, v_team.default_team_take_pct);

    insert into creator_profiles (user_id, display_name, niche)
      values (v_user.id, coalesce(v_user.first_name, v_user.handle), v_user.niche)
      on conflict (user_id) do nothing;
    select id into v_creator_profile_id from creator_profiles where user_id = v_user.id;

    insert into team_members (team_id, creator_profile_id, team_take_pct, status)
      values (v_invite.team_id, v_creator_profile_id, v_effective_pct, 'active')
      on conflict (team_id, creator_profile_id)
      do update set team_take_pct = v_effective_pct, status = 'active';

  elsif v_invite.role = 'brand' then
    -- If brand_org_id was pre-attached, add them as a member of that org.
    if v_invite.brand_org_id is not null then
      insert into brand_org_members (org_id, user_id, role, accepted_at)
        values (v_invite.brand_org_id, v_user.id, 'admin', now())
        on conflict (org_id, user_id) do update set accepted_at = excluded.accepted_at;
      update users set active_brand_org_id = v_invite.brand_org_id
        where users.id = v_user.id;
    end if;
    -- If no org attached, user becomes brand role with no org; they'll create one from onboarding.

  elsif v_invite.role = 'team_lead' then
    -- Admin creates a team explicitly via create_team; this invite only sets role.
    null;
  end if;

  update creator_invites set used_by_user_id = v_user.id, used_at = now()
    where token = p_token;

  return query select v_user.id, v_user.role, v_invite.team_id, v_invite.brand_org_id;
end; $$;

grant execute on function redeem_invite(text) to authenticated;


-- update_team_member_split: team leads/admins only; enforces 50% cap.
create or replace function update_team_member_split(
  p_team_id bigint,
  p_creator_profile_id bigint,
  p_new_pct numeric
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller users;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_new_pct < 0 or p_new_pct > 50 then raise exception 'pct must be 0..50'; end if;
  select * into v_caller from users where auth_user_id = auth.uid();
  if not found then raise exception 'no user row'; end if;
  if v_caller.role not in ('team_lead','admin') then raise exception 'not authorized'; end if;
  if v_caller.role = 'team_lead' and not exists (
    select 1 from teams where id = p_team_id and owner_user_id = v_caller.id
  ) then raise exception 'you do not own this team'; end if;

  update team_members set team_take_pct = p_new_pct
    where team_id = p_team_id and creator_profile_id = p_creator_profile_id;
end; $$;

grant execute on function update_team_member_split(bigint, bigint, numeric) to authenticated;


-- compute_split: pure calculation, no writes. Used by the client + payout worker.
create or replace function compute_split(p_deliverable_id bigint, p_gross_cents bigint)
returns table (
  creator_pct numeric, team_pct numeric, platform_pct numeric,
  creator_cents bigint, team_cents bigint, platform_cents bigint,
  team_id bigint, team_owner_user_id bigint, creator_user_id bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_creator_profile_id bigint;
  v_creator_user_id bigint;
  v_team teams;
  v_pct numeric(5,2);
  v_platform_pct numeric(5,2);
  v_team_cents bigint;
  v_platform_cents bigint;
  v_creator_cents bigint;
begin
  select creator_profile_id into v_creator_profile_id from deliverables where id = p_deliverable_id;
  if v_creator_profile_id is null then raise exception 'deliverable not found'; end if;

  select user_id into v_creator_user_id from creator_profiles where id = v_creator_profile_id;

  select t.* into v_team
    from team_members tm
    join teams t on t.id = tm.team_id
    where tm.creator_profile_id = v_creator_profile_id and tm.status = 'active'
    order by tm.joined_at desc limit 1;

  select platform_take_pct into v_platform_pct from platform_config where id = 1;
  v_platform_pct := coalesce(v_platform_pct, 10.00);

  if v_team.id is null then
    -- No team: platform takes full 30% fallback
    v_pct := 0;
    v_platform_pct := 30.00;
  else
    select team_take_pct into v_pct from team_members
      where team_id = v_team.id and creator_profile_id = v_creator_profile_id;
    v_pct := coalesce(v_pct, v_team.default_team_take_pct);
  end if;

  v_team_cents := floor(p_gross_cents * v_pct / 100.0);
  v_platform_cents := floor(p_gross_cents * v_platform_pct / 100.0);
  v_creator_cents := p_gross_cents - v_team_cents - v_platform_cents;

  return query select
    (100 - v_pct - v_platform_pct)::numeric,
    v_pct, v_platform_pct,
    v_creator_cents, v_team_cents, v_platform_cents,
    v_team.id, v_team.owner_user_id, v_creator_user_id;
end; $$;

grant execute on function compute_split(bigint, bigint) to authenticated;
