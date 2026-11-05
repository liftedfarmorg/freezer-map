-- 208: customer logins in Sales settings + View as from the customer card (Msg R-211, 11/4).
--  * customer_logins(p_customer) also says whether you can View as (can_view_as).
--  * all_customer_logins(): every customer login across all customers, for Sales > Settings > Customer logins.
--    Owners, the Admin module and Sales Admins get the list with Add / Invite / Turn off / View as.
--  * start_view_as: the Admin module can now View as a customer login too (before 207 only Owners and Sales Admins could).
--    Sales Users still can't. All other View as rules unchanged (195).
-- Run after 207. Run live by Claude 11/4 (first saved as 207, renamed: another session took 207). Safe to re-run.
set client_min_messages = warning;
begin;

-- who can View as a customer login: Owners, the Admin module, Sales Admins (checked on the real person, not a view-as target)
create or replace function can_view_as_customers() returns boolean
language sql stable security definer set search_path = public as $$
  select jwt_oauth() and (
    exists (select 1 from app_users where email = real_email() and owner)
    or exists (select 1 from module_access where email = real_email() and module = 'admin' and level in ('user','admin'))
    or exists (select 1 from module_access where email = real_email() and module = 'sales' and level = 'admin'))
$$;
revoke all on function can_view_as_customers() from public, anon;
grant execute on function can_view_as_customers() to authenticated;

create or replace function customer_logins(p_customer int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff();
  if not (can_manage_customer_logins() or mod_level('sales') is not null) then
    return jsonb_build_object('can_edit', false, 'can_view_as', false, 'users', '[]'::jsonb);
  end if;
  return jsonb_build_object('can_edit', can_manage_customer_logins(), 'can_view_as', can_view_as_customers(), 'users', coalesce((
    select jsonb_agg(jsonb_build_object('email', u.email, 'name', u.display_name, 'phone', u.phone, 'last_seen', u.last_seen,
             'claimed', u.auth_id is not null,
             'invited_at', (select max(l.created_at) from login_links l where l.email = u.email and l.kind = 'invite'))
           order by u.display_name nulls last, u.email)
      from app_users u where u.customer_id = p_customer and u.role = 'customer'), '[]'::jsonb));
end $$;
revoke all on function customer_logins(int) from public, anon;
grant execute on function customer_logins(int) to authenticated;

create or replace function all_customer_logins() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff();
  if not (can_manage_customer_logins() or mod_level('sales') is not null) then
    return jsonb_build_object('can_edit', false, 'can_view_as', false, 'users', '[]'::jsonb);
  end if;
  return jsonb_build_object('can_edit', can_manage_customer_logins(), 'can_view_as', can_view_as_customers(), 'users', coalesce((
    select jsonb_agg(jsonb_build_object('email', u.email, 'name', u.display_name, 'phone', u.phone, 'last_seen', u.last_seen,
             'claimed', u.auth_id is not null, 'customer_id', c.id, 'customer', c.name,
             'invited_at', (select max(l.created_at) from login_links l where l.email = u.email and l.kind = 'invite'))
           order by c.name, u.display_name nulls last, u.email)
      from app_users u join customers c on c.id = u.customer_id
     where u.role = 'customer'), '[]'::jsonb));
end $$;
revoke all on function all_customer_logins() from public, anon;
grant execute on function all_customer_logins() to authenticated;

-- same as 195, except the customer check uses can_view_as_customers()
create or replace function start_view_as(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare t app_users; me text := real_email(); own boolean; tab text := request_tab();
begin
  if not jwt_oauth() then raise exception 'Only staff can use View as'; end if;
  if tab is null then raise exception 'Reload the app and try View as again'; end if;
  own := exists (select 1 from app_users where email = me and owner);
  select * into t from app_users where email = lower(trim(p_email));
  if t.email is null then raise exception 'User not found'; end if;
  if t.owner then raise exception 'You can''t view as an Owner'; end if;
  if not own then
    if exists (select 1 from module_access where email = t.email and level = 'admin') then raise exception 'You can''t view as another Admin'; end if;
    if t.role = 'customer' then
      if not can_view_as_customers() then raise exception 'Only Sales Admins, Admins and Owners can view as a customer'; end if;
    elsif not exists (select 1 from module_access a join module_access b on b.module = a.module
                       where a.email = me and a.level = 'admin' and a.module <> 'admin' and b.email = t.email) then
      raise exception 'You can only view as people who use a module you''re an Admin of';
    end if;
  end if;
  delete from view_as where expires_at < now();
  insert into view_as (admin_email, tab_id, target_email) values (me, tab, t.email)
  on conflict (admin_email, tab_id) do update set target_email = excluded.target_email, started_at = now(), expires_at = now() + interval '2 hours';
  insert into events (user_email, type, note, details)
  values (me, 'view_as', t.email, jsonb_build_object('target', t.email, 'role', t.role, 'tab', left(tab, 8)));
end $$;
revoke execute on function start_view_as(text) from public, anon;
grant execute on function start_view_as(text) to authenticated;

commit;
select 'ok' as customer_logins_view_as, (select count(*) from app_users where role = 'customer') as customer_logins;
