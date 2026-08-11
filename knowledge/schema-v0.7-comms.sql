-- Precense schema v0.7 — comms MVP (profiles, friends, chats, presence, push, moderation).
-- Additive on top of v0.6.1. Safe to re-run.

------------------------------------------------------------------------
-- 1. USERS additions for the comms shape
------------------------------------------------------------------------

alter table users add column if not exists display_name text;
alter table users add column if not exists avatar_url text;
alter table users add column if not exists bio text;
alter table users add column if not exists last_seen_at timestamptz;

-- Backfill display_name from what we already have.
update users
   set display_name = coalesce(display_name, first_name, handle, split_part(email, '@', 1))
 where display_name is null;

create index if not exists users_display_name_idx on users (lower(display_name));
create index if not exists users_email_lower_idx on users (lower(email));


------------------------------------------------------------------------
-- 2. FRIENDSHIPS (undirected; canonical low_user_id < high_user_id)
------------------------------------------------------------------------

create table if not exists friendships (
  requester_user_id bigint not null references users(id) on delete cascade,
  addressee_user_id bigint not null references users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_user_id, addressee_user_id),
  check (requester_user_id <> addressee_user_id)
);

create index if not exists friendships_addressee_idx
  on friendships (addressee_user_id, status);
create index if not exists friendships_requester_idx
  on friendships (requester_user_id, status);


------------------------------------------------------------------------
-- 3. CONVERSATIONS + MEMBERS
------------------------------------------------------------------------

create table if not exists conversations (
  id bigserial primary key,
  kind text not null check (kind in ('dm','group','announcement')),
  title text,                     -- group name; null for DMs
  created_by_user_id bigint references users(id) on delete set null,
  avatar_url text,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists conversations_last_msg_idx on conversations (last_message_at desc);

create table if not exists conversation_members (
  conversation_id bigint not null references conversations(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  muted boolean not null default false,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on conversation_members (user_id);


------------------------------------------------------------------------
-- 4. MESSAGES + ATTACHMENTS + REACTIONS
------------------------------------------------------------------------

create table if not exists messages (
  id bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  sender_user_id bigint references users(id) on delete set null,
  body text,
  kind text not null default 'text'
    check (kind in ('text','system','announcement')),
  reply_to_id bigint references messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_convo_time_idx on messages (conversation_id, created_at desc);

create table if not exists message_attachments (
  id bigserial primary key,
  message_id bigint not null references messages(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  bytes bigint,
  width int,
  height int,
  duration_ms int,
  thumbnail_path text,
  created_at timestamptz not null default now()
);

create index if not exists message_attachments_msg_idx on message_attachments (message_id);

create table if not exists message_reactions (
  message_id bigint not null references messages(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);


------------------------------------------------------------------------
-- 5. PRESENCE + TYPING (typing lives in ephemeral broadcast channels; presence persists last_seen)
------------------------------------------------------------------------

-- presence uses users.last_seen_at + Realtime presence channel; no dedicated table.


------------------------------------------------------------------------
-- 6. WEB PUSH SUBSCRIPTIONS
------------------------------------------------------------------------

create table if not exists push_subscriptions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);


------------------------------------------------------------------------
-- 7. MODERATION (blocks + reports)
------------------------------------------------------------------------

create table if not exists user_blocks (
  blocker_user_id bigint not null references users(id) on delete cascade,
  blocked_user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create table if not exists reports (
  id bigserial primary key,
  reporter_user_id bigint not null references users(id) on delete set null,
  reported_user_id bigint references users(id) on delete set null,
  message_id bigint references messages(id) on delete set null,
  reason text not null,
  detail text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id bigint references users(id) on delete set null
);

create index if not exists reports_status_idx on reports (status, created_at desc);


------------------------------------------------------------------------
-- 8. RPCs
------------------------------------------------------------------------

-- Guarantee a users row exists for the signed-in auth user (no invite required for MVP-1).
create or replace function ensure_comms_user()
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_auth uuid := auth.uid();
  v_id bigint;
  v_email text;
  v_meta jsonb;
begin
  if v_auth is null then raise exception 'not authenticated'; end if;

  select id into v_id from users where auth_user_id = v_auth;
  if v_id is not null then
    update users set last_seen_at = now() where id = v_id;
    return v_id;
  end if;

  select email, raw_user_meta_data into v_email, v_meta
    from auth.users where id = v_auth;

  insert into users (auth_user_id, email, first_name, display_name, avatar_url,
                     telegram_chat_id, role, onboarded_at, last_seen_at)
    values (
      v_auth,
      v_email,
      coalesce(v_meta->>'given_name', split_part(coalesce(v_meta->>'name',''), ' ', 1), split_part(v_email, '@', 1)),
      coalesce(v_meta->>'name', v_meta->>'full_name', split_part(v_email, '@', 1)),
      v_meta->>'avatar_url',
      -abs(hashtext(v_auth::text)),
      'regular',
      now(),
      now()
    )
    returning id into v_id;

  return v_id;
end; $$;

grant execute on function ensure_comms_user() to authenticated;

-- Expand role check to include 'regular' (legacy 'creator' still valid).
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('regular','creator','brand','team_lead','admin'));


-- Update profile fields (self-edit only).
create or replace function update_profile(
  p_display_name text default null,
  p_bio text default null,
  p_avatar_url text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  update users
     set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
         bio = coalesce(p_bio, bio),
         avatar_url = coalesce(p_avatar_url, avatar_url)
   where id = v_uid;
end; $$;

grant execute on function update_profile(text, text, text) to authenticated;


-- Send friend request (idempotent-ish).
create or replace function send_friend_request(p_addressee_user_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_uid = p_addressee_user_id then raise exception 'cannot friend yourself'; end if;
  if exists (select 1 from user_blocks where blocker_user_id = p_addressee_user_id and blocked_user_id = v_uid) then
    raise exception 'not permitted';
  end if;
  insert into friendships (requester_user_id, addressee_user_id, status)
    values (v_uid, p_addressee_user_id, 'pending')
    on conflict (requester_user_id, addressee_user_id) do nothing;
end; $$;
grant execute on function send_friend_request(bigint) to authenticated;


-- Respond to a request.
create or replace function respond_friend_request(p_requester_user_id bigint, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  update friendships
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where requester_user_id = p_requester_user_id
     and addressee_user_id = v_uid
     and status = 'pending';
end; $$;
grant execute on function respond_friend_request(bigint, boolean) to authenticated;


-- Block/unblock.
create or replace function block_user(p_user_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into user_blocks (blocker_user_id, blocked_user_id)
    values (v_uid, p_user_id) on conflict do nothing;
  -- Tear down any friendship.
  delete from friendships
    where (requester_user_id = v_uid and addressee_user_id = p_user_id)
       or (requester_user_id = p_user_id and addressee_user_id = v_uid);
end; $$;
grant execute on function block_user(bigint) to authenticated;

create or replace function unblock_user(p_user_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  delete from user_blocks where blocker_user_id = v_uid and blocked_user_id = p_user_id;
end; $$;
grant execute on function unblock_user(bigint) to authenticated;


-- Get-or-create a 1:1 DM with another user.
create or replace function open_dm(p_other_user_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_uid bigint; v_conv_id bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_uid = p_other_user_id then raise exception 'cannot DM yourself'; end if;
  if exists (select 1 from user_blocks
             where (blocker_user_id = v_uid and blocked_user_id = p_other_user_id)
                or (blocker_user_id = p_other_user_id and blocked_user_id = v_uid)) then
    raise exception 'not permitted';
  end if;

  -- Find an existing DM with exactly these two members.
  select c.id into v_conv_id
    from conversations c
    where c.kind = 'dm'
      and 2 = (select count(*) from conversation_members m where m.conversation_id = c.id)
      and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = v_uid)
      and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = p_other_user_id)
    limit 1;

  if v_conv_id is not null then return v_conv_id; end if;

  insert into conversations (kind, created_by_user_id) values ('dm', v_uid) returning id into v_conv_id;
  insert into conversation_members (conversation_id, user_id, role)
    values (v_conv_id, v_uid, 'owner'), (v_conv_id, p_other_user_id, 'member');
  return v_conv_id;
end; $$;
grant execute on function open_dm(bigint) to authenticated;


-- Create a group chat with an initial member list.
create or replace function create_group(p_title text, p_user_ids bigint[])
returns bigint language plpgsql security definer set search_path = public as $$
declare v_uid bigint; v_conv_id bigint; v_other bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title required'; end if;

  insert into conversations (kind, title, created_by_user_id)
    values ('group', trim(p_title), v_uid) returning id into v_conv_id;
  insert into conversation_members (conversation_id, user_id, role)
    values (v_conv_id, v_uid, 'owner');
  if p_user_ids is not null then
    foreach v_other in array p_user_ids loop
      if v_other <> v_uid then
        insert into conversation_members (conversation_id, user_id, role)
          values (v_conv_id, v_other, 'member') on conflict do nothing;
      end if;
    end loop;
  end if;
  return v_conv_id;
end; $$;
grant execute on function create_group(text, bigint[]) to authenticated;


-- Send a message.
create or replace function send_message(p_conversation_id bigint, p_body text, p_kind text default 'text', p_reply_to bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_uid bigint; v_msg_id bigint; v_convo conversations;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and user_id = v_uid) then
    raise exception 'not a member';
  end if;
  select * into v_convo from conversations where id = p_conversation_id;

  -- Announcement channels: only admins/team_leads can post.
  if v_convo.kind = 'announcement' then
    if not exists (select 1 from users where id = v_uid and role in ('admin','team_lead')) then
      raise exception 'only admins/team_leads can post announcements';
    end if;
  end if;

  if (p_body is null or length(trim(p_body)) = 0) then raise exception 'body required'; end if;

  insert into messages (conversation_id, sender_user_id, body, kind, reply_to_id)
    values (p_conversation_id, v_uid, p_body, coalesce(p_kind, 'text'), p_reply_to)
    returning id into v_msg_id;

  update conversations set last_message_at = now() where id = p_conversation_id;
  return v_msg_id;
end; $$;
grant execute on function send_message(bigint, text, text, bigint) to authenticated;


-- Attach a file to a just-created message.
create or replace function attach_to_message(p_message_id bigint, p_storage_path text, p_mime text default null, p_bytes bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_uid bigint; v_att_id bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from messages m where m.id = p_message_id and m.sender_user_id = v_uid) then
    raise exception 'not your message';
  end if;
  insert into message_attachments (message_id, storage_path, mime_type, bytes)
    values (p_message_id, p_storage_path, p_mime, p_bytes)
    returning id into v_att_id;
  return v_att_id;
end; $$;
grant execute on function attach_to_message(bigint, text, text, bigint) to authenticated;


-- Mark a conversation as read up to now().
create or replace function mark_read(p_conversation_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  update conversation_members set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = v_uid;
end; $$;
grant execute on function mark_read(bigint) to authenticated;


-- React / unreact.
create or replace function toggle_reaction(p_message_id bigint, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from message_reactions where message_id = p_message_id and user_id = v_uid and emoji = p_emoji) then
    delete from message_reactions where message_id = p_message_id and user_id = v_uid and emoji = p_emoji;
  else
    insert into message_reactions (message_id, user_id, emoji) values (p_message_id, v_uid, p_emoji);
  end if;
end; $$;
grant execute on function toggle_reaction(bigint, text) to authenticated;


-- Report a message or user.
create or replace function file_report(p_reason text, p_detail text default null, p_message_id bigint default null, p_reported_user_id bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_uid bigint; v_id bigint;
begin
  select id into v_uid from users where auth_user_id = auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into reports (reporter_user_id, reported_user_id, message_id, reason, detail)
    values (v_uid, p_reported_user_id, p_message_id, coalesce(p_reason, 'unspecified'), p_detail)
    returning id into v_id;
  return v_id;
end; $$;
grant execute on function file_report(text, text, bigint, bigint) to authenticated;


-- Admin: promote user to team_lead / demote back to regular.
create or replace function admin_set_role(p_user_id bigint, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_caller users;
begin
  select * into v_caller from users where auth_user_id = auth.uid();
  if not found or v_caller.role <> 'admin' then raise exception 'admin only'; end if;
  if p_role not in ('regular','team_lead') then raise exception 'invalid role for this action'; end if;
  update users set role = p_role where id = p_user_id;
end; $$;
grant execute on function admin_set_role(bigint, text) to authenticated;


-- Admin: remove a member from a group.
create or replace function admin_remove_from_group(p_conversation_id bigint, p_user_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_caller users;
begin
  select * into v_caller from users where auth_user_id = auth.uid();
  if not found or v_caller.role not in ('admin','team_lead') then raise exception 'not authorized'; end if;
  delete from conversation_members where conversation_id = p_conversation_id and user_id = p_user_id;
end; $$;
grant execute on function admin_remove_from_group(bigint, bigint) to authenticated;


-- People search (name/email/handle contains) — excludes blocked-by and blocks.
create or replace function search_people(p_query text, p_limit int default 20)
returns table (id bigint, display_name text, handle text, avatar_url text, role text)
language sql stable security definer set search_path = public as $$
  with me as (select id from users where auth_user_id = auth.uid())
  select u.id, u.display_name, u.handle, u.avatar_url, u.role
    from users u, me
    where u.id <> me.id
      and (p_query is null or p_query = '' or
           lower(coalesce(u.display_name,'')) like '%' || lower(p_query) || '%'
        or lower(coalesce(u.handle,'')) like '%' || lower(p_query) || '%'
        or lower(coalesce(u.email,'')) like '%' || lower(p_query) || '%')
      and not exists (select 1 from user_blocks b
                       where (b.blocker_user_id = me.id and b.blocked_user_id = u.id)
                          or (b.blocker_user_id = u.id and b.blocked_user_id = me.id))
    order by (u.display_name is null), u.display_name
    limit greatest(1, least(coalesce(p_limit,20), 50));
$$;
grant execute on function search_people(text, int) to authenticated;


------------------------------------------------------------------------
-- 9. ANNOUNCEMENTS CHANNEL — one global channel every user joins on ensure_comms_user
------------------------------------------------------------------------

-- Create the singleton announcement conversation if missing.
insert into conversations (id, kind, title, created_by_user_id)
  select 1, 'announcement', 'Precense Announcements', null
  where not exists (select 1 from conversations where id = 1);

-- Auto-add every existing user (idempotent).
insert into conversation_members (conversation_id, user_id, role)
  select 1, u.id, 'member' from users u
  on conflict (conversation_id, user_id) do nothing;

-- Trigger: whenever a new users row lands, add them to the announcement channel.
create or replace function _add_new_user_to_announcements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into conversation_members (conversation_id, user_id, role)
    values (1, new.id, 'member') on conflict do nothing;
  return new;
end; $$;

drop trigger if exists trg_add_new_user_to_announcements on users;
create trigger trg_add_new_user_to_announcements
  after insert on users for each row execute function _add_new_user_to_announcements();
