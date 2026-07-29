-- Precense — v0.3: link auth accounts to Telegram-created users.
-- Run in Supabase SQL editor.

-- 1. Add auth_user_id column to users (nullable — Telegram-first flows won't have it initially)
alter table users add column if not exists auth_user_id uuid unique;
alter table users add column if not exists email text;
create index if not exists users_auth_user_id_idx on users (auth_user_id);

-- 2. Function: link the authenticated user to an existing Telegram-created row by handle.
--    Called from the app after first sign-in to bind the Google/Apple identity to
--    the Telegram-created users row.
create or replace function link_telegram_handle(
  p_handle text,
  p_email text default null
)
returns table (id bigint, handle text, telegram_chat_id bigint, niche text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_normalized text := lower(regexp_replace(p_handle, '^@', ''));
  v_row users;
begin
  if v_auth_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Reject if this auth user is already linked to a different row
  select * into v_row from users where auth_user_id = v_auth_uid;
  if found then
    return query select v_row.id, v_row.handle, v_row.telegram_chat_id, v_row.niche;
    return;
  end if;

  -- Look up by handle
  select * into v_row from users where lower(handle) = v_normalized;
  if not found then
    raise exception 'no telegram user found for handle "%"', p_handle;
  end if;

  -- Refuse to steal an already-linked row
  if v_row.auth_user_id is not null and v_row.auth_user_id <> v_auth_uid then
    raise exception 'this telegram handle is already linked to another account';
  end if;

  update users
    set auth_user_id = v_auth_uid,
        email = coalesce(p_email, email)
    where id = v_row.id;

  return query
    select v_row.id, v_row.handle, v_row.telegram_chat_id, v_row.niche;
end;
$$;

grant execute on function link_telegram_handle(text, text) to authenticated;

-- 3. Function: create a placeholder users row for auth-first signups (no Telegram yet)
create or replace function ensure_auth_user_row(
  p_email text default null,
  p_first_name text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_auth_uid is null then
    raise exception 'not authenticated';
  end if;

  select id into v_id from users where auth_user_id = v_auth_uid;
  if found then return v_id; end if;

  insert into users (auth_user_id, email, first_name, telegram_chat_id)
    values (v_auth_uid, p_email, p_first_name, -abs(hashtext(v_auth_uid::text)))
    returning id into v_id;

  return v_id;
end;
$$;

grant execute on function ensure_auth_user_row(text, text) to authenticated;
