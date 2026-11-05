-- 203: portal logins on the customer card (Msg R-208, 11/4).
--  * The customer card (Settings > Customers) lists the people who log in for that customer, with their login status.
--  * Add a login from the card (email, name, phone), make the invite or password reset link, or turn a login off.
--  * Who can: Owners, the Admin module, and Sales Admins. Everyone with Sales or Admin can see the list.
--  * make_login_link: Sales Admins can now make links too (still customer logins only).
-- Run live by Claude 11/4. Safe to re-run.
begin;
create or replace function can_manage_customer_logins() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_owner(), false) or coalesce(is_admin(), false) or coalesce(mod_level('sales') = 'admin', false)
$$;

create or replace function customer_logins(p_customer int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff();
  if not (can_manage_customer_logins() or mod_level('sales') is not null) then
    return jsonb_build_object('can_edit', false, 'users', '[]'::jsonb);
  end if;
  return jsonb_build_object('can_edit', can_manage_customer_logins(), 'users', coalesce((
    select jsonb_agg(jsonb_build_object('email', u.email, 'name', u.display_name, 'phone', u.phone, 'last_seen', u.last_seen,
             'claimed', u.auth_id is not null,
             'invited_at', (select max(l.created_at) from login_links l where l.email = u.email and l.kind = 'invite'))
           order by u.display_name nulls last, u.email)
      from app_users u where u.customer_id = p_customer and u.role = 'customer'), '[]'::jsonb));
end $$;
revoke all on function customer_logins(int) from public, anon;
grant execute on function customer_logins(int) to authenticated;

create or replace function save_customer_login(p_customer int, p_email text, p_name text default null, p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, ''))); was app_users; c customers;
begin
  perform no_view_as();
  if not can_manage_customer_logins() then raise exception 'Only Sales Admins, Admins and Owners can add customer logins'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn''t look right'; end if;
  select * into c from customers where id = p_customer;
  if c.id is null or c.kind <> 'external' then raise exception 'Pick a customer'; end if;
  select * into was from app_users where email = e;
  if was.email is not null and was.role in ('admin', 'sales', 'crew') then raise exception '% is Lifted staff, not a customer login', e; end if;
  if was.email is not null and was.role = 'customer' and was.customer_id is distinct from p_customer then
    raise exception '% already logs in for %. Turn that login off first.', e, (select name from customers where id = was.customer_id);
  end if;
  insert into app_users (email, role, customer_id, display_name, phone, added_by, login_kind)
  values (e, 'customer', p_customer, nullif(trim(coalesce(p_name, '')), ''), nullif(trim(coalesce(p_phone, '')), ''), current_email(), 'email')
  on conflict (email) do update
    set role = 'customer', customer_id = p_customer,
        display_name = coalesce(excluded.display_name, app_users.display_name),
        phone = coalesce(excluded.phone, app_users.phone),
        updated_at = now();
  delete from module_access where email = e;
end $$;
revoke all on function save_customer_login(int, text, text, text) from public, anon;
grant execute on function save_customer_login(int, text, text, text) to authenticated;

create or replace function remove_customer_login(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare u app_users;
begin
  perform no_view_as();
  if not can_manage_customer_logins() then raise exception 'Only Sales Admins, Admins and Owners can turn off customer logins'; end if;
  select * into u from app_users where email = lower(trim(p_email));
  if u.email is null or u.role <> 'customer' then raise exception 'Not a customer login'; end if;
  update app_users set role = 'none', customer_id = null, updated_at = now() where email = u.email;
  update login_links set expires_at = least(expires_at, now()) where email = u.email and used_at is null;
end $$;
revoke all on function remove_customer_login(text) from public, anon;
grant execute on function remove_customer_login(text) to authenticated;

do $$
declare d text;
begin
  d := pg_get_functiondef('make_login_link(text, text)'::regprocedure);
  if position('can_manage_customer_logins()' in d) > 0 then raise notice 'make_login_link already patched'; return; end if;
  if position('if not is_admin() then raise exception ''Only an admin can make login links''; end if;' in d) = 0 then
    raise exception 'make_login_link is not what this expects; nothing changed';
  end if;
  d := replace(d, 'if not is_admin() then raise exception ''Only an admin can make login links''; end if;',
                  'if not can_manage_customer_logins() then raise exception ''Only Sales Admins, Admins and Owners can make login links''; end if;');
  execute d;
end $$;
commit;

select position('can_manage_customer_logins()' in pg_get_functiondef('make_login_link(text, text)'::regprocedure)) > 0 as links_for_sales_admins;
