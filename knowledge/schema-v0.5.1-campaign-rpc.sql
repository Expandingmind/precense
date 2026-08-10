-- Precense v0.5.1 — create_campaign RPC (called from the brand dashboard).

create or replace function create_campaign(
  p_name text,
  p_brief text default null,
  p_target_hooks text[] default null,
  p_target_formats text[] default null,
  p_budget_cents bigint default null,
  p_currency text default 'USD'
)
returns table (id bigint, name text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_user users;
  v_new_id bigint;
begin
  if v_auth_uid is null then raise exception 'not authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'name required'; end if;

  select * into v_user from users where auth_user_id = v_auth_uid;
  if not found then raise exception 'no user row'; end if;
  if v_user.role <> 'brand' then raise exception 'only brand users can create campaigns'; end if;
  if v_user.active_brand_org_id is null then raise exception 'no active brand org'; end if;

  -- Confirm caller has membership in the org (owner/admin/member; not viewer)
  if not exists (
    select 1 from brand_org_members m
     where m.org_id = v_user.active_brand_org_id
       and m.user_id = v_user.id
       and m.role in ('owner','admin','member')
  ) then
    raise exception 'not authorized on this brand org';
  end if;

  insert into campaigns (brand_org_id, name, brief, target_hooks, target_formats, budget_cents, currency, status)
  values (
    v_user.active_brand_org_id,
    trim(p_name),
    nullif(trim(coalesce(p_brief, '')), ''),
    p_target_hooks,
    p_target_formats,
    p_budget_cents,
    coalesce(p_currency, 'USD'),
    'draft'
  )
  returning campaigns.id into v_new_id;

  return query select c.id, c.name, c.status from campaigns c where c.id = v_new_id;
end;
$$;

grant execute on function create_campaign(text, text, text[], text[], bigint, text) to authenticated;
