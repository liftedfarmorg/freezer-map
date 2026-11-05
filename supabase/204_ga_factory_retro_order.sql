-- Migration 204: bring the GA Factory order into the app after the fact (Aziz 11/4).
-- Rama made METRC manifest 0011828178 from GVR processing (CCL21-0000679) to GA FACTORY (DCC-10003533) on 11/4, departing 11/5,
-- before the order was in the app. The 6 packages are 2025 crop fresh frozen the app never had.
-- This makes: the order for Lazer Buddha (their METRC license is GA Factory), shipped 11/5 at $40/lb (2025 market price),
-- the 6 packages as shipped pallets picked onto it, and the invoice (the app's normal invoice, which then queues to QuickBooks).
-- Nothing goes to METRC: anything this queues for METRC is marked skipped, and new item cards are marked "in METRC" (they are).
-- Safe to re-run: does nothing if the order already exists. Run after 203.
set client_min_messages = warning;

do $$
declare o orders; inv invoices; mx bigint; it_mx bigint; r record; lid int; pid bigint; n_skip int;
begin
  if exists (select 1 from orders where notes like '%0011828178%') then
    raise notice 'GA Factory order for manifest 0011828178 is already in the app; nothing changed';
    return;
  end if;
  if not exists (select 1 from customers where id = 62 and name = 'Lazer Buddha') then raise exception 'Customer 62 is not Lazer Buddha'; end if;
  select coalesce(max(id), 0) into mx from comp_metrc_actions;
  select coalesce(max(id), 0) into it_mx from items;

  insert into orders (customer_id, status, order_date, shipped_date, source, notes, created_by, confirmed_by, confirmed_at)
  values (62, 'shipped', '2026-11-04', '2026-11-05', 'app',
          'METRC manifest 0011828178 to GA FACTORY (DCC-10003533), made in METRC by Rama 11/4 before the order was in the app; added after the fact',
          'aziz@lifted-organics.com', 'aziz@lifted-organics.com', now())
  returning * into o;

  -- one line per strain, then each package as a shipped pallet picked onto its line
  for r in
    select strain, sum(lbs) as lbs, array_agg(tag order by tag) as tags, array_agg(site order by tag) as sites, array_agg(lbs order by tag) as each_lbs
      from (values ('Hashburger',   50::numeric, '1A4060300030F35000007086', 'GVR'),
                   ('Banana Punch', 11::numeric, '1A4060300030F35000007088', 'GVR'),
                   ('Rum Runner',   50::numeric, '1A4060300030F35000007089', 'GVR'),
                   ('Sea Foam',     74::numeric, '1A4060300030F35000007090', 'GVR'),
                   ('Banana Punch', 88::numeric, '1A4060300030F35000007098', 'OHR'),
                   ('Garlic Juice', 60::numeric, '1A4060300030F35000007100', 'OHR')) v(strain, lbs, tag, site)
     group by strain
  loop
    insert into order_lines (order_id, strain, product, lbs, price_per_lb, price_override, crop_year)
    values (o.id, r.strain, 'fresh_frozen', r.lbs, 40, false, 2025)
    returning id into lid;
    for i in 1 .. array_length(r.tags, 1) loop
      if exists (select 1 from pallets where package_tag = r.tags[i]) then raise exception 'Package % is already in the app', r.tags[i]; end if;
      insert into pallets (code, strain, crop_year, product, kind, package_tag, og_weight, current_weight, status, origin_site, pushed, notes)
      values ('L25-' || right(r.tags[i], 4), r.strain, 2025, 'fresh_frozen', 'package', r.tags[i], r.each_lbs[i], r.each_lbs[i], 'shipped',
              r.sites[i], true, 'Shipped to GA Factory on METRC manifest 0011828178 (11/5/2026); added after the fact')
      returning id into pid;
      insert into order_picks (order_id, order_line_id, pallet_id, lbs, created_by)
      values (o.id, lid, pid, r.each_lbs[i], 'aziz@lifted-organics.com');
    end loop;
  end loop;

  inv := _make_invoice(o.id);

  insert into events (user_email, type, note, details)
  values ('aziz@lifted-organics.com', 'order_created', 'Added after the fact: METRC manifest 0011828178',
          jsonb_build_object('order_id', o.id, 'so', (select so_number from orders where id = o.id), 'customer', 'Lazer Buddha', 'manifest', '0011828178', 'lbs', 333));

  -- nothing from this goes to METRC (it's all there already)
  update items set metrc_status = 'in_metrc' where id > it_mx and metrc_status is distinct from 'in_metrc';
  update comp_metrc_actions set status = 'skipped', done_by = 'aziz@lifted-organics.com', done_at = now(),
         note = 'GA Factory order added after the fact (manifest 0011828178); already in METRC'
   where id > mx and status in ('todo', 'error');
  get diagnostics n_skip = row_count;

  raise notice 'Made % for Lazer Buddha, invoice % total %, METRC to-dos skipped: %',
    (select so_number from orders where id = o.id), inv.inv_number, inv.total, n_skip;
end $$;

-- check: the order, its lines and the invoice
select o.so_number, o.status, o.shipped_date, l.strain, l.crop_year, l.lbs, l.price_per_lb,
       (select string_agg(p.code || ' ' || p.package_tag, ', ') from order_picks x join pallets p on p.id = x.pallet_id where x.order_line_id = l.id) as packages,
       i.inv_number, i.total
  from orders o join order_lines l on l.order_id = o.id left join invoices i on i.order_id = o.id and i.status <> 'void'
 where o.notes like '%0011828178%' order by l.strain;
