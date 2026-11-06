-- 217: Pick which notifications you get (Msg #244, Aziz 11/5). Each person (or an Admin for them, e.g. a driver-only login)
-- turns types on or off: delivery problems, METRC follow-ups, put on a load, load leaving, other module alerts.
-- Plus the channels from 216 (push / email / text). Notification emails will come from noreply@lifted-organics.com
-- (email stays off until CCI grants Mail.Send and the mailbox exists).
-- Safe to re-run.
begin;

update app_settings set value = 'noreply@lifted-organics.com' where key = 'notify.email_from' and coalesce(value, '') = '';
insert into app_settings (key, value) values ('notify.email_from', 'noreply@lifted-organics.com') on conflict (key) do nothing;

-- which type a message is (My settings › Notifications)
create or replace function _notify_type(p_kind text) returns text
language sql immutable as $$
  select case when p_kind = 'stop_outcome' then 't_delivery' when p_kind = 'stop_metrc' then 't_metrc'
              when p_kind = 'driver_load' then 't_load_assigned' when p_kind = 'driver_depart' then 't_load_left' else 't_other' end
$$;

create or replace function _notify(p_emails text[], p_title text, p_body text, p_url text, p_kind text, p_ref jsonb default '{}') returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0; ty text := _notify_type(p_kind);
begin
  for u in select a.email, a.phone, coalesce(a.prefs -> 'notify', '{}'::jsonb) as nf from app_users a
            where a.email = any(p_emails) and a.role in ('admin', 'sales', 'crew') loop
    if not coalesce((u.nf ->> ty)::boolean, true) then continue; end if;      -- they turned this type off
    if coalesce((u.nf ->> 'alerts_push')::boolean, true) and exists (select 1 from push_subs s where s.email = u.email) then
      insert into push_outbox (email, title, body, url, tag, kind) values (u.email, p_title, p_body, p_url, p_kind || ':' || coalesce(p_ref ->> 'stop_id', p_ref ->> 'load_id', ''), p_kind);
      n := n + 1;
    end if;
    if coalesce((u.nf ->> 'alerts_email')::boolean, false) then
      insert into email_outbox (to_email, subject, body, kind, ref) values (u.email, p_title, coalesce(p_body, '') || coalesce(E'\n\n' || p_url, ''), p_kind, p_ref);
    end if;
    if coalesce((u.nf ->> 'alerts_text')::boolean, false) and nullif(trim(coalesce(u.phone, '')), '') is not null then
      insert into sms_outbox (to_phone, to_email, body, kind, ref) values (u.phone, u.email, p_title || coalesce(': ' || p_body, ''), p_kind, p_ref);
    end if;
  end loop;
  return n;
end $$;
revoke all on function _notify(text[], text, text, text, text, jsonb) from public, anon, authenticated;

-- an Admin sets someone's notifications (a driver-only login has no My settings)
create or replace function set_user_notify(p_email text, p_notify jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, ''))); k text; out jsonb;
begin
  perform no_view_as();
  if not (is_owner() or is_any_admin() or fleet_dept_admin('distribution')) then raise exception 'Only Admins and Owners can set someone else''s notifications'; end if;
  for k in select jsonb_object_keys(coalesce(p_notify, '{}')) loop
    if k not in ('alerts_push', 'alerts_email', 'alerts_text', 't_delivery', 't_metrc', 't_load_assigned', 't_load_left', 't_other') then raise exception 'Unknown setting %', k; end if;
  end loop;
  update app_users set prefs = jsonb_set(prefs, '{notify}', coalesce(prefs -> 'notify', '{}'::jsonb) || coalesce(p_notify, '{}')), updated_at = now()
   where email = e returning prefs -> 'notify' into out;
  if out is null then raise exception 'No one with that email'; end if;
  insert into events (user_email, type, note, details) values (current_email(), 'user_notify', e, jsonb_build_object('email', e, 'notify', p_notify));
  return out;
end $$;
revoke all on function set_user_notify(text, jsonb) from public, anon;
grant execute on function set_user_notify(text, jsonb) to authenticated;

-- your own: just the notify part (the Driver screen saves here; other settings stay as they are)
create or replace function set_my_notify(p_notify jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text; out jsonb;
begin
  perform no_view_as();
  for k in select jsonb_object_keys(coalesce(p_notify, '{}')) loop
    if k not in ('alerts_push', 'alerts_email', 'alerts_text', 't_delivery', 't_metrc', 't_load_assigned', 't_load_left', 't_other', 'requests', 'orders', 'metrc_pull') then raise exception 'Unknown setting %', k; end if;
  end loop;
  update app_users set prefs = jsonb_set(prefs, '{notify}', coalesce(prefs -> 'notify', '{}'::jsonb) || coalesce(p_notify, '{}')), updated_at = now()
   where email = jwt_email() returning prefs into out;
  return out;
end $$;
revoke all on function set_my_notify(jsonb) from public, anon;
grant execute on function set_my_notify(jsonb) to authenticated;

commit;
