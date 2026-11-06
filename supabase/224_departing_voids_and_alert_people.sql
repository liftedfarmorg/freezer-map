-- 224: METRC voids when an order comes off a load that's Departing (change-order plan D, Msg #268), plus who gets alerts.
-- Plan: change-order-walkthrough-250.md situations 5, 6; decisions in change-order-decisions-251.md (Aziz 11/5: build D,
-- leave it on Approve).
-- D. Load is Departing (manifests being made, truck still here):
--  * Transit > the stop > "Take stop off (void manifest)", or Sales > Cancel order: the whole stop comes off the load.
--    Its pallets come off the truck into Needs a spot (at the site they were loaded at), the stop shows as Taken off,
--    the orders go back to Ready (or Cancelled). Other stops carry on and Depart again finishes the load.
--  * METRC: if the stop's manifest isn't made yet, its to-do is skipped. If it is made, a "Void manifest" to-do is added
--    (kind manifest_void: Compliance > Settings, on Approve) and Rama gets an alert. If METRC refuses the void, the
--    to-do shows the error and the cancel stands (Aziz 11/5).
--  * A stop shared by orders that aren't all coming off: it stops and says so (take the whole stop off, or deliver it).
--    Changing one line during Departing isn't built: Back to loading if the manifest isn't made yet.
--  * Every stop taken off: if that leaves the load with no stops, the load is cancelled.
--  * Cancel order now checks the load before "shipped" (orders turn Shipped at Depart): on the road says record Not
--    delivered; only delivered / picked-up orders say Returns + credit memo.
-- Alerts:
--  * Admin > Settings > Alerts: per alert type, extra people who get it (push now, email once CCI is done) on top of the
--    module's people. Accounting flags use the same list as Accounting > Settings > People.
--  * New type "Move back to GVR" (gvr_back): a GVR pallet staged at OHR whose order isn't shipping within 2 days now
--    pushes Distribution (and the extra people) once, from the every-minute sender. Each person can turn the type off.
-- Safe to re-run.
begin;

alter table load_stops drop constraint if exists load_stops_status_check;
alter table load_stops add constraint load_stops_status_check check (status in ('pending', 'delivered', 'not_delivered', 'cancelled'));
alter table load_stops add column if not exists off_reason text;
alter table load_stops add column if not exists off_at timestamptz;
alter table load_stops add column if not exists off_by text;

-- ---------------------------------------------------------------- who gets alerts
create or replace function _alert_people(p_kind text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct lower(trim(v))) filter (where trim(v) <> ''), '{}')
    from unnest(string_to_array(coalesce((select value from app_settings
                                           where key = case when p_kind = 'acct_flag' then 'acct.alert_people' else 'alerts.people.' || p_kind end), ''), ',')) v
$$;
revoke all on function _alert_people(text) from public, anon, authenticated;

create or replace function alert_people_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff_view();
  if not (is_owner() or mod_level('admin') = 'admin' or exists (select 1 from app_users where email = jwt_email() and role = 'admin')) then return '[]'::jsonb; end if;
  return (select jsonb_agg(jsonb_build_object('kind', k, 'label', lbl, 'who', whom, 'people', array_to_string(_alert_people(k), ', ')) order by ord)
            from (values (1, 'stop_outcome', 'Delivery problems', 'Sales (and Owners)'),
                         (2, 'stop_metrc', 'METRC follow-ups (manifests to void, rejections to check)', 'Distribution Admins (and Owners)'),
                         (3, 'gvr_back', 'Move back to GVR (staged at OHR, order cancelled or not shipping within 2 days)', 'Distribution'),
                         (4, 'acct_flag', 'Accounting flags (credit memo needed)', 'Accounting')) x(ord, k, lbl, whom));
end $$;
revoke all on function alert_people_list() from public, anon;
grant execute on function alert_people_list() to authenticated;

create or replace function set_alert_people(p_kind text, p_emails text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  perform no_view_as();
  if not (is_owner() or exists (select 1 from app_users where email = jwt_email() and role = 'admin')
          or (p_kind = 'acct_flag' and mod_level('accounting') = 'admin')) then raise exception 'Only Owners and Admins'; end if;
  if p_kind not in ('stop_outcome', 'stop_metrc', 'gvr_back', 'acct_flag') then raise exception 'Unknown alert type'; end if;
  v := (select string_agg(distinct lower(trim(e)), ',') from unnest(string_to_array(replace(coalesce(p_emails, ''), ';', ','), ',')) e where trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  insert into app_settings (key, value) values (case when p_kind = 'acct_flag' then 'acct.alert_people' else 'alerts.people.' || p_kind end, coalesce(v, ''))
  on conflict (key) do update set value = excluded.value;
  return coalesce(v, '');
end $$;
revoke all on function set_alert_people(text, text) from public, anon;
grant execute on function set_alert_people(text, text) to authenticated;

-- ---------------------------------------------------------------- Move back to GVR: push once when it passes 2 days
create or replace function gvr_stage_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare g record; n int := 0; d date;
begin
  for g in select gs.id, gs.created_at, p.code, c.name as customer, o.so_number,
                  coalesce((select l4.load_date from load_stops s4 join loads l4 on l4.id = s4.load_id where s4.id = o.stop_id and l4.status in ('planning', 'loading', 'departing')),
                           o.wanted_date) as due
             from gvr_stages gs join pallets p on p.id = gs.pallet_id join orders o on o.id = gs.order_id
             left join customers c on c.id = gs.customer_id
            where gs.status = 'staged' and o.status not in ('shipped', 'cancelled') loop
    continue when g.due is null or g.due <= _local_today() + 2;
    continue when exists (select 1 from app_alerts a where a.kind = 'gvr_back' and a.ref ->> 'stage_id' = g.id::text and a.created_at >= g.created_at);
    perform _alert('distribution', false, 'gvr_back', 'Move ' || g.code || ' back to GVR: ' || coalesce(g.so_number, 'its order') || ' not shipping till ' || to_char(g.due, 'Mon DD'),
      g.code || ' is staged at OHR for ' || coalesce(g.customer, 'the customer') || ' and isn''t shipping for more than 2 days. Staging > Move back to GVR.',
      jsonb_build_object('stage_id', g.id, 'order_id', null));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function gvr_stage_sweep() from public, anon, authenticated;
grant execute on function gvr_stage_sweep() to service_role;

-- ---------------------------------------------------------------- D: a stop comes off a Departing load
create or replace function _stop_off_departing(p_stop int, p_why text, p_cancel int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s load_stops; l loads; c customers; it record; t record; n int := 0; voids text := null; skipped int := 0; aid bigint; sos text;
begin
  select * into s from load_stops where id = p_stop for update;
  select * into l from loads where id = s.load_id for update;
  if l.status <> 'departing' or s.status <> 'pending' then raise exception 'Stop % of % isn''t waiting to depart', s.seq, l.code; end if;
  select * into c from customers where id = s.customer_id;
  if exists (select 1 from comp_metrc_actions a where a.details ->> 'type' = 'stop_departed' and (a.details ->> 'stop_id')::int = s.id and a.push_state = 'sending') then
    raise exception 'METRC is making this stop''s manifest right now. Try again in a minute.';
  end if;
  select string_agg(coalesce(so_number, '#' || id), ', ') into sos from orders where stop_id = s.id;
  -- pallets: off the truck, into Needs a spot where they were loaded
  for it in select i.id, i.pallet_id, coalesce(i.from_site, 'OHR') as site from load_items i where i.stop_id = s.id loop
    update pallets set status = 'unslotted', slot_id = null, received_site = it.site, updated_at = now()
     where (id = it.pallet_id or container_id = it.pallet_id) and status = 'in_transit';
    insert into events (user_email, type, pallet_id, load_id, details)
    values (current_email(), 'unloaded', it.pallet_id, l.id, jsonb_build_object('load', l.code, 'site', it.site, 'why', 'stop taken off while departing (' || p_why || ')'));
    n := n + 1;
  end loop;
  delete from load_items where stop_id = s.id;
  -- METRC: its manifest to-dos that aren't done are skipped (nothing more gets made); made manifests get a Void to-do
  update comp_metrc_actions a set status = 'skipped', note = 'Stop taken off while departing (' || p_why || ')', done_by = current_email(), done_at = now()
   where a.details ->> 'type' = 'stop_departed' and (a.details ->> 'stop_id')::int = s.id and a.status in ('todo', 'error');
  get diagnostics skipped = row_count;
  for t in select m.key, split_part(m.key, ':', 3) as lic, coalesce(nullif(trim(m.manifest), ''), nullif(trim(s.manifest), '')) as manifest
             from metrc_app_transfers m where m.key like 'stop:' || s.id || ':%' and m.state <> 'voided'
           union
           select null, k.license, trim(s.manifest) from (select distinct a.license from comp_metrc_actions a
                   where a.details ->> 'type' = 'stop_departed' and (a.details ->> 'stop_id')::int = s.id and a.status = 'done') k
            where nullif(trim(s.manifest), '') is not null
              and not exists (select 1 from metrc_app_transfers m where m.key = 'stop:' || s.id || ':' || k.license) loop
    continue when exists (select 1 from comp_metrc_actions a where a.kind = 'manifest_void' and a.details ->> 'stop_id' = s.id::text and a.license is not distinct from t.lic and a.status in ('todo', 'error', 'done'));
    insert into comp_metrc_actions (at, license, action, summary, details, kind)
    values (now(), t.lic, 'Void manifest ' || coalesce(t.manifest, '(number pending)') || ' to ' || c.name || ' (taken off while departing)',
            concat_ws(' · ', l.code, 'stop ' || s.seq, sos, p_why),
            jsonb_build_object('type', 'manifest_void', 'why', 'departing', 'stop_id', s.id, 'load_id', l.id, 'load', l.code, 'customer', c.name,
                               'manifest', t.manifest, 'orders', sos, 'by', current_email()),
            'manifest_void')
    returning id into aid;
    voids := concat_ws(', ', voids, coalesce(t.manifest, '(number pending)'));
  end loop;
  if voids is not null then
    perform _alert('distribution', true, 'stop_metrc', 'METRC: void manifest ' || voids || ' (' || c.name || ', taken off ' || l.code || ')',
      sos || ' ' || p_why || ' while ' || l.code || ' was departing. Its pallets are back in Needs a spot. Approve the Void to-do in Compliance > METRC.',
      jsonb_build_object('stop_id', s.id, 'load_id', l.id));
  end if;
  -- GVR pallets staged at OHR on this stop
  for t in select gs.id, p.code from gvr_stages gs join pallets p on p.id = gs.pallet_id where gs.stop_id = s.id and gs.status = 'staged' loop
    perform _alert('distribution', false, 'gvr_back', 'Move ' || t.code || ' back to GVR: ' || coalesce(sos, '') || ' ' || p_why,
      t.code || ' was staged at OHR for ' || c.name || ' on ' || l.code || '. Staging > Move back to GVR, or put it on another load.',
      jsonb_build_object('stage_id', t.id, 'stop_id', s.id));
  end loop;
  update load_stops set status = 'cancelled', off_reason = p_why, off_at = now(), off_by = current_email() where id = s.id;
  update orders set stop_id = null, updated_at = now() where stop_id = s.id;
  insert into events (user_email, type, load_id, details)
  values (current_email(), 'stop_taken_off', l.id, jsonb_build_object('load', l.code, 'stop_id', s.id, 'seq', s.seq, 'customer', c.name, 'orders', sos,
          'why', p_why, 'pallets', n, 'skipped_todos', skipped, 'void', voids));
  if not exists (select 1 from load_stops where load_id = l.id and status = 'pending') then
    update loads set status = 'cancelled', closed_at = now(), depart_error = null where id = l.id;
    insert into events (user_email, type, load_id, details) values (current_email(), 'load_cancelled', l.id, jsonb_build_object('load', l.code, 'why', 'every stop taken off while departing'));
  end if;
  return jsonb_build_object('pallets', n, 'void', voids, 'skipped', skipped, 'load_cancelled', (select status from loads where id = l.id) = 'cancelled');
end $$;
revoke all on function _stop_off_departing(int, text, int) from public, anon, authenticated;

-- Transit: take a whole stop off a Departing load
create or replace function stop_off_departing(p_stop int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform require_distribution();
  perform no_view_as();
  return _stop_off_departing(p_stop, 'taken off', null);
end $$;
revoke all on function stop_off_departing(int) from public, anon;
grant execute on function stop_off_departing(int) to authenticated;

create or replace function _cancel_order_guard(o orders) returns void
language plpgsql security definer set search_path = public as $$
declare s load_stops; l loads; on_truck text; others text;
begin
  if o.stop_id is not null then
    select * into s from load_stops where id = o.stop_id;
    select * into l from loads where id = s.load_id;
  end if;
  if l.id is not null and l.status = 'in_transit' and s.status = 'pending' then
    raise exception '% is on the road. Record the stop as Not delivered > Customer cancelled; the order cancels once the product is received back.', l.code;
  end if;
  if o.status = 'shipped' then
    raise exception 'Order % was delivered. Product coming back goes through Returns, and a credit memo on its invoice fixes the money.', coalesce(o.so_number, '#' || o.id);
  end if;
  if l.id is null or l.status in ('cancelled', 'delivered', 'in_transit') then return; end if;
  if l.status = 'departing' then
    select string_agg(coalesce(so_number, '#' || id), ', ') into others from orders where stop_id = s.id and id <> o.id and status <> 'cancelled';
    if others is not null then
      raise exception '% shares stop % of % (one METRC manifest) with %. Take the whole stop off in Transit, or deliver it.', coalesce(o.so_number, '#' || o.id), s.seq, l.code, others;
    end if;
    perform _stop_off_departing(s.id, 'cancelled', o.id);
    return;
  end if;
  select string_agg(distinct p.code, ', ') into on_truck
    from load_items i join pallets p on p.id = i.pallet_id
   where i.stop_id = s.id and i.loaded
     and i.pallet_id in (select coalesce(pp.container_id, pp.id) from order_picks x join pallets pp on pp.id = x.pallet_id where x.order_id = o.id);
  if on_truck is not null then
    raise exception '% already on the truck for %. Unload it back into a freezer first (Transit > %), then cancel.', on_truck, l.code, l.code;
  end if;
  delete from load_items i where i.stop_id = s.id
     and i.pallet_id in (select coalesce(pp.container_id, pp.id) from order_picks x join pallets pp on pp.id = x.pallet_id where x.order_id = o.id);
end $$;
revoke all on function _cancel_order_guard(orders) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public._alert_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text[]; url text := (select value from app_settings where key = 'app.url');
begin
  select array_agg(distinct e) into who from (
    select m.email as e from module_access m where m.module = new.module and (not new.admins or m.level = 'admin')
    union select u.email from app_users u where u.owner and new.kind like 'stop_%'
    union select lower(trim(v)) from unnest(string_to_array(coalesce((select value from app_settings where key = 'acct.alert_people'), ''), ',')) v
           where new.module = 'accounting' and trim(v) <> ''
    union select unnest(_alert_people(new.kind))) x;
  if who is not null then perform _notify(who, new.title, new.body, url, new.kind, new.ref); end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.order_off_load(p_order integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders; s load_stops; l loads; grp int[]; gid int;
begin
  perform require_distribution();
  select * into o from orders where id = p_order for update;
  if o.stop_id is null then return; end if;
  select * into s from load_stops where id = o.stop_id;
  select * into l from loads where id = s.load_id;
  if l.status = 'cancelled' then
    update orders set stop_id = null, updated_at = now() where id = o.id;
    return;
  end if;
  grp := (select array_agg(id) from orders where id = any(order_group(o.id)) and stop_id = s.id);
  -- 224: Departing: the whole stop comes off (its manifest is voided or its to-do skipped)
  if l.status = 'departing' then
    if exists (select 1 from orders where stop_id = s.id and status <> 'cancelled' and not id = any(grp)) then
      raise exception 'Other orders share stop % of % (one METRC manifest). Take the whole stop off instead.', s.seq, l.code;
    end if;
    perform _stop_off_departing(s.id, 'taken off', null);
    return;
  end if;
  if l.status not in ('planning','loading') then raise exception 'Load % has already left', l.code; end if;
  if exists (select 1 from load_items i where i.stop_id = s.id and i.loaded and i.pallet_id in (
               select coalesce(p.container_id, p.id) from order_picks x join pallets p on p.id = x.pallet_id where x.order_id = any(grp))) then
    raise exception 'Some of its pallets are already on the truck. Put them back first.';
  end if;
  delete from load_items i where i.stop_id = s.id and i.pallet_id in (
    select coalesce(p.container_id, p.id) from order_picks x join pallets p on p.id = x.pallet_id where x.order_id = any(grp));
  update orders set stop_id = null, updated_at = now() where id = any(grp);
  if not exists (select 1 from load_items where stop_id = s.id) and not exists (select 1 from orders where stop_id = s.id)
     and (select count(*) from load_stops where load_id = l.id) > 1 then
    delete from load_stops where id = s.id;
  end if;
  foreach gid in array grp loop
    insert into events (user_email, type, load_id, details)
    values (current_email(), 'fulfill_unloaded', l.id, jsonb_build_object('load', l.code, 'order_id', gid, 'so', (select so_number from orders where id = gid)));
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.stop_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_staff_view();
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from app_alerts a
    where a.done_at is null and a.kind in ('stop_outcome', 'stop_metrc', 'acct_flag', 'gvr_back')
      and (is_owner() or (case when a.admins then mod_level(a.module) = 'admin' else mod_level(a.module) is not null end)
           or jwt_email() = any(_alert_people(a.kind))
           or (a.module = 'accounting' and jwt_email() = any(string_to_array(replace(coalesce((select value from app_settings where key = 'acct.alert_people'), ''), ' ', ''), ','))))), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public._notify_type(p_kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p_kind = 'stop_outcome' then 't_delivery' when p_kind = 'stop_metrc' then 't_metrc'
              when p_kind = 'driver_load' then 't_load_assigned' when p_kind = 'driver_depart' then 't_load_left' when p_kind = 'gvr_back' then 't_staging' when p_kind = 'acct_flag' then 't_acct' else 't_other' end
$function$
;

CREATE OR REPLACE FUNCTION public._notify(p_emails text[], p_title text, p_body text, p_url text, p_kind text, p_ref jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u record; n int := 0; ty text := _notify_type(p_kind);
begin
  for u in select a.email, a.phone, coalesce(a.prefs -> 'notify', '{}'::jsonb) as nf from app_users a
            where a.email = any(p_emails) and a.role in ('admin', 'sales', 'crew') loop
    if not coalesce((u.nf ->> ty)::boolean, true) then continue; end if;      -- they turned this type off
    if coalesce((u.nf ->> 'alerts_push')::boolean, true) and exists (select 1 from push_subs s where s.email = u.email) then
      insert into push_outbox (email, title, body, url, tag, kind) values (u.email, p_title, p_body, p_url, p_kind || ':' || coalesce(p_ref ->> 'stop_id', p_ref ->> 'load_id', p_ref ->> 'stage_id', p_ref ->> 'invoice_id', ''), p_kind);
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
end $function$
;

CREATE OR REPLACE FUNCTION public._cancel_order_after(o orders)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s load_stops; l loads; c customers; g record; inv invoices; so text := coalesce(o.so_number, '#' || o.id);
begin
  select * into c from customers where id = o.customer_id;
  -- an emptied stop comes off the load (unless it's the load's only stop)
  if o.stop_id is not null then
    select * into s from load_stops where id = o.stop_id;
    select * into l from loads where id = s.load_id;
    if l.status in ('planning', 'loading') and not exists (select 1 from load_items where stop_id = s.id)
       and not exists (select 1 from orders where stop_id = s.id and id <> o.id and status <> 'cancelled')
       and (select count(*) from load_stops where load_id = l.id) > 1 then
      update orders set stop_id = null where stop_id = s.id;
      delete from load_stops where id = s.id;
    end if;
    insert into events (user_email, type, load_id, details)
    values (current_email(), 'fulfill_unloaded', l.id, jsonb_build_object('load', l.code, 'order_id', o.id, 'so', o.so_number, 'why', 'order cancelled'));
  end if;
  -- GVR pallets staged at OHR for it
  for g in select gs.id, p.code from gvr_stages gs join pallets p on p.id = gs.pallet_id where gs.order_id = o.id and gs.status = 'staged'
             and not exists (select 1 from app_alerts a where a.kind = 'gvr_back' and a.done_at is null and a.ref ->> 'stage_id' = gs.id::text) loop
    perform _alert('distribution', false, 'gvr_back', 'Move ' || g.code || ' back to GVR: ' || so || ' cancelled',
      g.code || ' was staged at OHR for ' || coalesce(c.name, 'the customer') || '. Staging > Move back to GVR (it voids or updates its METRC manifest), or put it on another order.',
      jsonb_build_object('stage_id', g.id, 'order_id', o.id));
  end loop;
  -- money already invoiced
  select * into inv from invoices where order_id = o.id and status <> 'void' order by id desc limit 1;
  if inv.id is not null then
    perform _alert('accounting', false, 'acct_flag', 'Credit memo: ' || so || ' cancelled after its invoice ' || inv.inv_number,
      coalesce(c.name, '') || ': ' || inv.inv_number || ' (' || to_char(inv.total, 'FM$999,999,990.00') || ')' ||
      case when inv.acct_status = 'sent' then ' is in QuickBooks.' else ' isn''t in QuickBooks yet.' end || ' Make a credit memo on it (reason: cancelled).',
      jsonb_build_object('invoice_id', inv.id, 'order_id', o.id));
  end if;
end $function$
;

commit;
