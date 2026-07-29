-- Precense schema v0.4 — multi-channel identity (Telegram + WhatsApp + future).
-- Run in Supabase SQL editor.

-- 1. Make telegram_chat_id nullable — a user can now exist via WhatsApp OR Telegram OR both.
alter table users alter column telegram_chat_id drop not null;

-- 2. Add WhatsApp identifier.
alter table users add column if not exists whatsapp_phone text unique;
create index if not exists users_whatsapp_phone_idx on users (whatsapp_phone);

-- 3. Ensure every user has at least one channel identifier or an auth binding.
alter table users drop constraint if exists users_identity_check;
alter table users add constraint users_identity_check
  check (
    telegram_chat_id is not null
    or whatsapp_phone is not null
    or auth_user_id is not null
  );

-- 4. link_whatsapp_phone(phone) — analogous to link_telegram_handle
create or replace function link_whatsapp_phone(
  p_phone text,
  p_email text default null
)
returns table (id bigint, whatsapp_phone text, niche text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_normalized text := regexp_replace(p_phone, '\D', '', 'g'); -- digits only
  v_row users;
begin
  if v_auth_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Already linked?
  select * into v_row from users where auth_user_id = v_auth_uid;
  if found then
    return query select v_row.id, v_row.whatsapp_phone, v_row.niche;
    return;
  end if;

  select * into v_row from users where regexp_replace(coalesce(whatsapp_phone,''), '\D', '', 'g') = v_normalized;
  if not found then
    raise exception 'no whatsapp user found for phone "%"', p_phone;
  end if;

  if v_row.auth_user_id is not null and v_row.auth_user_id <> v_auth_uid then
    raise exception 'this whatsapp number is already linked to another account';
  end if;

  update users
    set auth_user_id = v_auth_uid,
        email = coalesce(p_email, email)
    where id = v_row.id;

  return query select v_row.id, v_row.whatsapp_phone, v_row.niche;
end;
$$;

grant execute on function link_whatsapp_phone(text, text) to authenticated;
