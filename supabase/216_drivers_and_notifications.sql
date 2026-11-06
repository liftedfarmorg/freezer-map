-- 216: Drivers as app users, one person on several driver cards, rescheduled orders back to Ready, and notifications
-- (push now; email and texts queued until they're connected). Msg #243, Aziz 11/5.
--  * A person can be on more than one driver card (Kris: ours, and Reefer Trucking's). Every card with their login email
--    shows on their Driver screen; a load on a carrier card says "Driving for Reefer Trucking".
--  * Driver cards fill in their app login by name (Leland, Rama); Admin › Users and Vehicles › Drivers can make any app user
--    a driver (a driver card is made for them). With no modules, that's a driver-only login.
--  * Rescheduled (Not delivered) stop: once everything from it is received back, its orders go back to Ready (off the old load).
--    The invoice made at Depart stays; Depart again uses the same one.
--  * Notifications: delivery alerts and "you're driving L-xxx" go out as push to phones / computers that turned it on.
--    Each person picks push / email / text in My settings. Email waits on CCI (Mail.Send); texts on a texting service (Twilio).
--    Carrier drivers get their load link by text (once texting is connected) and email when the load leaves.
-- Safe to re-run.
begin;

-- =====================================================================================================
-- 1. one person, several driver cards
-- =====================================================================================================
create or replace function my_drivers() returns setof fleet_drivers
language sql stable security definer set search_path = public as $$
  select d.* from fleet_drivers d
   where d.active and d.email is not null and lower(d.email) = jwt_email() and is_staff()
$$;
revoke all on function my_drivers() from public, anon;

create or replace function my_driver() returns fleet_drivers
language sql stable security definer set search_path = public as $$
  select d.* from my_drivers() d order by (d.carrier_id is not null), d.id limit 1
$$;

create or replace function _is_my_load(p_load int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from loads l join my_drivers() d on d.id = l.driver_id where l.id = p_load)
$$;

-- the driver's view of a load says who they're driving for
do $$
declare d text;
begin
  select pg_get_functiondef('_driver_load_json(int)'::regprocedure) into d;
  if d not like '%driving_for%' then
    execute replace(d, '''vehicle'', (select',
      '''driving_for'', (select c.name from fleet_drivers fd join fleet_carriers c on c.id = fd.carrier_id where fd.id = l.driver_id),
    ''vehicle'', (select');
  end if;
end $$;

create or replace function driver_loads() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d fleet_drivers;
begin
  perform require_staff_view();
  d := my_driver();
  if d.id is null then return jsonb_build_object('driver', null, 'loads', '[]'::jsonb); end if;
  return jsonb_build_object('driver', jsonb_build_object('id', d.id, 'name', d.name),
    'loads', coalesce((select jsonb_agg(_driver_load_json(l.id) order by l.load_date, l.id) from loads l
       where l.driver_id in (select id from my_drivers()) and l.kind = 'delivery'
         and (l.status in ('planning', 'loading', 'departing', 'in_transit')
              or (l.status = 'delivered' and l.closed_at > now() - interval '18 hours')
              or exists (select 1 from stop_returns r where r.load_id = l.id and r.back_at is null and r.cancelled_at is null))), '[]'::jsonb));
end $$;

create or replace function driver_load(p_load int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff_view();
  if not (is_owner() or mod_level('distribution') is not null or _is_my_load(p_load)) then raise exception 'Not your load'; end if;
  return _driver_load_json(p_load);
end $$;

create or replace function record_stop_outcome(p_stop int, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s load_stops; mine boolean; office boolean;
begin
  perform no_view_as();
  perform require_staff_view();
  select * into s from load_stops where id = p_stop;
  if s.id is null then raise exception 'Stop not found'; end if;
  mine := _is_my_load(s.load_id);
  office := is_owner() or mod_level('distribution') in ('user', 'admin');
  if not (mine or office) then raise exception 'This isn''t your load'; end if;
  if (s.outcome is not null or s.status <> 'pending') and not office
     and not (mine and s.outcome_by = current_email() and s.outcome_at > now() - interval '2 hours') then
    raise exception 'Already recorded. Ask Distribution to change it.';
  end if;
  return _stop_outcome(p_stop, p, current_email(), case when office and not mine then 'office' else 'driver' end);
end $$;

create or replace function stop_photo(p_stop int) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff_view();
  if not (is_owner() or mod_level('distribution') is not null or mod_level('sales') is not null
          or _is_my_load((select load_id from load_stops where id = p_stop))) then
    raise exception 'Not allowed';
  end if;
  return (select data from stop_photos where stop_id = p_stop);
end $$;

-- =====================================================================================================
-- 2. driver cards and app users
-- =====================================================================================================
-- fill in the login on our cards by first name / email name, when there's exactly one match
update fleet_drivers d set email = m.email, updated_at = now()
  from (select d2.id, min(u.email) as email, count(*) as n
          from fleet_drivers d2 join app_users u on u.role in ('admin', 'sales', 'crew')
           and lower(split_part(trim(d2.name), ' ', 1)) in (lower(split_part(trim(coalesce(u.display_name, '')), ' ', 1)), split_part(u.email, '@', 1))
         where d2.carrier_id is null and d2.email is null group by d2.id) m
 where d.id = m.id and m.n = 1
   and not exists (select 1 from fleet_drivers x where x.carrier_id is null and lower(x.email) = m.email);

-- app users for the "App login" picker on a driver card
create or replace function driver_app_users() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff_view();
  return coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'name', coalesce(u.display_name, u.email), 'phone', u.phone, 'login', u.login_kind,
      'modules', (select count(*) from module_access m where m.email = u.email),
      'cards', (select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'carrier', c.name, 'active', d.active))
                  from fleet_drivers d left join fleet_carriers c on c.id = d.carrier_id where lower(d.email) = u.email))
    order by coalesce(u.display_name, u.email)) from app_users u where u.role in ('admin', 'sales', 'crew')), '[]'::jsonb);
end $$;
revoke all on function driver_app_users() from public, anon;
grant execute on function driver_app_users() to authenticated;

-- make an app user a driver (a card in Vehicles › Drivers), or not (the card goes inactive, nothing is deleted)
create or replace function set_user_driver(p_email text, p_on boolean, p_department text default 'distribution') returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, ''))); u app_users; d fleet_drivers; dept text := coalesce(nullif(p_department, ''), 'distribution');
begin
  perform no_view_as();
  if not (is_owner() or is_admin() or fleet_dept_admin(dept)) then raise exception 'Only Owners, the Admin module, Compliance or a % Admin can do this', initcap(dept); end if;
  select * into u from app_users where email = e;
  if u.email is null or u.role not in ('admin', 'sales', 'crew') then raise exception '% isn''t an app user', e; end if;
  select * into d from fleet_drivers where carrier_id is null and lower(email) = e order by active desc, id limit 1;
  if not p_on then
    update fleet_drivers set active = false, updated_at = now() where carrier_id is null and lower(email) = e and active;
    return jsonb_build_object('driver', false);
  end if;
  if d.id is null then   -- a card with their name and no login yet
    select * into d from fleet_drivers where carrier_id is null and email is null
       and lower(split_part(trim(name), ' ', 1)) in (lower(split_part(trim(coalesce(u.display_name, '')), ' ', 1)), split_part(e, '@', 1))
     order by active desc, id limit 1;
    if d.id is not null and (select count(*) from fleet_drivers where carrier_id is null and email is null
       and lower(split_part(trim(name), ' ', 1)) in (lower(split_part(trim(coalesce(u.display_name, '')), ' ', 1)), split_part(e, '@', 1))) > 1 then d := null; end if;
  end if;
  if d.id is null then
    insert into fleet_drivers (name, email, phone, department) values (coalesce(nullif(trim(u.display_name), ''), split_part(e, '@', 1)), e, u.phone, dept) returning * into d;
  else
    update fleet_drivers set email = e, active = true, phone = coalesce(phone, u.phone), updated_at = now() where id = d.id returning * into d;
  end if;
  perform _comp_event('fleet_driver', d.name, jsonb_build_object('id', d.id, 'app_user', e));
  return jsonb_build_object('driver', true, 'id', d.id, 'name', d.name);
end $$;
revoke all on function set_user_driver(text, boolean, text) from public, anon;
grant execute on function set_user_driver(text, boolean, text) to authenticated;

-- =====================================================================================================
-- 3. rescheduled: back to Ready once it's all received back
-- =====================================================================================================
create or replace function receive_returns(p_ids bigint[], p_site text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; st text := upper(trim(coalesce(p_site, ''))); n int := 0; g gvr_stages; restaged int := 0; sids int[] := '{}'; sid int; o record; ready int := 0;
begin
  perform require_distribution();
  perform no_view_as();
  if st not in ('OHR', 'GVR') then raise exception 'Receive at OHR or GVR'; end if;
  for r in select x.*, l.code as load, c.name as customer, s.outcome_reason from stop_returns x join loads l on l.id = x.load_id
             join load_stops s on s.id = x.stop_id join customers c on c.id = s.customer_id
            where x.id = any(p_ids) and x.back_at is null and x.cancelled_at is null for update of x loop
    select * into g from gvr_stages where pallet_id = r.top_id and load_id = r.load_id and status = 'shipped' order by id desc limit 1;
    update pallets set status = 'unslotted', slot_id = null, received_site = st, updated_at = now()
     where (id = r.pallet_id or container_id = r.pallet_id) and status = 'in_transit';
    update stop_returns set back_at = now(), back_by = current_email(), back_site = st where id = r.id;
    insert into events (user_email, type, pallet_id, load_id, lbs, details)
    values (current_email(), 'returned_back', r.pallet_id, r.load_id, (select current_weight from pallets where id = r.pallet_id),
            jsonb_build_object('load', r.load, 'customer', r.customer, 'site', st, 'kind', r.kind, 'reason', r.reason, 'note', r.note));
    if g.id is not null and st = 'OHR' then
      insert into gvr_stages (pallet_id, order_id, customer_id, license, ship_date, status, note)
      values (r.pallet_id, case when r.outcome_reason = 'rescheduled' then g.order_id end, g.customer_id, g.license, _local_today(), 'staged',
              'Came back from ' || r.load || ' (' || case when r.kind = 'rejected' then 'rejected' else 'not delivered' end || ')')
      on conflict do nothing;
      restaged := restaged + 1;
    end if;
    if not r.stop_id = any(sids) then sids := sids || r.stop_id; end if;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nothing to receive (already received?)'; end if;
  -- rescheduled stops with nothing left on the truck: their orders go back to Ready (same pallets, same invoice)
  foreach sid in array sids loop
    if exists (select 1 from load_stops s where s.id = sid and s.outcome = 'not_delivered' and s.outcome_reason = 'rescheduled')
       and not exists (select 1 from stop_returns x where x.stop_id = sid and x.back_at is null and x.cancelled_at is null) then
      for o in select od.id, od.so_number, l.code from orders od join load_stops s on s.id = od.stop_id join loads l on l.id = s.load_id
                where od.stop_id = sid and od.status in ('shipped', 'pending') loop
        update orders set status = 'pending', stop_id = null, shipped_date = null, updated_at = now() where id = o.id;
        insert into events (user_email, type, details) values (current_email(), 'order_back_ready',
          jsonb_build_object('order_id', o.id, 'so', o.so_number, 'load', o.code, 'why', 'rescheduled, received back'));
        ready := ready + 1;
      end loop;
    end if;
  end loop;
  update app_alerts a set done_at = now(), done_by = current_email()
   where a.done_at is null and a.kind = 'stop_outcome' and a.module = 'sales'
     and (a.ref ->> 'stop_id')::int = any(sids)
     and not exists (select 1 from stop_returns x where x.stop_id = (a.ref ->> 'stop_id')::int and x.back_at is null and x.cancelled_at is null);
  return jsonb_build_object('received', n, 'restaged', restaged, 'ready', ready);
end $$;
revoke all on function receive_returns(bigint[], text) from public, anon;
grant execute on function receive_returns(bigint[], text) to authenticated;

-- =====================================================================================================
-- 4. notifications: push now, email and texts when connected
-- =====================================================================================================
create table if not exists push_config (
  id          int primary key default 1 check (id = 1),
  public_key  text not null,
  private_key text not null,            -- server only (api/notify/run.js reads it with the service key)
  subject     text not null default 'mailto:aziz@lifted-organics.com',
  created_at  timestamptz not null default now()
);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

create table if not exists push_subs (
  id         bigserial primary key,
  email      text not null,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  device     text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fails      int not null default 0
);
create index if not exists push_subs_email on push_subs (email);
alter table push_subs enable row level security;
revoke all on push_subs from anon, authenticated;

create table if not exists push_outbox (
  id         bigserial primary key,
  email      text not null,
  title      text not null,
  body       text,
  url        text,
  tag        text,
  kind       text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text,
  tries      int not null default 0
);
create index if not exists push_outbox_waiting on push_outbox (created_at) where sent_at is null;
alter table push_outbox enable row level security;
revoke all on push_outbox from anon, authenticated;

create table if not exists sms_outbox (
  id         bigserial primary key,
  to_phone   text not null,
  to_email   text,
  body       text not null,
  kind       text,
  ref        jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text,
  tries      int not null default 0
);
create index if not exists sms_outbox_waiting on sms_outbox (created_at) where sent_at is null;
alter table sms_outbox enable row level security;
revoke all on sms_outbox from anon, authenticated;
alter table email_outbox add column if not exists tries int not null default 0;

insert into app_settings (key, value) values ('app.url', 'https://freezer-map-8i3h.vercel.app') on conflict (key) do nothing;
insert into app_settings (key, value) values ('notify.email_on', 'false') on conflict (key) do nothing;    -- turn on once CCI grants Mail.Send
insert into app_settings (key, value) values ('notify.email_from', '') on conflict (key) do nothing;       -- the mailbox it sends from
insert into app_settings (key, value) values ('notify.sms_on', 'false') on conflict (key) do nothing;      -- turn on once texting is connected

create or replace function push_public_key() returns text
language sql stable security definer set search_path = public as $$ select public_key from push_config where id = 1 and is_staff() $$;
revoke all on function push_public_key() from public, anon;
grant execute on function push_public_key() to authenticated;

create or replace function push_subscribe(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform no_view_as();
  if not is_staff() then raise exception 'Sign in first'; end if;
  if coalesce(p ->> 'endpoint', '') !~ '^https://' or nullif(p #>> '{keys,p256dh}', '') is null or nullif(p #>> '{keys,auth}', '') is null then
    raise exception 'That subscription doesn''t look right';
  end if;
  insert into push_subs (email, endpoint, p256dh, auth, device)
  values (jwt_email(), p ->> 'endpoint', p #>> '{keys,p256dh}', p #>> '{keys,auth}', left(p ->> 'device', 200))
  on conflict (endpoint) do update set email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, fails = 0;
end $$;
revoke all on function push_subscribe(jsonb) from public, anon;
grant execute on function push_subscribe(jsonb) to authenticated;

create or replace function push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = public as $$ delete from push_subs where endpoint = p_endpoint and email = jwt_email() $$;
revoke all on function push_unsubscribe(text) from public, anon;
grant execute on function push_unsubscribe(text) to authenticated;

create or replace function push_devices() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'device', device, 'since', created_at, 'last_ok', last_ok_at) order by created_at), '[]'::jsonb)
    from push_subs where email = jwt_email()
$$;
revoke all on function push_devices() from public, anon;
grant execute on function push_devices() to authenticated;

-- one message to some people, on the channels each one picked (My settings: push on unless turned off, email / text off unless on)
create or replace function _notify(p_emails text[], p_title text, p_body text, p_url text, p_kind text, p_ref jsonb default '{}') returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0;
begin
  for u in select a.email, a.phone, coalesce(a.prefs -> 'notify', '{}'::jsonb) as nf from app_users a
            where a.email = any(p_emails) and a.role in ('admin', 'sales', 'crew') loop
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

-- every new alert: to the people who see it in the app (module Admins, or everyone in the module); Owners get delivery alerts
create or replace function _alert_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text[]; url text := (select value from app_settings where key = 'app.url');
begin
  select array_agg(distinct e) into who from (
    select m.email as e from module_access m where m.module = new.module and (not new.admins or m.level = 'admin')
    union select u.email from app_users u where u.owner and new.kind like 'stop_%') x;
  if who is not null then perform _notify(who, new.title, new.body, url, new.kind, new.ref); end if;
  return null;
end $$;
drop trigger if exists app_alerts_notify on app_alerts;
create trigger app_alerts_notify after insert on app_alerts for each row execute function _alert_notify();

-- drivers: put on a load, and the load leaving
create or replace function _load_driver_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare d fleet_drivers; url text := (select value from app_settings where key = 'app.url'); n int; tok text; cname text;
begin
  if new.kind <> 'delivery' or new.driver_id is null then return null; end if;
  select * into d from fleet_drivers where id = new.driver_id;
  select name into cname from fleet_carriers where id = d.carrier_id;
  n := (select count(*) from load_stops where load_id = new.id);
  if (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id) and new.status in ('planning', 'loading', 'departing') and d.email is not null then
    perform _notify(array[lower(d.email)], 'You''re driving ' || new.code, to_char(new.load_date, 'Dy Mon DD') || ' · ' || n || ' stop' || case when n = 1 then '' else 's' end
      || coalesce(' · for ' || cname, ''), url, 'driver_load', jsonb_build_object('load_id', new.id));
  end if;
  if tg_op = 'UPDATE' and new.status = 'in_transit' and old.status is distinct from 'in_transit' then
    if d.email is not null then
      perform _notify(array[lower(d.email)], new.code || ' is on its way', n || ' stop' || case when n = 1 then '' else 's' end || '. Record each stop in the app (Driver).',
        url, 'driver_depart', jsonb_build_object('load_id', new.id));
    end if;
    -- a carrier's driver: the load link by text / email (sent once texting / email are connected)
    if d.carrier_id is not null then
      select token into tok from driver_links where load_id = new.id and revoked_at is null;
      if tok is not null and nullif(trim(coalesce(d.phone, '')), '') is not null then
        insert into sms_outbox (to_phone, body, kind, ref) values (d.phone,
          'Lifted Farms load ' || new.code || ': record each stop here (open it again any time): ' || url || '/?drive=' || tok, 'driver_link', jsonb_build_object('load_id', new.id));
      end if;
      if tok is not null and coalesce(nullif(trim(d.email), ''), (select nullif(trim(email), '') from fleet_carriers where id = d.carrier_id)) is not null then
        insert into email_outbox (to_email, subject, body, kind, ref) values (coalesce(nullif(trim(d.email), ''), (select email from fleet_carriers where id = d.carrier_id)),
          'Lifted Farms load ' || new.code || ': your stops',
          'Record what happened at each stop here (no login; open it again any time): ' || url || '/?drive=' || tok, 'driver_link', jsonb_build_object('load_id', new.id));
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists load_driver_notify on loads;
create trigger load_driver_notify after insert or update of driver_id, status on loads for each row execute function _load_driver_notify();

-- the sender (api/notify/run.js, service key) takes a batch
create or replace function notify_claim(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'push', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'body', o.body, 'url', o.url, 'tag', o.tag,
        'subs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb) from push_subs s where s.email = o.email)))
      from (select * from push_outbox where sent_at is null and tries < 5 and created_at > now() - interval '1 day' order by id limit p_limit) o), '[]'::jsonb),
    'email', case when (select value from app_settings where key = 'notify.email_on') = 'true' then
      coalesce((select jsonb_agg(to_jsonb(e)) from (select id, to_email, subject, body from email_outbox where sent_at is null and coalesce(tries, 0) < 5 order by id limit p_limit) e), '[]'::jsonb) else '[]'::jsonb end,
    'email_from', (select value from app_settings where key = 'notify.email_from'),
    'sms', case when (select value from app_settings where key = 'notify.sms_on') = 'true' then
      coalesce((select jsonb_agg(to_jsonb(m)) from (select id, to_phone, body from sms_outbox where sent_at is null and tries < 5 order by id limit p_limit) m), '[]'::jsonb) else '[]'::jsonb end,
    'vapid', (select jsonb_build_object('public', public_key, 'private', private_key, 'subject', subject) from push_config where id = 1));
end $$;
revoke all on function notify_claim(int) from public, anon, authenticated;
grant execute on function notify_claim(int) to service_role;

-- p: { push: [{ id, ok, error }], subs_gone: [ids], subs_ok: [ids], email: [{ id, ok, error }], sms: [{ id, ok, error }] }
create or replace function notify_done(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(p -> 'push', '[]')) loop
    update push_outbox set tries = tries + 1, sent_at = case when (x ->> 'ok')::boolean then now() end, error = x ->> 'error' where id = (x ->> 'id')::bigint;
  end loop;
  delete from push_subs where id in (select (v)::bigint from jsonb_array_elements_text(coalesce(p -> 'subs_gone', '[]')) v);
  update push_subs set last_ok_at = now(), fails = 0 where id in (select (v)::bigint from jsonb_array_elements_text(coalesce(p -> 'subs_ok', '[]')) v);
  for x in select * from jsonb_array_elements(coalesce(p -> 'email', '[]')) loop
    update email_outbox set tries = coalesce(tries, 0) + 1, sent_at = case when (x ->> 'ok')::boolean then now() end, error = x ->> 'error' where id = (x ->> 'id')::bigint;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p -> 'sms', '[]')) loop
    update sms_outbox set tries = tries + 1, sent_at = case when (x ->> 'ok')::boolean then now() end, error = x ->> 'error' where id = (x ->> 'id')::bigint;
  end loop;
end $$;
revoke all on function notify_done(jsonb) from public, anon, authenticated;
grant execute on function notify_done(jsonb) to service_role;
grant all on push_config, push_subs, push_outbox, sms_outbox, email_outbox to service_role;
grant usage, select on all sequences in schema public to service_role;


-- delivery alerts now go out through _notify (each person's channels): drop 215's direct email to Sales
do $$
declare d text; d2 text;
begin
  select pg_get_functiondef('_stop_outcome(int,jsonb,text,text)'::regprocedure) into d;
  d2 := regexp_replace(d, '\s*insert into email_outbox \(to_email, subject, body, kind, ref\)\s*select distinct m\.email.*?au\.role in \(''admin'', ''sales'', ''crew''\);', '', 's');
  if d2 <> d then execute d2; end if;
end $$;

commit;
