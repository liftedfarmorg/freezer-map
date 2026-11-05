-- 197: Stage at OHR (Msg R-194 to R-198, 11/4). OHR has no processing license, so it can't receive GVR product in METRC.
-- Workaround until GVR stops growing FF and flower: GVR pallets for a customer order go to OHR in the app only, and the METRC
-- manifest runs from GVR straight to the customer.
--  * "Stage at OHR" on an order (Fulfillment): pick the truck, driver and ship date. The order goes on the customer's load
--    (the open one for that customer and date, else a new draft load). Its GVR pallets move to OHR Staging in the app (no
--    METRC transfer) and a METRC manifest is made right away from GVR to the customer with the staging driver and truck,
--    so the driver has it before leaving GVR. If METRC refuses it, the staging is taken back.
--  * Depart of that load updates the same METRC manifest to the load's driver, truck and times (api/metrc/_xfer.js).
--  * A staged pallet whose load is cancelled, that's taken off its load, or whose ship date passed: red alert (Fulfillment,
--    Loads). Move it back to GVR (the manifest is voided, or updated if other staged pallets stay on it), or put it back
--    on a load for the same customer (Use that load).
--  * While staged, the pallet can't be adjusted, split, retagged, combined or finished, or go on another customer's load.
--  * The license a stop ships from is now the METRC package's own license (else the site), so a GVR package sitting at
--    OHR goes on the GVR manifest.
--  * Send to OHR is blocked for frozen and flower at GVR while this is on (Admin setting dist.gvr_stage_workaround).
-- Frozen and flower only (fresh_frozen, bucked, unbucked). Customer orders only.
begin;

insert into app_settings (key, value) values ('dist.gvr_stage_workaround', 'true')
  on conflict (key) do update set value = 'true';

create or replace function gvr_stage_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_settings where key = 'dist.gvr_stage_workaround'), 'false') = 'true'
$$;

create or replace function metrc_pkg_license(p_tag text) returns text
language sql stable security definer set search_path = public as $$
  select m.license from metrc_packages m
   where upper(m.label) = upper(p_tag) and m.state = 'active'
   order by m.seen_at desc nulls last limit 1
$$;

create table if not exists gvr_stages (
  id               bigserial primary key,
  pallet_id        bigint not null references pallets(id),
  order_id         int,
  customer_id      int,
  load_id          int,
  stop_id          int,
  license          text not null,                 -- the license the METRC packages are on (GVR's)
  ship_date        date not null,
  stage_vehicle_id int,                           -- the truck taking it GVR > OHR (first version of the manifest)
  stage_driver     text,
  from_slot        int,                           -- where it was at GVR (Move back puts it there if still free)
  todo_id          bigint,                        -- the METRC to-do that made (or updated) the manifest at staging
  status           text not null default 'staged' check (status in ('staged', 'shipped', 'returned')),
  note             text,
  created_by       text default current_email(),
  created_at       timestamptz not null default now(),
  closed_at        timestamptz,
  closed_by        text
);
create unique index if not exists gvr_stages_open on gvr_stages (pallet_id) where status = 'staged';
create index if not exists gvr_stages_stop on gvr_stages (stop_id) where status = 'staged';
alter table gvr_stages enable row level security;
revoke all on gvr_stages from anon, authenticated;

-- ---------- the license a stop's package ships from: METRC's own, else the site's ----------
do $$
declare d text;
begin
  d := pg_get_functiondef('metrc_stop_packages(integer)'::regprocedure);
  if position('metrc_pkg_license(p.package_tag)' in d) > 0 then raise notice 'metrc_stop_packages already patched'; return; end if;
  if position('x.fs, site_license(x.fs),' in d) = 0 then raise exception 'metrc_stop_packages is not what this expects; nothing changed'; end if;
  d := replace(d, 'x.fs, site_license(x.fs),', 'x.fs, coalesce(metrc_pkg_license(p.package_tag), site_license(x.fs)),');
  execute d;
end $$;

-- ---------- Send to OHR: blocked for GVR frozen and flower while staging is on ----------
do $$
declare d text;
begin
  d := pg_get_functiondef('order_transfer(integer, integer, text)'::regprocedure);
  if position('gvr_stage_on()' in d) > 0 then raise notice 'order_transfer already patched'; return; end if;
  if position('if site not in (''OHR'', ''GVR'') then raise exception ''Send to OHR or GVR''; end if;' in d) = 0 then
    raise exception 'order_transfer is not what this expects; nothing changed';
  end if;
  d := replace(d, 'if site not in (''OHR'', ''GVR'') then raise exception ''Send to OHR or GVR''; end if;',
    'if site not in (''OHR'', ''GVR'') then raise exception ''Send to OHR or GVR''; end if;
  -- 197: OHR can''t receive GVR product in METRC: Stage at OHR instead (the manifest goes from GVR straight to the customer)
  if site = ''OHR'' and gvr_stage_on() and exists (select 1 from order_picks x join pallets c on c.id = x.pallet_id join pallets t on t.id = coalesce(c.container_id, c.id)
       where x.order_id = o.id and coalesce(pallet_site(t), '''') = ''GVR'' and coalesce(c.product, ''fresh_frozen'') in (''fresh_frozen'', ''bucked'', ''unbucked'')) then
    raise exception ''OHR can''''t receive GVR product in METRC right now. Use Stage at OHR on this order: the METRC manifest goes from GVR straight to the customer.'';
  end if;');
  execute d;
end $$;

-- ---------- what's on a top pallet (the pallet itself, or a mixed pallet's packages) ----------
create or replace function gvr_stage_packages(p_tops bigint[]) returns table (pallet_id bigint, top_id bigint, code text, tag text, product text, lic text)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(c.container_id, c.id), c.code, upper(c.package_tag), coalesce(c.product, 'fresh_frozen'), metrc_pkg_license(c.package_tag)
    from pallets c
   where (c.id = any(p_tops) and c.kind is distinct from 'mixed') or c.container_id = any(p_tops)
$$;

-- ---------- the METRC to-do for a stop's GVR manifest (make, update or void) ----------
create or replace function _gvr_stage_todo(p_stop int, p_license text, p_type text, p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare s load_stops; l loads; c customers; tags text[]; n int; id_ bigint;
begin
  select * into s from load_stops where id = p_stop;
  select * into l from loads where id = s.load_id;
  select * into c from customers where id = s.customer_id;
  select coalesce(array_agg(distinct k.tag) filter (where k.tag is not null), '{}'), count(*) into tags, n
    from metrc_stop_packages(p_stop) k where k.from_license = p_license;
  insert into comp_metrc_actions (at, license, action, summary, details, kind)
  values (now(), p_license,
          case p_type when 'stage_void' then 'Void manifest to ' || c.name || ' (staged at OHR, moved back)'
                      else 'Manifest to ' || c.name || ' (staged at OHR)' end,
          concat_ws(' · ', l.code, n || ' packages', p_note),
          jsonb_build_object('type', p_type, 'stop_id', p_stop, 'load_id', l.id, 'load', l.code, 'customer', c.name, 'to_license', c.license,
                             'tags', to_jsonb(tags), 'packages', n, 'by', current_email(), 'note', p_note),
          'manifest')
  returning id into id_;
  return id_;
end $$;
revoke all on function _gvr_stage_todo(int, text, text, text) from public, anon, authenticated;

-- ---------- Stage at OHR ----------
create or replace function stage_at_ohr(p_order int, p_vehicle int, p_driver text, p_ship_date date, p_load int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; cu customers; l loads; sid int; gl text := site_license('GVR'); tops bigint[]; bad text; t record; aid bigint; n int := 0; ship date;
begin
  perform require_distribution();
  perform no_view_as();
  if not gvr_stage_on() then raise exception 'Stage at OHR is off (Admin setting dist.gvr_stage_workaround)'; end if;
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status <> 'pending' then raise exception 'Only open orders can be staged'; end if;
  select * into cu from customers where id = o.customer_id;
  if cu.kind <> 'external' then raise exception 'Stage at OHR is for customer orders'; end if;
  if cu.license is null then raise exception '% has no license number in the app (the METRC manifest goes to it)', cu.name; end if;
  if p_vehicle is null or not exists (select 1 from fleet_assets where id = p_vehicle) then raise exception 'Pick the truck taking it to OHR'; end if;
  if nullif(trim(coalesce(p_driver, '')), '') is null then raise exception 'Pick the driver taking it to OHR'; end if;
  if gl is null then raise exception 'No license for GVR in the app'; end if;

  -- the order's pallets at GVR (a mixed pallet goes as one), not staged already
  select array_agg(distinct t2.id) into tops
    from order_picks x join pallets c on c.id = x.pallet_id join pallets t2 on t2.id = coalesce(c.container_id, c.id)
   where x.order_id = any(order_group(o.id)) and coalesce(pallet_site(t2), '') = 'GVR' and t2.status in ('in_freezer', 'unslotted')
     and not exists (select 1 from gvr_stages g where g.pallet_id = t2.id and g.status = 'staged');
  if tops is null then raise exception 'Nothing at GVR to stage on this order'; end if;
  select string_agg(k.code || ': ' || case when k.product not in ('fresh_frozen', 'bucked', 'unbucked') then 'not frozen or flower'
                                           when k.tag is null then 'no METRC tag'
                                           else 'not active on GVR''s license in METRC (' || coalesce(k.lic, 'not found') || ')' end, ', ')
    into bad
    from gvr_stage_packages(tops) k
   where k.product not in ('fresh_frozen', 'bucked', 'unbucked') or k.tag is null or coalesce(k.lic, '') <> gl;
  if bad is not null then raise exception 'Can''t stage %', bad; end if;

  -- the load: the order's own (if it's on one), the one picked, the open one for this customer and date, else a new draft
  if o.stop_id is not null then
    select l2.* into l from load_stops s join loads l2 on l2.id = s.load_id where s.id = o.stop_id;
    if l.status not in ('planning', 'loading') then raise exception 'This order''s load % has already left', l.code; end if;
    if p_load is not null and p_load <> l.id then raise exception 'This order is already on %. Stage it for that load, or take it off first.', l.code; end if;
    sid := o.stop_id;
  else
    if p_load is not null then
      select * into l from loads where id = p_load;
      if l.id is null or l.status not in ('planning', 'loading') then raise exception 'That load isn''t open'; end if;
    else
      if p_ship_date is null or p_ship_date < _local_today() then raise exception 'Pick the ship date (today or later)'; end if;
      select l2.* into l from loads l2
       where l2.status in ('planning', 'loading') and l2.load_date = p_ship_date
         and exists (select 1 from load_stops s where s.load_id = l2.id and s.customer_id = o.customer_id and s.status = 'pending')
       order by l2.id limit 1;
      if l.id is null then
        l := create_load(p_vehicle, p_ship_date, jsonb_build_array(jsonb_build_object('customer_id', o.customer_id, 'manifest', '')), null,
                         'Draft from Stage at OHR (' || coalesce(o.so_number, 'order #' || o.id) || '). Pick the truck and driver taking it to ' || cu.name || '.');
      end if;
    end if;
    perform order_to_load(o.id, l.id);
    select stop_id into sid from orders where id = o.id;
  end if;
  ship := l.load_date;

  -- every GVR pallet on the load's stop (order_to_load put them there; a pallet planned before may need it)
  for t in select id from pallets where id = any(tops) loop
    if not exists (select 1 from load_items where load_id = l.id and pallet_id = t.id) then perform plan_pallet(l.id, sid, t.id, null, false); end if;
  end loop;

  -- to OHR in the app (OHR Staging): no METRC transfer
  for t in select p.id, p.slot_id from pallets p where p.id = any(tops) loop
    insert into gvr_stages (pallet_id, order_id, customer_id, load_id, stop_id, license, ship_date, stage_vehicle_id, stage_driver, from_slot)
    values (t.id, o.id, o.customer_id, l.id, sid, gl, ship, p_vehicle, trim(p_driver), t.slot_id);
    n := n + 1;
  end loop;
  update pallets set slot_id = null, status = 'unslotted', received_site = 'OHR' where id = any(tops);

  -- the METRC manifest from GVR to the customer, now (run.js sends it right away)
  aid := _gvr_stage_todo(sid, gl, 'stage_manifest', n || ' staged by ' || trim(p_driver));
  update gvr_stages set todo_id = aid where stop_id = sid and status = 'staged' and todo_id is null;
  return jsonb_build_object('load_id', l.id, 'load', l.code, 'stop_id', sid, 'ship_date', ship, 'staged', n, 'todo', jsonb_build_array(aid));
end $$;
revoke all on function stage_at_ohr(int, int, text, date, int) from public, anon;
grant execute on function stage_at_ohr(int, int, text, date, int) to authenticated;

-- ---------- METRC refused the manifest at staging: take the staging back ----------
create or replace function stage_undo(p_todo bigint, p_reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare g record; n int := 0;
begin
  perform require_distribution();
  for g in select * from gvr_stages where todo_id = p_todo and status = 'staged' loop
    update pallets set received_site = 'GVR', status = case when g.from_slot is not null and not exists (select 1 from pallets x where x.slot_id = g.from_slot and x.id <> g.pallet_id) then 'in_freezer' else 'unslotted' end,
           slot_id = case when g.from_slot is not null and not exists (select 1 from pallets x where x.slot_id = g.from_slot and x.id <> g.pallet_id) then g.from_slot end
     where id = g.pallet_id;
    update gvr_stages set status = 'returned', closed_at = now(), closed_by = current_email(), note = concat_ws(' · ', note, 'METRC refused the manifest: ' || p_reason) where id = g.id;
    n := n + 1;
  end loop;
  update comp_metrc_actions set status = 'skipped', push_error = concat_ws(' · ', push_error, 'Staging taken back') where id = p_todo and status <> 'done';
  return n;
end $$;
revoke all on function stage_undo(bigint, text) from public, anon;
grant execute on function stage_undo(bigint, text) to authenticated;

-- ---------- Move back to GVR ----------
create or replace function unstage_to_gvr(p_stage bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g gvr_stages; it load_items; l loads; left_ int; aid bigint; free_ boolean;
begin
  perform require_distribution();
  perform no_view_as();
  select * into g from gvr_stages where id = p_stage for update;
  if g.id is null or g.status <> 'staged' then raise exception 'Not staged'; end if;
  if (select status from pallets where id = g.pallet_id) in ('in_transit', 'shipped') then raise exception 'It''s already on the truck'; end if;
  select i.* into it from load_items i join loads l2 on l2.id = i.load_id where i.pallet_id = g.pallet_id and l2.status in ('planning', 'loading') limit 1;
  if it.id is not null then perform remove_item(it.id); end if;
  free_ := g.from_slot is not null and not exists (select 1 from pallets x where x.slot_id = g.from_slot and x.id <> g.pallet_id);
  update pallets set received_site = 'GVR', status = case when free_ then 'in_freezer' else 'unslotted' end, slot_id = case when free_ then g.from_slot end
   where id = g.pallet_id;
  update gvr_stages set status = 'returned', closed_at = now(), closed_by = current_email() where id = g.id;
  -- the manifest: void it, or update it if GVR packages still go on it
  if g.stop_id is not null then
    select count(*) into left_ from metrc_stop_packages(g.stop_id) k where k.from_license = g.license;
    select * into l from loads where id = g.load_id;
    if exists (select 1 from metrc_app_transfers m where m.key = 'stop:' || g.stop_id || ':' || g.license and m.state <> 'voided') then
      aid := _gvr_stage_todo(g.stop_id, g.license, case when left_ > 0 and l.status in ('planning', 'loading') then 'stage_manifest' else 'stage_void' end,
                             (select code from pallets where id = g.pallet_id) || ' moved back to GVR');
    end if;
  end if;
  return jsonb_build_object('pallet', (select code from pallets where id = g.pallet_id), 'to_slot', case when free_ then g.from_slot end,
                            'todo', case when aid is null then '[]'::jsonb else jsonb_build_array(aid) end);
end $$;
revoke all on function unstage_to_gvr(bigint) from public, anon;
grant execute on function unstage_to_gvr(bigint) to authenticated;

-- ---------- Use that load: a staged pallet now on another load for the same customer ----------
create or replace function stage_relink(p_stage bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g gvr_stages; it record; old_key text; new_key text; aid bigint;
begin
  perform require_distribution();
  perform no_view_as();
  select * into g from gvr_stages where id = p_stage for update;
  if g.id is null or g.status <> 'staged' then raise exception 'Not staged'; end if;
  select i.load_id, i.stop_id, l.code, l.load_date into it from load_items i join loads l on l.id = i.load_id join load_stops s on s.id = i.stop_id
   where i.pallet_id = g.pallet_id and l.status in ('planning', 'loading') and s.customer_id = g.customer_id limit 1;
  if it.load_id is null then raise exception 'It isn''t on an open load for that customer. Put the order on one first.'; end if;
  if it.stop_id = g.stop_id then raise exception 'Already on that load'; end if;
  old_key := 'stop:' || g.stop_id || ':' || g.license;
  new_key := 'stop:' || it.stop_id || ':' || g.license;
  -- the manifest follows the pallets when nothing else staged stays on the old stop
  if not exists (select 1 from gvr_stages x where x.stop_id = g.stop_id and x.status = 'staged' and x.id <> g.id)
     and not exists (select 1 from metrc_app_transfers where key = new_key and state <> 'voided') then
    update metrc_app_transfers set key = new_key, stop_id = it.stop_id, load_id = it.load_id where key = old_key and state <> 'voided';
    update load_stops set manifest = null where id = g.stop_id and manifest = (select manifest from metrc_app_transfers where key = new_key);
  end if;
  update gvr_stages set load_id = it.load_id, stop_id = it.stop_id, ship_date = it.load_date where id = g.id;
  if exists (select 1 from metrc_app_transfers where key = new_key and state <> 'voided') then
    aid := _gvr_stage_todo(it.stop_id, g.license, 'stage_manifest', 'moved to ' || it.code);
  end if;
  return jsonb_build_object('load', it.code, 'todo', case when aid is null then '[]'::jsonb else jsonb_build_array(aid) end);
end $$;
revoke all on function stage_relink(bigint) from public, anon;
grant execute on function stage_relink(bigint) to authenticated;

-- ---------- what's staged, and what's wrong (red alerts) ----------
create or replace function gvr_stage_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_staff();
  if not (is_owner() or mod_level('distribution') is not null or mod_level('compliance') is not null) then return jsonb_build_object('on', gvr_stage_on(), 'stages', '[]'::jsonb); end if;
  return jsonb_build_object('on', gvr_stage_on(), 'stages', coalesce((
    select jsonb_agg(x order by x.problem is null, x.ship_date, x.code) from (
      select g.id, g.pallet_id, p.code, c.name as customer, g.order_id, o.so_number as so, g.load_id, l.code as load, l.status as load_status, g.ship_date,
             g.stage_driver, g.license, m.manifest,
             -- another open load for the same customer that has it now (Use that load)
             (select jsonb_build_object('load_id', l3.id, 'load', l3.code) from load_items i3 join loads l3 on l3.id = i3.load_id join load_stops s3 on s3.id = i3.stop_id
               where i3.pallet_id = g.pallet_id and l3.status in ('planning', 'loading') and s3.customer_id = g.customer_id and i3.stop_id is distinct from g.stop_id limit 1) as other_load,
             case when m.manifest is null and g.created_at < now() - interval '10 minutes' then 'No METRC manifest from GVR yet: send its METRC to-do, or Move back to GVR'
                  when l.id is null or l.status = 'cancelled' then 'Its load ' || coalesce(l.code, '') || ' was cancelled'
                  when not exists (select 1 from load_items i where i.load_id = g.load_id and i.pallet_id = g.pallet_id) then 'Taken off ' || l.code
                  when l.status in ('planning', 'loading', 'departing') and l.load_date < _local_today() then 'Ship date ' || to_char(l.load_date, 'Mon DD') || ' passed: still at OHR'
                  when l.status in ('planning', 'loading') and l.load_date <= _local_today()
                       and nullif(trim(coalesce(case when l.kind = 'pickup' then l.pickup_driver else l.driver end, '')), '') is null then 'Ships today and ' || l.code || ' has no driver yet'
             end as problem
        from gvr_stages g join pallets p on p.id = g.pallet_id
        left join customers c on c.id = g.customer_id
        left join orders o on o.id = g.order_id
        left join loads l on l.id = g.load_id
        left join metrc_app_transfers m on m.key = 'stop:' || g.stop_id || ':' || g.license and m.state <> 'voided'
       where g.status = 'staged' and coalesce(l.status, '') not in ('in_transit', 'delivered')) x), '[]'::jsonb));
end $$;
revoke all on function gvr_stage_list() from public, anon;
grant execute on function gvr_stage_list() to authenticated;

-- ---------- guards while staged ----------
create or replace function _gvr_stage_guard_pallet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from gvr_stages g where g.status = 'staged' and (g.pallet_id = old.id or g.pallet_id = old.container_id)) then return new; end if;
  if new.current_weight is distinct from old.current_weight or new.package_tag is distinct from old.package_tag
     or new.merged_into is distinct from old.merged_into or new.status in ('depleted', 'archived', 'merged') then
    raise exception '% is staged at OHR on a GVR METRC manifest. Ship it, or Move back to GVR first.', old.code;
  end if;
  return new;
end $$;
drop trigger if exists gvr_stage_guard on pallets;
create trigger gvr_stage_guard before update of current_weight, package_tag, merged_into, status on pallets
  for each row execute function _gvr_stage_guard_pallet();

create or replace function _gvr_stage_guard_load() returns trigger
language plpgsql security definer set search_path = public as $$
declare g gvr_stages; cid int;
begin
  select * into g from gvr_stages where pallet_id = new.pallet_id and status = 'staged';
  if g.id is null then return new; end if;
  select customer_id into cid from load_stops where id = new.stop_id;
  if cid is distinct from g.customer_id then
    raise exception 'This pallet is staged at OHR on a GVR METRC manifest to %. It can only go on a load to them (or Move back to GVR).',
      (select name from customers where id = g.customer_id);
  end if;
  return new;
end $$;
drop trigger if exists gvr_stage_guard_load on load_items;
create trigger gvr_stage_guard_load before insert or update of stop_id on load_items
  for each row execute function _gvr_stage_guard_load();

-- the load left: what was staged on it has shipped (Depart already updated the manifest)
create or replace function _gvr_stage_shipped() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('in_transit', 'delivered') and old.status is distinct from new.status then
    update gvr_stages g set status = 'shipped', closed_at = now(), closed_by = current_email()
     where g.load_id = new.id and g.status = 'staged' and exists (select 1 from load_items i where i.load_id = new.id and i.pallet_id = g.pallet_id);
  end if;
  return new;
end $$;
drop trigger if exists gvr_stage_shipped on loads;
create trigger gvr_stage_shipped after update of status on loads for each row execute function _gvr_stage_shipped();

commit;

-- check
select gvr_stage_on() as on_,
       position('metrc_pkg_license' in pg_get_functiondef('metrc_stop_packages(integer)'::regprocedure)) > 0 as license_from_metrc,
       position('gvr_stage_on()' in pg_get_functiondef('order_transfer(integer, integer, text)'::regprocedure)) > 0 as send_to_ohr_blocked;
