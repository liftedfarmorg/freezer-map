-- 215: Driver portal (Msg #239 / #242, 11/5). Drivers record what happened at each stop from their phone.
--  * Loads get a real driver: loads.driver_id (Vehicles > Drivers). The typed name stays (it goes on the METRC manifest);
--    a trigger links it to the driver with that name (our drivers for our trucks, the carrier's for a carrier truck).
--  * Who sees a load on the Driver screen: the driver whose Vehicles > Drivers email is their app login.
--    A driver-only login (Jason) is an app user with no modules: "Driver only" on the driver card. They see only the Driver screen.
--  * Outside carriers (G & R, R & M, Reefer Trucking): a link for that one load, no login (driver_links). Made automatically
--    for a carrier truck; the office texts or emails it from the load. Opening the link again gets back in.
--  * Stop outcomes: Delivered, Partly rejected, Fully rejected, Not delivered (cancelled / rescheduled / couldn't deliver);
--    internal stops (OHR / GVR): Dropped off. Receiver's name required (except Not delivered). Optional photo and note.
--    Rejected / not delivered packages come back on the truck (stop_returns) and show in Distribution > Inbound to receive back.
--  * The office records or fixes an outcome in Transit (same sheet) until anything from that stop is received back.
--  * Invoices: still made at Depart (089) for now. Anything other than Delivered raises an Accounting alert (credit memo
--    needed) and a Sales alert. When draft invoices (#238 step 1) are built, this is where the invoice gets made instead.
--  * METRC: nothing is sent. Not delivered / rejected raises a Distribution Admin alert for Rama (void the manifest once the
--    product is back / check the customer rejected those packages).
--  * Customer pickups don't change (deliver_stop, invoice at Picked up).
-- Safe to re-run.
begin;

-- =====================================================================================================
-- 1. tables and columns
-- =====================================================================================================
alter table loads add column if not exists driver_id int references fleet_drivers(id) on delete set null;
create index if not exists loads_driver_idx on loads (driver_id) where driver_id is not null;

alter table load_stops drop constraint if exists load_stops_status_check;
alter table load_stops add constraint load_stops_status_check check (status in ('pending', 'delivered', 'not_delivered'));
alter table load_stops add column if not exists outcome text;
alter table load_stops drop constraint if exists load_stops_outcome_check;
alter table load_stops add constraint load_stops_outcome_check
  check (outcome is null or outcome in ('delivered', 'partly_rejected', 'fully_rejected', 'not_delivered', 'dropped_off'));
alter table load_stops add column if not exists outcome_reason text;     -- not delivered: cancelled / rescheduled / couldnt_deliver
alter table load_stops add column if not exists outcome_note text;
alter table load_stops add column if not exists receiver_name text;
alter table load_stops add column if not exists outcome_at timestamptz;
alter table load_stops add column if not exists outcome_by text;
alter table load_stops add column if not exists outcome_via text;        -- driver / office / link
alter table load_stops add column if not exists outcome_client uuid;     -- the phone's id for this save (offline resend = same id)
alter table load_stops add column if not exists has_photo boolean not null default false;
alter table load_stops add column if not exists fixed_at timestamptz;
alter table load_stops add column if not exists fixed_by text;

-- packages coming back on the truck
create table if not exists stop_returns (
  id          bigserial primary key,
  stop_id     int not null references load_stops(id) on delete cascade,
  load_id     int not null references loads(id) on delete cascade,
  pallet_id   bigint not null references pallets(id),     -- the package (or whole pallet) coming back
  top_id      bigint not null references pallets(id),     -- the pallet it rode on (same as pallet_id unless it was in a mixed pallet)
  kind        text not null check (kind in ('rejected', 'not_delivered')),
  reason      text,                                       -- rejected: quality / wrong_strain / damaged / overshipped / other
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text,
  cancelled_at timestamptz,                               -- the outcome was fixed: it wasn't coming back after all
  back_at     timestamptz,
  back_by     text,
  back_site   text
);
create unique index if not exists stop_returns_open on stop_returns (stop_id, pallet_id) where cancelled_at is null;
create index if not exists stop_returns_waiting on stop_returns (load_id) where back_at is null and cancelled_at is null;
alter table stop_returns enable row level security;
drop policy if exists read_staff on stop_returns;
create policy read_staff on stop_returns for select to authenticated using ((select is_staff()));
grant select on stop_returns to authenticated;

-- one photo per stop (signed manifest, damaged product). Kept out of load_stops so the app's snapshot stays small.
create table if not exists stop_photos (
  stop_id    int primary key references load_stops(id) on delete cascade,
  data       text not null,                               -- data:image/jpeg;base64,… (shrunk on the phone)
  taken_by   text,
  created_at timestamptz not null default now()
);
alter table stop_photos enable row level security;
revoke all on stop_photos from anon, authenticated;

-- one-load links for outside carriers' drivers
create table if not exists driver_links (
  token       text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  load_id     int not null references loads(id) on delete cascade,
  driver_id   int references fleet_drivers(id) on delete set null,
  created_by  text default current_email(),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  last_used_at timestamptz
);
create unique index if not exists driver_links_open on driver_links (load_id) where revoked_at is null;
alter table driver_links enable row level security;
revoke all on driver_links from anon, authenticated;

-- =====================================================================================================
-- 2. loads: the typed driver name links to the driver record
-- =====================================================================================================
create or replace function _load_driver_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid int; ids int[];
begin
  if tg_op = 'UPDATE' and new.driver is not distinct from old.driver and new.vehicle_id is not distinct from old.vehicle_id
     and new.driver_id is not distinct from old.driver_id then return new; end if;
  -- set by id (the picker): keep the name in step, it's what goes on the manifest
  if new.driver_id is not null and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id) then
    new.driver := (select name from fleet_drivers where id = new.driver_id);
    return new;
  end if;
  if nullif(trim(coalesce(new.driver, '')), '') is null then new.driver_id := null; return new; end if;
  select carrier_id into cid from fleet_assets where id = new.vehicle_id;
  select array_agg(id) into ids from fleet_drivers
   where lower(trim(name)) = lower(trim(new.driver)) and carrier_id is not distinct from cid and active;
  new.driver_id := case when coalesce(array_length(ids, 1), 0) = 1 then ids[1] end;
  return new;
end $$;
drop trigger if exists load_driver_link on loads;
create trigger load_driver_link before insert or update of driver, vehicle_id, driver_id on loads
  for each row execute function _load_driver_link();

-- backfill open loads (and recent ones, for the history)
update loads l set driver_id = d.id
  from fleet_drivers d, fleet_assets a
 where a.id = l.vehicle_id and l.driver_id is null and nullif(trim(coalesce(l.driver, '')), '') is not null
   and lower(trim(d.name)) = lower(trim(l.driver)) and d.carrier_id is not distinct from a.carrier_id and d.active
   and (select count(*) from fleet_drivers d2 where lower(trim(d2.name)) = lower(trim(l.driver)) and d2.carrier_id is not distinct from a.carrier_id and d2.active) = 1;

-- a carrier truck with a carrier driver gets its one-load link right away
create or replace function _load_driver_link_make() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'delivery' and new.driver_id is not null and new.status not in ('delivered', 'cancelled')
     and exists (select 1 from fleet_drivers d where d.id = new.driver_id and d.carrier_id is not null) then
    if not exists (select 1 from driver_links where load_id = new.id and revoked_at is null) then
      insert into driver_links (load_id, driver_id) values (new.id, new.driver_id);
    else
      update driver_links set driver_id = new.driver_id where load_id = new.id and revoked_at is null and driver_id is distinct from new.driver_id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists load_driver_link_make on loads;
create trigger load_driver_link_make after insert or update of driver_id, status on loads
  for each row execute function _load_driver_link_make();

-- require_staff() refuses View-only Distribution people; reading your own loads only needs a staff login
create or replace function require_staff_view() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Your account doesn''t have access. Ask an admin to set your role.'; end if;
end $$;

-- =====================================================================================================
-- 3. who is a driver
-- =====================================================================================================
create or replace function my_driver() returns fleet_drivers
language sql stable security definer set search_path = public as $$
  select d.* from fleet_drivers d
   where d.carrier_id is null and d.active and d.email is not null and lower(d.email) = jwt_email() and is_staff()
   order by d.id limit 1
$$;

-- my_access(): adds 'driver' (the Driver tile / Driver-only screen)
create or replace function my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owner', is_owner(),
    'modules', coalesce((select jsonb_object_agg(m, mod_level(m)) from unnest(array['distribution','sales','cultivation','nursery','processing','accounting','compliance','admin']) m where mod_level(m) is not null), '{}'),
    'prefs', coalesce((select prefs from app_users where email = jwt_email()), '{}'),
    'perms', my_perms(),
    'login', (select login_kind from app_users where email = jwt_email()),
    'driver', (select case when d.id is not null then jsonb_build_object('id', d.id, 'name', d.name) end from my_driver() d))
$$;

-- Vehicles > Drivers: "Driver only" app access (no modules: they land on the Driver screen)
create or replace function fleet_driver_app(p_driver int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d fleet_drivers; u app_users; e text; lk text;
begin
  perform no_view_as();
  select * into d from fleet_drivers where id = p_driver;
  if d.id is null then raise exception 'Driver not found'; end if;
  if d.carrier_id is not null then raise exception 'Carrier drivers get a link for each load instead of a login'; end if;
  if not fleet_dept_admin(coalesce(d.department, 'distribution')) then raise exception 'Only Compliance or this department''s Admins can do this'; end if;
  e := lower(trim(coalesce(d.email, '')));
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add their email first'; end if;
  select * into u from app_users where email = e;
  if u.email is not null and u.role in ('admin', 'sales', 'crew') then
    return jsonb_build_object('email', e, 'already', true, 'login', u.login_kind);
  end if;
  if u.email is not null then raise exception '% already has a % login. Ask someone with the Admin module.', e, u.role; end if;
  lk := case when split_part(e, '@', 2) in (select domain from staff_domains) then 'microsoft' else 'email' end;
  insert into app_users (email, role, display_name, added_by, login_kind) values (e, 'crew', d.name, current_email(), lk);
  delete from module_access where email = e;   -- new staff get Distribution User by default (new_staff_access): a driver-only login gets nothing
  insert into events (user_email, type, details) values (current_email(), 'user_access', jsonb_build_object('email', e, 'kind', 'staff', 'access', '{}'::jsonb, 'driver_only', true));
  return jsonb_build_object('email', e, 'already', false, 'login', lk);
end $$;
revoke all on function fleet_driver_app(int) from public, anon;
grant execute on function fleet_driver_app(int) to authenticated;

-- =====================================================================================================
-- 4. what a driver sees (one load)
-- =====================================================================================================
-- every package a stop carried: what's on its pallets now, plus anything taken off a mixed pallet to come back
create or replace function _stop_leaves(p_stop int) returns table (pallet_id bigint, top_id bigint, code text, tag text, strain text, lbs numeric, item text, from_license text)
language sql stable security definer set search_path = public as $$
  select k.pallet_id, k.top_id, k.code, k.tag, k.strain, k.lbs, k.item, k.from_license from metrc_stop_packages(p_stop) k
  union
  select p.id, r.top_id, p.code, upper(p.package_tag), p.strain, p.current_weight, (select metrc_name from items where id = p.item_id),
         coalesce(metrc_pkg_license(p.package_tag), site_license(coalesce(i.from_site, pallet_site(p))))
    from stop_returns r join pallets p on p.id = r.pallet_id
    left join load_items i on i.stop_id = r.stop_id and i.pallet_id = r.top_id
   where r.stop_id = p_stop and r.pallet_id <> r.top_id
     and not exists (select 1 from metrc_stop_packages(p_stop) k2 where k2.pallet_id = p.id)
$$;
revoke all on function _stop_leaves(int) from public, anon, authenticated;

create or replace function _driver_load_json(p_load int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'code', l.code, 'status', l.status, 'load_date', l.load_date, 'depart_planned', l.depart_planned,
    'departed_at', l.departed_at, 'driver', l.driver, 'notes', l.notes,
    'vehicle', (select coalesce(nullif(trim(coalesce(a.name, '')), ''), a.plate) from fleet_assets a where a.id = l.vehicle_id),
    'stops', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'seq', s.seq, 'customer', c.name,
        'site', case when c.kind = 'internal' and upper(c.name) in ('OHR', 'GVR') then upper(c.name) end,
        'address', coalesce(nullif(trim(c.ship_to_address), ''), nullif(trim(c.address), ''),
                            (select address from licenses x where x.license_no = c.license)),
        'contact', coalesce(nullif(trim(c.receiving_contact), ''), nullif(trim(c.contact), '')),
        'phone', nullif(trim(coalesce(c.billing_phone, '')), ''),
        'manifest', s.manifest, 'status', s.status, 'outcome', s.outcome, 'outcome_reason', s.outcome_reason,
        'outcome_note', s.outcome_note, 'receiver_name', s.receiver_name, 'outcome_at', s.outcome_at, 'outcome_by', s.outcome_by,
        'outcome_via', s.outcome_via, 'has_photo', s.has_photo,
        'back_started', exists (select 1 from stop_returns r where r.stop_id = s.id and r.back_at is not null and r.cancelled_at is null),
        'packages', coalesce((select jsonb_agg(jsonb_build_object('id', k.pallet_id, 'top_id', k.top_id, 'code', k.code, 'tag', k.tag,
              'item', coalesce(k.item, k.strain), 'strain', k.strain, 'lbs', k.lbs, 'license', k.from_license,
              'back', r.id is not null, 'reason', r.reason, 'note', r.note) order by k.code)
            from _stop_leaves(s.id) k
            left join stop_returns r on r.stop_id = s.id and r.cancelled_at is null and (r.pallet_id = k.pallet_id or r.pallet_id = k.top_id)), '[]'::jsonb),
        'pallets', (select count(*) from load_items i where i.stop_id = s.id)
      ) order by s.seq) from load_stops s join customers c on c.id = s.customer_id where s.load_id = l.id), '[]'::jsonb),
    'coming_back', (select count(*) from stop_returns r where r.load_id = l.id and r.back_at is null and r.cancelled_at is null),
    'back_to', (select string_agg(distinct i.from_site, ', ') from load_items i where i.load_id = l.id and i.from_site is not null))
  from loads l where l.id = p_load
$$;
revoke all on function _driver_load_json(int) from public, anon, authenticated;


-- My loads: the signed-in driver's loads (today and anything still open)
create or replace function driver_loads() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d fleet_drivers;
begin
  perform require_staff_view();
  d := my_driver();
  if d.id is null then return jsonb_build_object('driver', null, 'loads', '[]'::jsonb); end if;
  return jsonb_build_object('driver', jsonb_build_object('id', d.id, 'name', d.name),
    'loads', coalesce((select jsonb_agg(_driver_load_json(l.id) order by l.load_date, l.id) from loads l
       where l.driver_id = d.id and l.kind = 'delivery'
         and (l.status in ('planning', 'loading', 'departing', 'in_transit')
              or (l.status = 'delivered' and l.closed_at > now() - interval '18 hours')
              or exists (select 1 from stop_returns r where r.load_id = l.id and r.back_at is null and r.cancelled_at is null))), '[]'::jsonb));
end $$;
revoke all on function driver_loads() from public, anon;
grant execute on function driver_loads() to authenticated;

-- the office (Transit) can open the same view for any load
create or replace function driver_load(p_load int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff_view();
  if not (is_owner() or mod_level('distribution') is not null or (select driver_id from loads where id = p_load) = (my_driver()).id) then
    raise exception 'Not your load';
  end if;
  return _driver_load_json(p_load);
end $$;
revoke all on function driver_load(int) from public, anon;
grant execute on function driver_load(int) to authenticated;

-- one-load link (no login)
create or replace function _driver_link(p_token text) returns driver_links
language plpgsql security definer set search_path = public as $$
declare k driver_links; l loads;
begin
  select * into k from driver_links where token = p_token and revoked_at is null;
  if k.token is null then raise exception 'This link doesn''t work anymore. Ask Lifted for a new one.'; end if;
  select * into l from loads where id = k.load_id;
  if l.status = 'cancelled' or (l.status = 'delivered' and l.closed_at < now() - interval '3 days'
       and not exists (select 1 from stop_returns r where r.load_id = l.id and r.back_at is null and r.cancelled_at is null)) then
    raise exception 'This load is finished. The link is closed.';
  end if;
  return k;
end $$;
revoke all on function _driver_link(text) from public, anon, authenticated;

create or replace function driver_link_load(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k driver_links;
begin
  k := _driver_link(p_token);
  update driver_links set last_used_at = now() where token = k.token;
  return _driver_load_json(k.load_id) || jsonb_build_object('link_driver', (select name from fleet_drivers where id = k.driver_id),
    'carrier', (select c.name from fleet_drivers d join fleet_carriers c on c.id = d.carrier_id where d.id = k.driver_id));
end $$;
revoke all on function driver_link_load(text) from public;
grant execute on function driver_link_load(text) to anon, authenticated;

-- the manifest PDF for a link (api/metrc/run.js asks this with the service key)
create or replace function driver_link_manifest(p_token text, p_stop int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k driver_links; s load_stops;
begin
  k := _driver_link(p_token);
  select * into s from load_stops where id = p_stop and load_id = k.load_id;
  if s.id is null or s.manifest is null then raise exception 'No manifest for that stop yet'; end if;
  return jsonb_build_object('manifest', s.manifest, 'license', (select k2.from_license from _stop_leaves(s.id) k2 where k2.from_license is not null limit 1));
end $$;
revoke all on function driver_link_manifest(text, int) from public, anon, authenticated;
grant execute on function driver_link_manifest(text, int) to service_role;

-- Transit: the link for a carrier load (made if missing); p_new = a fresh link (the old one stops working)
create or replace function driver_link_for_load(p_load int, p_new boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l loads; t text; d fleet_drivers;
begin
  perform require_distribution();
  perform no_view_as();
  select * into l from loads where id = p_load;
  if l.id is null then raise exception 'Load not found'; end if;
  if l.kind <> 'delivery' then raise exception 'Pickups don''t have a driver link'; end if;
  if p_new then update driver_links set revoked_at = now() where load_id = l.id and revoked_at is null; end if;
  select token into t from driver_links where load_id = l.id and revoked_at is null;
  if t is null then insert into driver_links (load_id, driver_id) values (l.id, l.driver_id) returning token into t; end if;
  select * into d from fleet_drivers where id = l.driver_id;
  return jsonb_build_object('token', t, 'driver', d.name, 'phone', coalesce(d.phone, (select c.phone from fleet_carriers c where c.id = d.carrier_id)),
                            'email', coalesce(d.email, (select c.email from fleet_carriers c where c.id = d.carrier_id)));
end $$;
revoke all on function driver_link_for_load(int, boolean) from public, anon;
grant execute on function driver_link_for_load(int, boolean) to authenticated;

-- =====================================================================================================
-- 5. recording the outcome (driver, office or link): one place
-- =====================================================================================================
-- p: { outcome, reason, note, receiver, photo (data url), client (uuid), rejects: [{ id (package), reason, note }] }
create or replace function _stop_outcome(p_stop int, p jsonb, p_by text, p_via text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s load_stops; l loads; c customers; site text; o text := p ->> 'outcome'; why text := nullif(p ->> 'reason', '');
        rcv text := nullif(trim(coalesce(p ->> 'receiver', '')), ''); note_ text := nullif(trim(coalesce(p ->> 'note', '')), '');
        cl uuid := nullif(p ->> 'client', '')::uuid; fix boolean; k record; rj jsonb; gone int := 0; nback int := 0;
        nleaves int := 0; was text; msg text; label text; u record;
begin
  select * into s from load_stops where id = p_stop for update;
  if s.id is null then raise exception 'Stop not found'; end if;
  -- the phone sent this one already (no signal, sent again): nothing to do
  if cl is not null and s.outcome_client = cl then return jsonb_build_object('ok', true, 'again', true); end if;
  select * into l from loads where id = s.load_id for update;
  select * into c from customers where id = s.customer_id;
  site := case when c.kind = 'internal' and upper(c.name) in ('OHR', 'GVR') then upper(c.name) end;
  fix := s.outcome is not null or s.status <> 'pending';
  was := coalesce(s.outcome, case when s.status = 'delivered' then 'delivered' end);
  if l.kind <> 'delivery' then raise exception 'Pickups are marked Picked up at the dock'; end if;
  if l.status not in ('in_transit', 'delivered') then raise exception 'Load % hasn''t left yet. Distribution presses Depart first.', l.code; end if;
  if fix and p_via = 'link' then raise exception 'This stop is already recorded. Call Lifted to change it.'; end if;
  if fix and site is not null then raise exception 'This OHR / GVR stop is already recorded. Fix the pallets at the farm instead.'; end if;
  if fix and exists (select 1 from stop_returns r where r.stop_id = s.id and r.back_at is not null and r.cancelled_at is null) then
    raise exception 'Product from this stop was already received back at the farm, so the outcome can''t change anymore';
  end if;
  if o is null or o not in ('delivered', 'partly_rejected', 'fully_rejected', 'not_delivered', 'dropped_off') then raise exception 'Pick what happened'; end if;
  if site is not null and o not in ('dropped_off', 'not_delivered') then raise exception 'For OHR / GVR pick Dropped off (or Not delivered)'; end if;
  if site is null and o = 'dropped_off' then raise exception 'Dropped off is for OHR / GVR stops'; end if;
  if o <> 'not_delivered' and rcv is null then raise exception 'Enter the name of the person who received it'; end if;
  if o = 'not_delivered' and (why is null or why not in ('cancelled', 'rescheduled', 'couldnt_deliver')) then raise exception 'Pick why it wasn''t delivered'; end if;
  if o = 'not_delivered' and why = 'couldnt_deliver' and note_ is null then raise exception 'Add a note: what happened?'; end if;
  if o = 'fully_rejected' and why is null then raise exception 'Pick why they rejected it'; end if;
  if o not in ('fully_rejected', 'not_delivered') then why := null; end if;

  -- each package: back on the truck, or gone (delivered / dropped off)
  create temp table if not exists _so_leaf (pallet_id bigint, top_id bigint, inside boolean, back boolean, reason text, note text, unit bigint) on commit drop;
  delete from _so_leaf where true;
  insert into _so_leaf select k2.pallet_id, k2.top_id, coalesce(pp.container_id = k2.top_id, false), false, null, null, k2.pallet_id
    from _stop_leaves(s.id) k2 join pallets pp on pp.id = k2.pallet_id;
  select count(*) into nleaves from _so_leaf;
  if nleaves = 0 then raise exception 'Nothing on this stop'; end if;
  if o in ('fully_rejected', 'not_delivered') then
    update _so_leaf set back = true, reason = why, note = note_ where true;
  elsif o = 'partly_rejected' then
    for rj in select * from jsonb_array_elements(coalesce(p -> 'rejects', '[]'::jsonb)) loop
      if nullif(rj ->> 'reason', '') is null then raise exception 'Pick a reason for each rejected package'; end if;
      update _so_leaf set back = true, reason = rj ->> 'reason', note = nullif(trim(coalesce(rj ->> 'note', '')), '')
       where pallet_id = (rj ->> 'id')::bigint;
      if not found then raise exception 'Package % isn''t on this stop', rj ->> 'id'; end if;
    end loop;
    select count(*) filter (where back) into nback from _so_leaf;
    if nback = 0 then raise exception 'Pick the rejected packages (or choose Delivered)'; end if;
    if nback = nleaves then raise exception 'Every package was rejected: choose Fully rejected'; end if;
  end if;
  -- a mixed pallet coming back whole stays one pallet (no taking packages off it)
  update _so_leaf f set unit = f.top_id
   where f.back and f.inside
     and not exists (select 1 from _so_leaf g where g.top_id = f.top_id and (not g.back or not g.inside));

  -- returns that aren't coming back anymore (a fix)
  update stop_returns r set cancelled_at = now()
   where r.stop_id = s.id and r.cancelled_at is null and r.back_at is null
     and not exists (select 1 from _so_leaf f where f.unit = r.pallet_id and f.back);

  -- coming back
  for u in select f.unit, min(f.top_id) as top_id, bool_or(f.unit <> f.pallet_id) as whole, min(f.reason) as reason, min(f.note) as note
             from _so_leaf f where f.back group by f.unit loop
    select p2.container_id, p2.status, p2.current_weight into k from pallets p2 where p2.id = u.unit;
    if not u.whole and k.container_id is not null then
      insert into events (user_email, type, pallet_id, load_id, lbs, details)
      values (p_by, 'mixed_off', u.unit, l.id, k.current_weight, jsonb_build_object('mixed_id', k.container_id, 'why', 'rejected at ' || c.name, 'load', l.code));
      update pallets set container_id = null, updated_at = now() where id = u.unit;
    end if;
    update pallets set status = 'in_transit', slot_id = null, updated_at = now()
     where (id = u.unit or container_id = u.unit) and status <> 'in_transit';
    insert into stop_returns (stop_id, load_id, pallet_id, top_id, kind, reason, note, created_by)
    values (s.id, l.id, u.unit, u.top_id, case when o = 'not_delivered' then 'not_delivered' else 'rejected' end, u.reason, u.note, p_by)
    on conflict (stop_id, pallet_id) where cancelled_at is null do update set kind = excluded.kind, reason = excluded.reason, note = excluded.note;
  end loop;

  -- delivered / dropped off
  for k in select f.pallet_id, p2.status as pst, p2.current_weight from _so_leaf f join pallets p2 on p2.id = f.pallet_id where not f.back loop
    gone := gone + 1;
    if k.pst = 'in_transit' then
      update pallets set status = case when site is null then 'shipped' else 'unslotted' end,
                         received_site = case when site is null then received_site else site end, updated_at = now()
       where id = k.pallet_id;
      insert into events (user_email, type, pallet_id, load_id, lbs, details)
      values (p_by, case when site is null then 'shipped' else 'received' end, k.pallet_id, l.id, k.current_weight,
              jsonb_build_object('load', l.code, 'customer', c.name, 'manifest', s.manifest, 'receiver', rcv, 'via', p_via));
    end if;
  end loop;
  -- mixed pallets: the shell goes with what was delivered
  update pallets t set status = case when site is null then 'shipped' else 'unslotted' end,
                       received_site = case when site is null then t.received_site else site end, updated_at = now()
   where t.kind = 'mixed' and t.status = 'in_transit'
     and t.id in (select f.top_id from _so_leaf f where not f.back and f.inside);

  update load_stops set outcome = o, outcome_reason = why, outcome_note = note_, receiver_name = rcv,
         outcome_at = case when fix and outcome_at is not null then outcome_at else now() end,
         outcome_by = case when fix and outcome_by is not null then outcome_by else p_by end,
         outcome_via = case when fix and outcome_via is not null then outcome_via else p_via end,
         fixed_at = case when fix then now() end, fixed_by = case when fix then p_by end,
         outcome_client = coalesce(cl, outcome_client),
         status = case when gone > 0 then 'delivered' else 'not_delivered' end,
         delivered_at = case when gone > 0 then coalesce(delivered_at, now()) end,
         delivered_by = case when gone > 0 then coalesce(delivered_by, p_by) end
   where id = s.id;
  if nullif(p ->> 'photo', '') is not null then
    if length(p ->> 'photo') > 3000000 then raise exception 'That photo is too big'; end if;
    insert into stop_photos (stop_id, data, taken_by) values (s.id, p ->> 'photo', p_by)
    on conflict (stop_id) do update set data = excluded.data, taken_by = excluded.taken_by, created_at = now();
    update load_stops set has_photo = true where id = s.id;
  end if;

  select count(*) into nback from _so_leaf where back;
  label := case o when 'delivered' then 'Delivered' when 'partly_rejected' then 'Partly rejected' when 'fully_rejected' then 'Fully rejected'
                  when 'dropped_off' then 'Dropped off' else 'Not delivered (' || replace(replace(why, 'couldnt_deliver', 'couldn''t deliver'), '_', ' ') || ')' end;
  insert into events (user_email, type, load_id, details)
  values (p_by, case when fix then 'stop_outcome_fixed' else 'stop_outcome' end, l.id,
          jsonb_build_object('load', l.code, 'customer', c.name, 'seq', s.seq, 'outcome', o, 'label', label, 'reason', why, 'receiver', rcv,
                             'back', nback, 'via', p_via, 'was', was, 'note', note_));
  if l.status = 'in_transit' and not exists (select 1 from load_stops where load_id = l.id and status = 'pending') then
    update loads set status = 'delivered', closed_at = now() where id = l.id;
  end if;

  -- tell people (not for a plain delivery / drop-off)
  if o not in ('delivered', 'dropped_off') or (fix and was is distinct from o) then
    msg := format('%s stop %s, %s: %s%s. %s package(s) coming back on the truck.%s', l.code, s.seq, c.name, label,
                  case when rcv is not null then ' (received by ' || rcv || ')' else '' end, nback, coalesce(' Note: ' || note_, ''))
           || case when fix then format(' (changed from %s)', coalesce(was, 'nothing')) else '' end;
    if site is null then
      perform _alert('sales', false, 'stop_outcome', 'Delivery: ' || label || ' at ' || c.name, msg, jsonb_build_object('stop_id', s.id, 'load_id', l.id));
      if exists (select 1 from invoices i join orders od on od.id = i.order_id where od.stop_id = s.id and i.status <> 'void') then
        perform _alert('accounting', false, 'stop_outcome', 'Credit memo may be needed: ' || c.name || ' ' || l.code,
                       msg || ' The invoice was made at Depart, so anything not delivered needs a credit memo.', jsonb_build_object('stop_id', s.id, 'load_id', l.id));
      end if;
      insert into email_outbox (to_email, subject, body, kind, ref)
      select distinct m.email, 'Delivery: ' || label || ' at ' || c.name, msg, 'stop_outcome', jsonb_build_object('stop_id', s.id)
        from module_access m join app_users au on au.email = m.email
       where m.module = 'sales' and au.role in ('admin', 'sales', 'crew');
    end if;
    if o in ('partly_rejected', 'fully_rejected', 'not_delivered') then
      perform _alert('distribution', true, 'stop_metrc', 'METRC: ' || label || ' on manifest ' || coalesce(s.manifest, '(none)'),
        msg || case when o = 'not_delivered' then ' Void the manifest once the product is received back.'
                    else ' Check the customer rejected those packages in METRC.' end, jsonb_build_object('stop_id', s.id, 'load_id', l.id));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'outcome', o, 'back', nback, 'load_done', (select status from loads where id = l.id) = 'delivered');
end $$;
revoke all on function _stop_outcome(int, jsonb, text, text) from public, anon, authenticated;

-- the signed-in driver of the load, or the office (Distribution)
create or replace function record_stop_outcome(p_stop int, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l loads; s load_stops; mine boolean; office boolean;
begin
  perform no_view_as();
  perform require_staff_view();
  select * into s from load_stops where id = p_stop;
  if s.id is null then raise exception 'Stop not found'; end if;
  select * into l from loads where id = s.load_id;
  mine := l.driver_id is not null and l.driver_id = (my_driver()).id;
  office := is_owner() or mod_level('distribution') in ('user', 'admin');
  if not (mine or office) then raise exception 'This isn''t your load'; end if;
  -- changing an outcome that's already in: the office (a driver can fix their own for 2 hours)
  if (s.outcome is not null or s.status <> 'pending') and not office
     and not (mine and s.outcome_by = current_email() and s.outcome_at > now() - interval '2 hours') then
    raise exception 'Already recorded. Ask Distribution to change it.';
  end if;
  return _stop_outcome(p_stop, p, current_email(), case when office and not mine then 'office' else 'driver' end);
end $$;
revoke all on function record_stop_outcome(int, jsonb) from public, anon;
grant execute on function record_stop_outcome(int, jsonb) to authenticated;

create or replace function driver_link_outcome(p_token text, p_stop int, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k driver_links; who text;
begin
  k := _driver_link(p_token);
  if not exists (select 1 from load_stops where id = p_stop and load_id = k.load_id) then raise exception 'That stop isn''t on this load'; end if;
  who := 'link: ' || coalesce((select d.name || coalesce(' (' || c.name || ')', '') from fleet_drivers d left join fleet_carriers c on c.id = d.carrier_id where d.id = k.driver_id), 'carrier driver');
  update driver_links set last_used_at = now() where token = k.token;
  return _stop_outcome(p_stop, p, who, 'link');
end $$;
revoke all on function driver_link_outcome(text, int, jsonb) from public;
grant execute on function driver_link_outcome(text, int, jsonb) to anon, authenticated;

-- the photo for a stop (office, the load's driver)
create or replace function stop_photo(p_stop int) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff_view();
  if not (is_owner() or mod_level('distribution') is not null or mod_level('sales') is not null
          or (select l.driver_id from loads l join load_stops s on s.load_id = l.id where s.id = p_stop) = (my_driver()).id) then
    raise exception 'Not allowed';
  end if;
  return (select data from stop_photos where stop_id = p_stop);
end $$;
revoke all on function stop_photo(int) from public, anon;
grant execute on function stop_photo(int) to authenticated;

-- =====================================================================================================
-- 6. Inbound: coming back on our trucks
-- =====================================================================================================
create or replace function returns_coming_back() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff_view();
  if not (is_owner() or mod_level('distribution') is not null) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by x.outcome_at, x.load, x.seq, x.code) from (
    select r.id, r.stop_id, r.load_id, l.code as load, l.status as load_status, s.seq, c.name as customer, s.outcome, s.outcome_reason, s.outcome_at,
           s.manifest, r.kind, r.reason, r.note, p.id as pallet_id, p.code, upper(p.package_tag) as tag, p.strain, p.current_weight as lbs,
           (select metrc_name from items where id = p.item_id) as item,
           coalesce((select i.from_site from load_items i where i.stop_id = r.stop_id and i.pallet_id = r.top_id limit 1), pallet_site(p)) as from_site,
           exists (select 1 from gvr_stages g where g.pallet_id = r.top_id and g.load_id = r.load_id and g.status = 'shipped') as staged
      from stop_returns r join load_stops s on s.id = r.stop_id join loads l on l.id = r.load_id
      join customers c on c.id = s.customer_id join pallets p on p.id = r.pallet_id
     where r.back_at is null and r.cancelled_at is null) x), '[]'::jsonb);
end $$;
revoke all on function returns_coming_back() from public, anon;
grant execute on function returns_coming_back() to authenticated;

-- receive packages back at the farm: they land in Needs a spot (Staging) like any received pallet.
-- A GVR pallet that was staged at OHR comes back staged at OHR on GVR's license (Move back to GVR / put it on a load).
create or replace function receive_returns(p_ids bigint[], p_site text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; st text := upper(trim(coalesce(p_site, ''))); n int := 0; g gvr_stages; restaged int := 0;
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
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nothing to receive (already received?)'; end if;
  -- a stop with nothing left coming back: its Sales alert is done
  update app_alerts a set done_at = now(), done_by = current_email()
   where a.done_at is null and a.kind = 'stop_outcome' and a.module = 'sales'
     and not exists (select 1 from stop_returns x where x.stop_id = (a.ref ->> 'stop_id')::int and x.back_at is null and x.cancelled_at is null)
     and exists (select 1 from stop_returns x where x.stop_id = (a.ref ->> 'stop_id')::int and x.id = any(p_ids));
  return jsonb_build_object('received', n, 'restaged', restaged);
end $$;
revoke all on function receive_returns(bigint[], text) from public, anon;
grant execute on function receive_returns(bigint[], text) to authenticated;

-- delivery alerts (Transit, Sales, Accounting): open stop alerts for the modules I'm in
create or replace function stop_alerts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff_view();
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from app_alerts a
    where a.done_at is null and a.kind in ('stop_outcome', 'stop_metrc')
      and (is_owner() or (case when a.admins then mod_level(a.module) = 'admin' else mod_level(a.module) is not null end))), '[]'::jsonb);
end $$;
revoke all on function stop_alerts() from public, anon;
grant execute on function stop_alerts() to authenticated;

create or replace function stop_alert_done(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a app_alerts;
begin
  perform require_staff_view();
  perform no_view_as();
  select * into a from app_alerts where id = p_id;
  if a.id is null then return; end if;
  if not (is_owner() or mod_level(a.module) is not null) then raise exception 'Not your module'; end if;
  update app_alerts set done_at = now(), done_by = current_email() where id = a.id and done_at is null;
end $$;
revoke all on function stop_alert_done(bigint) from public, anon;
grant execute on function stop_alert_done(bigint) to authenticated;

-- GVR pallets that came back to OHR show in the Staged list with what happened
do $$
declare d text;
begin
  select pg_get_functiondef('gvr_stage_list()'::regprocedure) into d;
  if d not like '%Came back%' then
    execute replace(d, 'case when m.manifest is null and g.created_at',
      'case when g.load_id is null and g.note like ''Came back%'' then g.note || '': Move back to GVR, or put it on a load for '' || coalesce(c.name, ''the customer'')
                  when m.manifest is null and g.created_at');
  end if;
end $$;

-- realtime: the Driver screen and Inbound refresh when these change
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table stop_returns; exception when duplicate_object then null; end;
  end if;
end $$;

commit;
