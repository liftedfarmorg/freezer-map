-- 214: Put Lazer Buddha's order (SO-26110403, GA Factory, METRC manifest 0011828178) on the 11/5 load it actually rode on,
-- as one mixed pallet on the truck, so it can be the first real test of "Not delivered" (Msg #241/#242, Aziz 11/5).
--
-- Why: SQL 204 added the order after the fact as shipped with no load, so there's no stop to record an outcome on.
-- Aziz 11/5: it was on today's load, it's one mixed pallet, it was NOT delivered (rescheduled, no date yet), it's still on
-- the truck, the manifest stays open until the driver portal is built and tested. Advance payment is held for redelivery.
--
-- What this does (database only, nothing goes to METRC or QuickBooks):
--   * finds the 11/5 load that's in transit (set v_code below if there's more than one, or to pick a different one)
--   * adds a stop for Lazer Buddha on it with manifest 0011828178, status pending (not delivered)
--   * makes one mixed pallet M<next> on the truck (in transit) holding the 6 packages, which go from shipped back to in transit
--   * ties the order to that stop (the order stays shipped, as for any load that has left)
--   * skips any METRC to-dos this happens to queue
-- Safe to re-run: does nothing if the stop already exists. Run anytime before the test. Nothing else depends on it.
set client_min_messages = notice;

do $$
declare
  v_code text := null;              -- e.g. 'L-1105-2' to pick the load by hand; null = the only 11/5 load in transit
  l loads; s load_stops; m pallets; o orders; n int; pos int; cap int; mx bigint; n_skip int; listed text;
  tags text[] := array['1A4060300030F35000007086','1A4060300030F35000007088','1A4060300030F35000007089',
                       '1A4060300030F35000007090','1A4060300030F35000007098','1A4060300030F35000007100'];
begin
  if exists (select 1 from load_stops where customer_id = 62 and manifest = '0011828178') then
    raise notice 'Lazer Buddha is already on a load with manifest 0011828178; nothing changed'; return;
  end if;
  select * into o from orders where notes like '%0011828178%';
  if o.id is null then raise exception 'Order for manifest 0011828178 not found (run 204 first)'; end if;
  if o.customer_id <> 62 then raise exception 'That order is not Lazer Buddha'; end if;
  if o.stop_id is not null then raise exception 'The order is already on a stop (%)', o.stop_id; end if;

  if v_code is not null then
    select * into l from loads where code = v_code;
    if l.id is null then raise exception 'Load % not found', v_code; end if;
  else
    select count(*), string_agg(code || ' (' || status || ')', ', ' order by code) into n, listed
      from loads where load_date = '2026-11-05' and status in ('in_transit', 'delivered') and coalesce(kind, 'delivery') = 'delivery';
    if n <> 1 then raise exception 'Found % loads for 11/5: %. Set v_code at the top to the one Lazer Buddha rode on.', n, coalesce(listed, 'none'); end if;
    select * into l from loads where load_date = '2026-11-05' and status in ('in_transit', 'delivered') and coalesce(kind, 'delivery') = 'delivery';
  end if;
  if l.status not in ('in_transit', 'delivered') then raise exception 'Load % is %, not one that has left', l.code, l.status; end if;

  select count(*) into n from pallets where package_tag = any(tags) and status = 'shipped' and container_id is null;
  if n <> 6 then raise exception 'Expected the 6 packages as shipped and loose, found %', n; end if;
  select coalesce(max(id), 0) into mx from comp_metrc_actions;

  -- the stop: last on the truck, not delivered
  insert into load_stops (load_id, seq, customer_id, manifest, status)
  values (l.id, coalesce((select max(seq) from load_stops where load_id = l.id), 0) + 1, 62, '0011828178', 'pending')
  returning * into s;
  -- a load that already shows delivered goes back to in transit: this stop is still open
  if l.status = 'delivered' then update loads set status = 'in_transit', closed_at = null where id = l.id; end if;

  -- the mixed pallet, on the truck
  insert into pallets (code, kind, label, status, slot_id, notes)
  values ('M' || nextval('mixed_pallet_seq'), 'mixed', 'Mixed pallet', 'in_transit', null,
          'Lazer Buddha / GA Factory, manifest 0011828178. Added to ' || l.code || ' after the fact (SQL 214). Not delivered 11/5, rescheduled.')
  returning * into m;
  select spaces into cap from vehicles where id = l.vehicle_id;
  select min(g) into pos from generate_series(1, greatest(coalesce(cap, 1), 1) + 20) g where not exists (select 1 from load_items where load_id = l.id and position = g);
  insert into load_items (load_id, stop_id, pallet_id, position, loaded, from_site) values (l.id, s.id, m.id, coalesce(pos, 1), true, 'GVR');

  -- the 6 packages: from shipped back to in transit, inside the mixed pallet
  update pallets set status = 'in_transit', container_id = m.id, slot_id = null, updated_at = now(),
         notes = concat_ws('. ', notes, 'On ' || m.code || ' (' || l.code || '), not delivered 11/5 (SQL 214)')
   where package_tag = any(tags);

  update orders set stop_id = s.id, updated_at = now() where id = o.id;

  insert into events (user_email, type, pallet_id, load_id, note, details)
  values ('aziz@lifted-organics.com', 'mixed_created', m.id, l.id, 'Added after the fact (SQL 214)',
          jsonb_build_object('packages', to_jsonb(tags), 'load', l.code, 'on_truck', true, 'order', o.so_number, 'manifest', '0011828178'));

  update comp_metrc_actions set status = 'skipped', done_by = 'aziz@lifted-organics.com', done_at = now(),
         note = 'SQL 214: Lazer Buddha put on ' || l.code || ' after the fact; nothing to send'
   where id > mx and status in ('todo', 'error');
  get diagnostics n_skip = row_count;

  raise notice 'Lazer Buddha: stop % on % (manifest 0011828178), mixed pallet % with 6 packages on the truck, order % tied to the stop. METRC to-dos skipped: %',
    s.seq, l.code, m.code, o.so_number, n_skip;
end $$;

-- check: the stop, the pallet and what's in it, the order
select l.code as load, l.status as load_status, s.seq, s.status as stop_status, s.manifest, o.so_number, o.status as order_status,
       mp.code as mixed, mp.status as mixed_status,
       (select string_agg(p.code || ' ' || p.strain || ' ' || p.current_weight || ' lb (' || p.status || ')', ', ' order by p.code) from pallets p where p.container_id = mp.id) as inside
  from load_stops s join loads l on l.id = s.load_id
  join orders o on o.stop_id = s.id
  join load_items i on i.stop_id = s.id join pallets mp on mp.id = i.pallet_id
 where s.customer_id = 62 and s.manifest = '0011828178';
