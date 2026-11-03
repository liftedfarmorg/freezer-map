-- 162: Portal orders with many strains timed out (Matt, 11/2: Bear Labs Humboldt, 1,410 lbs, "canceling statement due to statement timeout").
--  * place_order / update_my_order checked each strain by working out the whole menu again (_orderable, ~0.8 s each). A 20+ strain
--    order went past the 8 s limit. Now the menu is worked out once per order and each line takes its lbs off that, the same way
--    the earlier lines of the same order were counted before (lbs, plus the hold on a sample line).
--  * _menu_numbers looked up the strain name of every pallet one at a time (~0.7 s). Now once per distinct name (~0.1 s).
--    Same numbers; the portal menu and staff screens get faster too.
-- Same checks, same messages, same results. Safe to re-run. RUN LIVE 11/2/2026 (Matt, via Claude) after a rolled-back test on live data:
-- a 30-strain Bear Labs order took 185 ms (was over 8 s); menu and orderable numbers identical before and after.
begin;

-- the menu (150), strain names looked up once per name instead of once per pallet
create or replace function _menu_numbers()
returns table (strain text, crop_year int, on_menu boolean, on_hand numeric, pending numeric, reserved_left numeric, held numeric, free numeric)
language sql stable security definer set search_path = public as $$
  with cy as (select crop_year() as y),
  raw as (
    select p.strain, coalesce(extract(year from p.harvest_date)::int, (select y from cy)) as yr, sum(coalesce(p.current_weight, 0)) as lbs
      from pallets p
     where p.kind = 'package' and p.product = 'fresh_frozen' and p.status in ('in_freezer','unslotted') and p.pushed and p.strain is not null
     group by 1, 2),
  names as (select canonical_strain(r.strain) as s, r.yr, sum(r.lbs) as lbs from raw r group by 1, 2),
  pend as (
    select lower(l.strain) as k, l.crop_year as yr, sum(l.lbs) as lbs from orders o join order_lines l on l.order_id = o.id
     where o.status = 'pending' and l.product = 'fresh_frozen' group by 1, 2),
  res as (select lower(b.strain) as k, b.crop_year as yr, sum(b.remaining) as lbs from reserve_balances b
           where b.crop_year <= (select y from cy) group by 1, 2),
  samp as (select lower(h.strain) as k, h.crop_year as yr, sum(h.remaining) as lbs from _sample_holds() h where h.state in ('waiting','active') group by 1, 2),
  allk as (
    select s as name, yr from names where s is not null
    union select r.strain, r.crop_year from reserves r where r.crop_year <= (select y from cy) and r.product = 'fresh_frozen'
    union select l.strain, l.crop_year from orders o join order_lines l on l.order_id = o.id where o.status in ('pending','submitted') and l.product = 'fresh_frozen'),
  k as (select distinct on (lower(name), yr) name, yr from allk order by lower(name), yr, name)
  select k.name, k.yr,
         coalesce((select st.show_on_menu from strains st where lower(st.name) = lower(k.name) limit 1), true),
         coalesce(n.lbs, 0), coalesce(pe.lbs, 0),
         coalesce(re.lbs, 0),
         coalesce(sp.lbs, 0),
         coalesce(n.lbs, 0) - coalesce(pe.lbs, 0) - coalesce(sp.lbs, 0) - coalesce(re.lbs, 0)
    from k
    left join names n on lower(n.s) = lower(k.name) and n.yr = k.yr
    left join pend pe on pe.k = lower(k.name) and pe.yr = k.yr
    left join res re on re.k = lower(k.name) and re.yr = k.yr
    left join samp sp on sp.k = lower(k.name) and sp.yr = k.yr
$$;

-- a customer places an order (061): what they can order is worked out once
create or replace function place_order(p_lines jsonb, p_note text default null, p_po text default null, p_wanted date default null, p_sample boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
declare me int := my_customer(); l record; s text; o orders; price numeric; n int := 0;
        avail jsonb; took jsonb := '{}'; k text; can numeric;
begin
  perform no_view_as();
  if me is null then raise exception 'Only a customer login can place orders'; end if;
  perform pg_advisory_xact_lock(4242);          -- one order at a time, so two can't take the same lbs
  insert into orders (customer_id, status, order_date, source, notes, po_number, wanted_date, placed_by, created_by, is_sample)
  values (me, 'submitted', current_date, 'portal', nullif(trim(p_note), ''), nullif(trim(p_po), ''), p_wanted, jwt_email(), jwt_email(), false)
  returning * into o;
  select coalesce(jsonb_object_agg(lower(x.strain) || '|' || x.crop_year, x.can_order), '{}') into avail from _orderable(me) x;
  for l in
    select x ->> 'strain' as strain, coalesce((x ->> 'crop_year')::int, crop_year()) as yr,
           coalesce(p_sample, false) or coalesce((x ->> 'sample')::boolean, false) as smp,
           sum((x ->> 'lbs')::numeric) as lbs, max(nullif(x ->> 'hold_lbs', '')::numeric) as hold
      from jsonb_array_elements(coalesce(p_lines, '[]')) x group by 1, 2, 3
  loop
    if coalesce(l.lbs, 0) <= 0 then continue; end if;
    if l.lbs % 10 <> 0 then raise exception 'Use multiples of 10 lbs (% lbs of %)', l.lbs, l.strain; end if;
    if l.smp and coalesce(l.hold, 0) % 10 <> 0 then raise exception 'Hold amounts go in multiples of 10 lbs (% lbs of %)', l.hold, l.strain; end if;
    s := canonical_strain(l.strain);
    if s is null then raise exception 'Unknown strain %', l.strain; end if;
    k := lower(s) || '|' || l.yr;
    can := greatest(coalesce((avail ->> k)::numeric, 0) - coalesce((took ->> k)::numeric, 0), 0);   -- less what this order already took
    if can < l.lbs then
      raise exception 'Only % lbs of % (% crop) can be ordered right now', can, s, l.yr;
    end if;
    if l.smp and coalesce(l.hold, 0) > 0 and can < l.lbs + l.hold then
      raise exception 'Only % lbs of % can be held after this sample', greatest(can - l.lbs, 0), s;
    end if;
    select t.price_per_lb into price from terms_for(me, l.yr) t;
    insert into order_lines (order_id, strain, lbs, price_per_lb, crop_year, is_sample, hold_lbs)
    values (o.id, s, l.lbs, price, l.yr, l.smp, case when l.smp and coalesce(l.hold, 0) > 0 then l.hold end);
    took := jsonb_set(took, array[k], to_jsonb(coalesce((took ->> k)::numeric, 0) + l.lbs + case when l.smp and coalesce(l.hold, 0) > 0 then l.hold else 0 end));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Add at least one strain'; end if;
  update orders set is_sample = exists (select 1 from order_lines where order_id = o.id and is_sample) where id = o.id;
  insert into events (user_email, type, note, details)
  values (jwt_email(), 'order_placed', p_note, jsonb_build_object('order_id', o.id, 'customer_id', me,
          'samples', (select count(*) from order_lines where order_id = o.id and is_sample),
          'customer', (select name from customers where id = me), 'lbs', (select sum(lbs) from order_lines where order_id = o.id), 'lines', n));
  return o.id;
end $$;
revoke execute on function place_order(jsonb, text, text, date, boolean) from public, anon;
grant execute on function place_order(jsonb, text, text, date, boolean) to authenticated;

-- a customer changes their order (150): same checks as place_order
create or replace function update_my_order(p_id int, p_lines jsonb, p_note text default null, p_po text default null, p_wanted date default null)
returns int
language plpgsql security definer set search_path = public as $$
declare me int := my_customer(); o orders; l record; s text; price numeric; n int := 0; was text;
        avail jsonb; took jsonb := '{}'; k text; can numeric;
begin
  perform no_view_as();
  if me is null then raise exception 'Only a customer login can change orders'; end if;
  perform pg_advisory_xact_lock(4242);
  select * into o from orders where id = p_id and customer_id = me for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status not in ('submitted','pending') or _order_in_fulfillment(o.id) then
    raise exception 'Lifted is already packing this order. Contact your Lifted rep to change it.';
  end if;
  was := o.status;
  -- take it out of the numbers while checking the new lines
  update orders set status = 'draft' where id = o.id;
  delete from order_lines where order_id = o.id;
  select coalesce(jsonb_object_agg(lower(x.strain) || '|' || x.crop_year, x.can_order), '{}') into avail from _orderable(me) x;
  for l in
    select x ->> 'strain' as strain, coalesce((x ->> 'crop_year')::int, crop_year()) as yr,
           coalesce((x ->> 'sample')::boolean, false) as smp,
           sum((x ->> 'lbs')::numeric) as lbs, max(nullif(x ->> 'hold_lbs', '')::numeric) as hold
      from jsonb_array_elements(coalesce(p_lines, '[]')) x group by 1, 2, 3
  loop
    if coalesce(l.lbs, 0) <= 0 then continue; end if;
    if l.lbs % 10 <> 0 then raise exception 'Use multiples of 10 lbs (% lbs of %)', l.lbs, l.strain; end if;
    if l.smp and coalesce(l.hold, 0) % 10 <> 0 then raise exception 'Hold amounts go in multiples of 10 lbs (% lbs of %)', l.hold, l.strain; end if;
    s := canonical_strain(l.strain);
    if s is null then raise exception 'Unknown strain %', l.strain; end if;
    k := lower(s) || '|' || l.yr;
    can := greatest(coalesce((avail ->> k)::numeric, 0) - coalesce((took ->> k)::numeric, 0), 0);
    if can < l.lbs then
      raise exception 'Only % lbs of % (% crop) can be ordered right now', can, s, l.yr;
    end if;
    if l.smp and coalesce(l.hold, 0) > 0 and can < l.lbs + l.hold then
      raise exception 'Only % lbs of % can be held after this sample', greatest(can - l.lbs, 0), s;
    end if;
    select t.price_per_lb into price from terms_for(me, l.yr) t;
    insert into order_lines (order_id, strain, lbs, price_per_lb, crop_year, is_sample, hold_lbs)
    values (o.id, s, l.lbs, price, l.yr, l.smp, case when l.smp and coalesce(l.hold, 0) > 0 then l.hold end);
    took := jsonb_set(took, array[k], to_jsonb(coalesce((took ->> k)::numeric, 0) + l.lbs + case when l.smp and coalesce(l.hold, 0) > 0 then l.hold else 0 end));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Add at least one strain, or cancel the order instead'; end if;
  update orders set status = 'submitted', notes = nullif(trim(p_note), ''), po_number = nullif(trim(p_po), ''), wanted_date = p_wanted,
         is_sample = exists (select 1 from order_lines where order_id = o.id and is_sample),
         placed_by = jwt_email(), notified_at = null, modified_at = now(), updated_at = now()
   where id = o.id;
  insert into events (user_email, type, note, details)
  values (jwt_email(), 'order_modified', p_note, jsonb_build_object('order_id', o.id, 'so', o.so_number, 'customer_id', me, 'was', was,
          'customer', (select name from customers where id = me), 'lbs', (select sum(lbs) from order_lines where order_id = o.id), 'lines', n));
  return o.id;
end $$;

commit;
