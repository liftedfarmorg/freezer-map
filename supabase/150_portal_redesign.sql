-- 150: customer portal redesign (Matt, Nov 2026). Run after 149. Safe to run more than once.
--  1. Older crops (e.g. 2025 while 2026 is current) can be reserved and ordered against:
--     _menu_numbers / open_menu / _orderable look at reserves for every crop year up to the current one.
--  2. One reserve request can mix crop years: request_reserve_batch takes a crop_year on each line (p_year is the fallback),
--     and a hold_line on a line links it to a sample hold. Approving that request ends the hold (the lbs are now reserved).
--  3. A customer's own held lbs count as available to them when they ask to reserve that strain.
--  4. Customers can release a sample hold, modify an order until pallets are assigned (it goes back to Submitted for Lifted
--     to confirm again), and cancel an order until pallets are assigned.
--  5. my_order_flags: which of my orders are in fulfillment (pallets assigned). my_contract: terms, payment terms, deposit and
--     lbs picked up by month since October of the crop year (that crop's earlier pickups count in October).
--  6. request_decision_notification: after an Admin approves or declines, the portal logins of that customer get an email.

alter table reserve_requests add column if not exists hold_line_id int references order_lines(id) on delete set null;
alter table reserve_requests add column if not exists decision_emailed_at timestamptz;
alter table orders add column if not exists modified_at timestamptz;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. menu numbers: reserves left for every crop year up to the current one come off the menu
-- ---------------------------------------------------------------------------------------------------------------
create or replace function _menu_numbers()
returns table (strain text, crop_year int, on_menu boolean, on_hand numeric, pending numeric, reserved_left numeric, held numeric, free numeric)
language sql stable security definer set search_path = public as $$
  with cy as (select crop_year() as y),
  names as (
    select canonical_strain(p.strain) as s, coalesce(extract(year from p.harvest_date)::int, (select y from cy)) as yr,
           sum(coalesce(p.current_weight, 0)) as lbs
      from pallets p
     where p.kind = 'package' and p.product = 'fresh_frozen' and p.status in ('in_freezer','unslotted') and p.pushed and p.strain is not null
     group by 1, 2),
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

create or replace function open_menu()
returns table (strain text, crop_year int, available numeric, my_reserved numeric, my_shipped numeric, my_pending numeric, my_left numeric,
               request_id int, requested_lbs numeric, my_hold numeric, my_hold_until date)
language plpgsql stable security definer set search_path = public as $$
declare me int := my_customer();
begin
  if me is null and not is_sales() then raise exception 'Not allowed'; end if;
  return query
    select m.strain, m.crop_year, case when m.on_menu then greatest(floor(m.free / 10) * 10, 0) else 0 end,
           b.reserved, b.shipped, b.pending, b.remaining, q.id, q.requested_lbs, h.lbs, h.until
      from _menu_numbers() m
      left join reserve_balances b on b.crop_year = m.crop_year and b.customer_id = me and lower(b.strain) = lower(m.strain)
      left join reserve_requests q on q.crop_year = m.crop_year and q.customer_id = me and lower(q.strain) = lower(m.strain) and q.status = 'pending'
      left join lateral (select sum(x.remaining) as lbs, max(x.until) as until from _sample_holds() x
                          where x.customer_id = me and lower(x.strain) = lower(m.strain) and x.crop_year = m.crop_year and x.state in ('waiting','active')) h on true
     where (m.on_menu and m.free >= 10) or b.id is not null or q.id is not null or coalesce(h.lbs, 0) > 0
     order by m.crop_year desc, m.strain;
end $$;

-- what a customer can order: their reserve left for that crop year (any year), their own active holds, plus what's open
create or replace function _orderable(p_customer int)
returns table (strain text, crop_year int, my_left numeric, open_lbs numeric, can_order numeric)
language sql stable security definer set search_path = public as $$
  select m.strain, m.crop_year, x.mine, x.open, greatest(x.mine + x.open - x.waiting, 0)
    from _menu_numbers() m
    join customers c on c.id = p_customer
    left join reserve_balances b on b.crop_year = m.crop_year and b.customer_id = p_customer and lower(b.strain) = lower(m.strain)
    cross join lateral (select coalesce(sum(h.remaining), 0) as lbs from _sample_holds() h
                         where h.customer_id = p_customer and lower(h.strain) = lower(m.strain) and h.crop_year = m.crop_year and h.state in ('waiting','active')) hold
    cross join lateral (select coalesce(sum(l.lbs + case when l.is_sample then coalesce(l.hold_lbs, 0) else 0 end), 0) as lbs
                          from orders o join order_lines l on l.order_id = o.id
                         where o.customer_id = p_customer and o.status = 'submitted' and l.product = 'fresh_frozen'
                           and lower(l.strain) = lower(m.strain) and l.crop_year = m.crop_year) sub
    cross join lateral (select
      (case when c.reserves_enabled then floor(coalesce(b.remaining, 0) / 10) * 10 else 0 end) + floor(hold.lbs / 10) * 10 as mine,
      case when m.on_menu then greatest(floor(m.free / 10) * 10, 0) else 0 end as open,
      sub.lbs as waiting) x
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2/3. reserve requests: older crops allowed, own holds count as available
-- ---------------------------------------------------------------------------------------------------------------
create or replace function request_reserve_change(p_strain text, p_lbs numeric, p_note text default null, p_year int default null) returns int
language plpgsql security definer set search_path = public as $$
declare me int := my_customer(); cy int := crop_year(); yr int := coalesce(p_year, crop_year()); s text := canonical_strain(p_strain);
        cur reserves; b reserve_balances; m record; q reserve_requests; avail numeric; dl date; held numeric;
begin
  perform no_view_as();
  if me is null then raise exception 'Only a customer login can request reserve changes'; end if;
  if not coalesce((select reserves_enabled from customers where id = me), false) then
    raise exception 'Reserves aren''t set up for your account. Contact Lifted.';
  end if;
  if yr > cy then
    dl := reserve_deadline(yr);
    if dl is null then raise exception 'Reserves for the % crop aren''t open yet', yr; end if;
    if current_date > dl then raise exception 'Reserve requests for the % crop closed on %', yr, to_char(dl, 'Mon FMDD, YYYY'); end if;
  end if;
  if s is null then raise exception 'Unknown strain %', p_strain; end if;
  if p_lbs is null or p_lbs < 0 then raise exception 'Enter 0 or more lbs'; end if;
  if p_lbs % 10 <> 0 then raise exception 'Use multiples of 10 lbs'; end if;
  select * into cur from reserves where customer_id = me and lower(strain) = lower(s) and product = 'fresh_frozen' and crop_year = yr;
  select * into b from reserve_balances where customer_id = me and lower(strain) = lower(s) and crop_year = yr;
  if p_lbs = coalesce(cur.lbs, 0) then raise exception 'That''s already your reserve'; end if;
  select * into q from reserve_requests where customer_id = me and lower(strain) = lower(s) and status = 'pending' and crop_year = yr;
  if yr <= cy then
    if p_lbs < coalesce(b.shipped, 0) + coalesce(b.pending, 0) then
      raise exception 'You''ve already shipped or ordered % lbs of %, so the reserve can''t go below that', coalesce(b.shipped, 0) + coalesce(b.pending, 0), s;
    end if;
    select * into m from _menu_numbers() x where lower(x.strain) = lower(s) and x.crop_year = yr;
    if yr < cy and m.strain is null then raise exception 'The % crop of % isn''t on the menu', yr, s; end if;
    -- the customer's own active sample holds on it are theirs to reserve
    select coalesce(sum(h.remaining), 0) into held from _sample_holds() h
     where h.customer_id = me and lower(h.strain) = lower(s) and h.crop_year = yr and h.state = 'active';
    -- room on the menu, not counting this customer's own open request on the strain
    avail := floor((case when coalesce(m.on_menu, true) then coalesce(m.free, 0) else 0 end + held
                    + greatest(coalesce(q.requested_lbs, 0) - coalesce(cur.lbs, 0), 0)) / 10) * 10;
    if p_lbs - coalesce(cur.lbs, 0) > avail then
      raise exception 'Only % lbs more of % is available right now', greatest(avail, 0), s;
    end if;
  end if;
  if q.id is not null then
    update reserve_requests set requested_lbs = p_lbs, current_lbs = coalesce(cur.lbs, 0), note = nullif(trim(p_note), ''),
           requested_by = jwt_email(), requested_at = now(), notified_at = null
     where id = q.id returning * into q;
  else
    insert into reserve_requests (customer_id, strain, current_lbs, requested_lbs, note, requested_by, crop_year)
    values (me, s, coalesce(cur.lbs, 0), p_lbs, nullif(trim(p_note), ''), jwt_email(), yr) returning * into q;
  end if;
  insert into events (user_email, type, note, details)
  values (jwt_email(), 'reserve_request', p_note, jsonb_build_object('customer_id', me, 'customer', (select name from customers where id = me),
          'strain', s, 'from', coalesce(cur.lbs, 0), 'to', p_lbs, 'request_id', q.id, 'crop_year', yr));
  return q.id;
end $$;
revoke execute on function request_reserve_change(text,numeric,text,int) from public, anon;
grant execute on function request_reserve_change(text,numeric,text,int) to authenticated;

-- p_lines: [{"strain": "Zowah", "crop_year": 2025, "lbs": 300, "hold_line": 812}]  (crop_year falls back to p_year, then the current crop)
create or replace function request_reserve_batch(p_lines jsonb, p_note text default null, p_year int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me int := my_customer(); yr int; b uuid := gen_random_uuid(); l jsonb; s text; n numeric; hl int;
        cur numeric; q reserve_requests; rid int; ids int[] := '{}'; nc int := 0;
begin
  perform no_view_as();
  if me is null then raise exception 'Only a customer login can request reserve changes'; end if;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    s := canonical_strain(l ->> 'strain');
    n := nullif(l ->> 'lbs', '')::numeric;
    yr := coalesce(nullif(l ->> 'crop_year', '')::int, p_year, crop_year());
    hl := nullif(l ->> 'hold_line', '')::int;
    if s is null or n is null then continue; end if;
    if hl is not null and not exists (select 1 from _sample_holds() h where h.line_id = hl and h.customer_id = me and h.state = 'active') then
      raise exception '%: that sample hold has ended', s;
    end if;
    select lbs into cur from reserves where customer_id = me and lower(strain) = lower(s) and product = 'fresh_frozen' and crop_year = yr;
    select * into q from reserve_requests where customer_id = me and lower(strain) = lower(s) and status = 'pending' and crop_year = yr;
    if n = coalesce(cur, 0) and q.id is null then continue; end if;
    if n = coalesce(cur, 0) and q.id is not null then
      update reserve_requests set status = 'cancelled', decided_by = jwt_email(), decided_at = now() where id = q.id;
      nc := nc + 1;
      continue;
    end if;
    if q.id is not null and q.requested_lbs = n and hl is null then continue; end if;
    begin
      rid := request_reserve_change(s, n, p_note, yr);
    exception when others then
      raise exception '%: %', s, sqlerrm;
    end;
    update reserve_requests set batch_id = b, hold_line_id = coalesce(hl, hold_line_id) where reserve_requests.id = rid;
    ids := ids || rid;
  end loop;
  if cardinality(ids) = 0 and nc = 0 then raise exception 'Nothing changed. Enter a new total for at least one strain.'; end if;
  -- count includes requests taken back (set back to the current reserve)
  return jsonb_build_object('batch', b, 'ids', to_jsonb(ids), 'count', cardinality(ids) + nc);
end $$;

-- approving a request that came from a sample hold ends the hold: those lbs are reserved now
create or replace function _close_request_hold(p_request int) returns void
language sql security definer set search_path = public as $$
  update order_lines set hold_released_at = now(), hold_released_by = 'reserve request #' || p_request
   where id = (select hold_line_id from reserve_requests where id = p_request) and hold_released_at is null
$$;

create or replace function decide_reserve_requests(p_items jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; q reserve_requests; b reserve_balances; amt numeric; ok int := 0; no int := 0;
begin
  perform no_view_as();
  if not is_admin() then raise exception 'Only an Admin can approve reserve changes'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    select * into q from reserve_requests where id = (it ->> 'id')::int for update;
    if q.id is null or q.status <> 'pending' then continue; end if;
    if coalesce((it ->> 'approve')::boolean, false) then
      amt := coalesce(nullif(it ->> 'lbs', '')::numeric, q.requested_lbs);
      if amt < 0 then raise exception '%: amount can''t be negative', q.strain; end if;
      select * into b from reserve_balances where customer_id = q.customer_id and lower(strain) = lower(q.strain) and crop_year = q.crop_year;
      if amt < coalesce(b.shipped, 0) + coalesce(b.pending, 0) then
        raise exception '%: they''ve shipped or ordered % lbs, more than %', q.strain, coalesce(b.shipped, 0) + coalesce(b.pending, 0), amt;
      end if;
      perform _apply_reserve(q.customer_id, q.strain, amt, coalesce(p_note, q.note), current_email(), 'request', q.crop_year);
      update reserve_requests set status = 'approved', approved_lbs = amt, decided_by = current_email(), decided_at = now(),
             decision_note = coalesce(nullif(trim(p_note), ''), case when amt <> q.requested_lbs then 'Approved at ' || amt || ' lbs' end)
       where id = q.id;
      perform _close_request_hold(q.id);
      ok := ok + 1;
    else
      update reserve_requests set status = 'declined', decided_by = current_email(), decided_at = now(), decision_note = nullif(trim(p_note), '')
       where id = q.id;
      no := no + 1;
    end if;
    insert into events (user_email, type, note, details)
    values (current_email(), case when coalesce((it ->> 'approve')::boolean, false) then 'reserve_approved' else 'reserve_declined' end, p_note,
            jsonb_build_object('customer_id', q.customer_id, 'customer', (select name from customers where id = q.customer_id),
                               'strain', q.strain, 'from', q.current_lbs, 'to', case when coalesce((it ->> 'approve')::boolean, false) then amt else q.requested_lbs end,
                               'asked', q.requested_lbs, 'request_id', q.id, 'crop_year', q.crop_year));
  end loop;
  return jsonb_build_object('approved', ok, 'declined', no);
end $$;

create or replace function decide_reserve_request(p_id int, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform decide_reserve_requests(jsonb_build_array(jsonb_build_object('id', p_id, 'approve', p_approve)), p_note);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. customers: release a hold, modify or cancel an order until pallets are assigned
-- ---------------------------------------------------------------------------------------------------------------
create or replace function release_my_hold(p_line int) returns void
language plpgsql security definer set search_path = public as $$
declare me int := my_customer(); h record;
begin
  perform no_view_as();
  select * into h from _sample_holds() x where x.line_id = p_line and x.customer_id = me;
  if h.line_id is null or h.state not in ('waiting','active') then raise exception 'That hold has already ended'; end if;
  update order_lines set hold_released_at = now(), hold_released_by = jwt_email() where id = p_line;
  insert into events (user_email, type, note, details)
  values (jwt_email(), 'sample_hold', h.strain, jsonb_build_object('order_id', h.order_id, 'so', h.so_number, 'line_id', p_line, 'release', true,
          'by', 'customer', 'customer', (select name from customers where id = me)));
end $$;

create or replace function _order_in_fulfillment(p_order int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from order_picks where order_id = p_order)
$$;

create or replace function cancel_my_order(p_id int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform no_view_as();
  if _order_in_fulfillment(p_id) then raise exception 'Lifted is already packing this order. Contact your Lifted rep to change it.'; end if;
  update orders set status = 'cancelled', updated_at = now() where id = p_id and customer_id = my_customer() and status in ('submitted','pending');
  if not found then raise exception 'This order can''t be cancelled here. Contact Lifted.'; end if;
  insert into events (user_email, type, details) values (jwt_email(), 'order_cancelled', jsonb_build_object('order_id', p_id, 'by', 'customer'));
end $$;

-- same checks as place_order; the order keeps its SO number and goes back to Submitted for Lifted to confirm again
create or replace function update_my_order(p_id int, p_lines jsonb, p_note text default null, p_po text default null, p_wanted date default null)
returns int
language plpgsql security definer set search_path = public as $$
declare me int := my_customer(); o orders; l record; s text; ok record; price numeric; n int := 0; was text;
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
    select * into ok from _orderable(me) x where lower(x.strain) = lower(s) and x.crop_year = l.yr;
    if coalesce(ok.can_order, 0) < l.lbs then
      raise exception 'Only % lbs of % (% crop) can be ordered right now', coalesce(ok.can_order, 0), s, l.yr;
    end if;
    if l.smp and coalesce(l.hold, 0) > 0 and coalesce(ok.can_order, 0) < l.lbs + l.hold then
      raise exception 'Only % lbs of % can be held after this sample', greatest(coalesce(ok.can_order, 0) - l.lbs, 0), s;
    end if;
    select t.price_per_lb into price from terms_for(me, l.yr) t;
    insert into order_lines (order_id, strain, lbs, price_per_lb, crop_year, is_sample, hold_lbs)
    values (o.id, s, l.lbs, price, l.yr, l.smp, case when l.smp and coalesce(l.hold, 0) > 0 then l.hold end);
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

-- ---------------------------------------------------------------------------------------------------------------
-- 5. portal reads
-- ---------------------------------------------------------------------------------------------------------------
create or replace function my_order_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(distinct p.order_id), '[]')
    from order_picks p join orders o on o.id = p.order_id
   where o.customer_id = my_customer() and o.status in ('submitted','pending')
$$;

create or replace function my_contract() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me int := my_customer(); cy int := crop_year(); oct date; t record; cu customers; months jsonb;
begin
  if me is null then return null; end if;
  select * into cu from customers where id = me;
  select * into t from terms_for(me, cy) limit 1;
  oct := make_date(cy, 10, 1);
  with ships as (
    select greatest(date_trunc('month', coalesce(o.shipped_date, o.order_date))::date, oct) as m, l.lbs,
           coalesce(o.shipped_date, o.order_date) < oct as early
      from orders o join order_lines l on l.order_id = o.id
     where o.customer_id = me and o.status = 'shipped' and l.product = 'fresh_frozen'
       and (coalesce(o.shipped_date, o.order_date) >= oct or (l.crop_year = cy and coalesce(o.shipped_date, o.order_date) >= make_date(cy, 1, 1)))),
  mm as (select generate_series(oct, greatest(date_trunc('month', current_date)::date, oct), interval '1 month')::date as m)
  select coalesce(jsonb_agg(jsonb_build_object('month', mm.m, 'lbs', coalesce(x.lbs, 0), 'early', coalesce(x.early, 0)) order by mm.m), '[]')
    into months
    from mm left join (select m, sum(lbs) as lbs, sum(lbs) filter (where early) as early from ships group by m) x on x.m = mm.m
   where mm.m <= date_trunc('month', current_date)::date;
  return jsonb_build_object('year', cy, 'price_per_lb', t.price_per_lb, 'contract_lbs', t.contract_lbs, 'monthly_min_lbs', t.monthly_min_lbs,
    'deposit_usd', t.deposit_usd, 'payment_terms', coalesce((select pt.label from payment_terms pt where pt.code = cu.payment_terms), cu.payment_terms),
    'reserves_enabled', coalesce(cu.reserves_enabled, false), 'months', months);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. tell the customer when an Admin decides (once per request); called by api/notify-request.js as the Admin
-- ---------------------------------------------------------------------------------------------------------------
create or replace function request_decision_notification(p_ids int[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_admin() then return '[]'; end if;
  with ds as (
    update reserve_requests set decision_emailed_at = now()
     where id = any(p_ids) and status in ('approved','declined') and decision_emailed_at is null
    returning *)
  select coalesce(jsonb_agg(x), '[]') into out from (
    select ds.customer_id, (select name from customers where id = ds.customer_id) as customer,
           (select jsonb_agg(u.email) from app_users u where u.role = 'customer' and u.customer_id = ds.customer_id) as to,
           jsonb_agg(jsonb_build_object('strain', ds.strain, 'crop_year', ds.crop_year, 'status', ds.status, 'from', ds.current_lbs,
                     'asked', ds.requested_lbs, 'approved', ds.approved_lbs, 'note', ds.decision_note) order by ds.strain) as lines
      from ds group by ds.customer_id) x;
  return out;
end $$;

revoke execute on function request_reserve_batch(jsonb, text, int), decide_reserve_requests(jsonb, text), decide_reserve_request(int, boolean, text),
  release_my_hold(int), cancel_my_order(int), update_my_order(int, jsonb, text, text, date), my_order_flags(), my_contract(),
  request_decision_notification(int[]), _close_request_hold(int), _order_in_fulfillment(int), open_menu() from public, anon;
grant execute on function request_reserve_batch(jsonb, text, int), decide_reserve_requests(jsonb, text), decide_reserve_request(int, boolean, text),
  release_my_hold(int), cancel_my_order(int), update_my_order(int, jsonb, text, text, date), my_order_flags(), my_contract(),
  request_decision_notification(int[]), open_menu() to authenticated;

select 'ok' as portal_redesign;
