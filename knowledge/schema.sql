-- Precense schema — v0.2 (knowledge architecture)
-- Run in Supabase SQL editor. Safe to run against the v0.1 schema (drops old `videos`).
-- After this migration, the bot uses `submissions` + `user_signature` instead of `videos`.

-- 1. USERS — add niche + handle
alter table users add column if not exists niche text not null default 'app-ugc';
alter table users add column if not exists handle text;
-- Backfill handle from telegram_username if present
update users set handle = telegram_username where handle is null and telegram_username is not null;

-- 2. SUBMISSIONS — replaces the old `videos` table
drop table if exists videos cascade;

create table if not exists submissions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  source text not null,
  url_or_file_id text not null,
  submitted_at timestamptz not null default now(),
  extracted_features jsonb,
  metrics jsonb,
  precense_reply text
);

create index if not exists submissions_user_time_idx on submissions (user_id, submitted_at desc);
create index if not exists submissions_features_idx on submissions using gin (extracted_features);

-- 3. USER_SIGNATURE — one row per user
create table if not exists user_signature (
  user_id bigint primary key references users(id) on delete cascade,
  summary jsonb not null,
  updated_at timestamptz not null default now()
);
