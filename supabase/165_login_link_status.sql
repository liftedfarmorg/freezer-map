-- 165: Customer portal — old invite/reset links are never a dead end.
-- check_login_link only answers for unused, unexpired links. login_link_status also answers for used or
-- expired ones, so the portal can say "your login is already set up" and show sign-in with the email filled in.
--   status 'ok'      link still works (same as check_login_link)
--   status 'signin'  link used or expired, but this email already has a login -> sign in
--   status 'expired' link used up or expired and there's no login yet -> ask Lifted for a new invite
-- Returns null for a code that doesn't exist. Codes are 64 random hex characters, so only the person who was sent
-- the link can learn which email it was for. Safe to re-run.

create or replace function login_link_status(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'status', case when l.used_at is null and l.expires_at > now() then 'ok'
                          when u.auth_id is not null then 'signin'
                          else 'expired' end,
           'kind', l.kind, 'email', l.email, 'display_name', u.display_name,
           'customer_name', (select name from customers where id = u.customer_id))
    from login_links l join app_users u on u.email = l.email
   where l.code = p_code and u.role = 'customer'
$$;

revoke execute on function login_link_status(text) from public;
grant execute on function login_link_status(text) to anon, authenticated;
