-- Migration 195: "View as" only applies in the browser tab it was started in (Aziz 11/4). Every tab sends its own id
-- (X-Tab-Id header, kept in sessionStorage through reloads); a view-as is saved for that tab only, so other tabs (and
-- Claude's checks in the same Chrome) keep seeing the app as you. One person can view as different people in different tabs.
-- Running this ends any view-as that's on right now (they weren't tied to a tab). Run after 194. Safe to re-run.
set client_min_messages = warning;

alter table view_as add column if not exists tab_id text;
delete from view_as where tab_id is null;
alter table view_as alter column tab_id set not null;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'view_as_pkey'
              and pg_get_constraintdef(oid) not like '%tab_id%') then
    alter table view_as drop constraint view_as_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'view_as_pkey') then
    alter table view_as add constraint view_as_pkey primary key (admin_email, tab_id);
  end if;
end $$;

-- the tab this request came from (null from the SQL editor, crons and anything that doesn't send it)
create or replace function request_tab() returns text
language sql stable set search_path = public as $$
  select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-tab-id', '')
$$;

create or replace function view_as_target() returns text
language sql stable security definer set search_path = public as $$
  select v.target_email from view_as v
   where v.admin_email = real_email() and v.tab_id = request_tab() and v.expires_at > now() and jwt_oauth()
     and exists (select 1 from app_users t where t.email = v.target_email)
   limit 1
$$;

-- same rules as 040 (Owners anyone but another Owner; module Admins people in their modules), now per tab
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
      if not exists (select 1 from module_access where email = me and module = 'sales' and level = 'admin') then raise exception 'Only Sales Admins can view as a customer'; end if;
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

create or replace function stop_view_as() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from view_as where admin_email = real_email() and (tab_id = request_tab() or expires_at < now());
end $$;
revoke execute on function start_view_as(text), stop_view_as() from public, anon;
grant execute on function start_view_as(text), stop_view_as() to authenticated;

select 'ok' as view_as_per_tab, (select count(*) from view_as) as open_view_as;
