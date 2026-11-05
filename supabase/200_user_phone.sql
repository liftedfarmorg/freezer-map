-- 200: phone numbers on people (Msg R-203, 11/4). L-1104-5 couldn't depart: "Add Kris DiNoto's phone" while he had one
-- (a second Kris with no phone, added from the Reefer manifests in 188, was picked first; that one is turned off).
--  * app_users.phone: set in My settings (your own) or Admin > People (anyone). The METRC manifest's phone for questions is the
--    driver's phone (Vehicles > Drivers), else the phone of the person with that name or email, else the default in Settings
--    (comp.metrc_phone, now Aziz's 831-999-0037), else METRC's default. A missing phone no longer blocks a load.
-- Run live by Claude 11/4. Safe to re-run.
begin;
alter table app_users add column if not exists phone text;

insert into app_settings (key, value) values ('comp.metrc_phone', '831-999-0037')
  on conflict (key) do update set value = coalesce(nullif(app_settings.value, ''), excluded.value);

create or replace function my_phone() returns text
language sql stable security definer set search_path = public as $$
  select phone from app_users where email = current_email()
$$;
revoke all on function my_phone() from public, anon;
grant execute on function my_phone() to authenticated;

create or replace function set_my_phone(p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_staff();
  perform no_view_as();
  update app_users set phone = nullif(trim(coalesce(p_phone, '')), ''), updated_at = now() where email = current_email();
end $$;
revoke all on function set_my_phone(text) from public, anon;
grant execute on function set_my_phone(text) to authenticated;

create or replace function set_user_phone(p_email text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_staff();
  perform no_view_as();
  if not (is_owner() or mod_level('admin') is not null or lower(p_email) = lower(current_email())) then raise exception 'Only Admin can change someone else''s phone'; end if;
  update app_users set phone = nullif(trim(coalesce(p_phone, '')), ''), updated_at = now() where lower(email) = lower(trim(p_email));
end $$;
revoke all on function set_user_phone(text, text) from public, anon;
grant execute on function set_user_phone(text, text) to authenticated;

-- the phone for a driver's METRC manifest: theirs (Vehicles > Drivers), else the person in the app with that name or email
create or replace function metrc_driver_phone(p_name text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(trim(d.phone), '') from fleet_drivers d where d.active and lower(trim(d.name)) = lower(trim(p_name)) and nullif(trim(d.phone), '') is not null
      order by d.carrier_id nulls first, d.id limit 1),
    (select nullif(trim(u.phone), '') from app_users u where nullif(trim(u.phone), '') is not null
        and (lower(trim(u.display_name)) = lower(trim(p_name))
             or lower(u.email) in (select lower(d.email) from fleet_drivers d where d.active and lower(trim(d.name)) = lower(trim(p_name)) and d.email is not null))
      order by u.email limit 1))
$$;
revoke all on function metrc_driver_phone(text) from public, anon, authenticated;
grant execute on function metrc_driver_phone(text) to service_role;
commit;

select (select value from app_settings where key = 'comp.metrc_phone') as default_phone, metrc_driver_phone('Kris DiNoto') as kris;
