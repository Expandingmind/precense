-- Precense v0.6.1 — public waitlist capture for the landing page.

create table if not exists invite_requests (
  id bigserial primary key,
  email text not null unique,
  handle text,
  role text not null default 'creator'
    check (role in ('creator','team_lead','brand')),
  source text,
  notes text,
  requested_at timestamptz not null default now(),
  reviewed boolean not null default false,
  invited_at timestamptz
);

create index if not exists invite_requests_reviewed_idx on invite_requests (reviewed, requested_at desc);
