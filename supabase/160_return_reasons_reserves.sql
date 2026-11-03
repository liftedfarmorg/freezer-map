-- 160: returns, part 2.
--  * A reason on every return line (a return can mix them). New reason "Not delivered" (on the manifest, not on the truck):
--    its credit memo line is Product Refund; everything else is Product Return. The return's own reason is the lines' reason,
--    or "mixed".
--  * Reserves net out returns (reserve_balances): Fulfilled = shipped - received back. For Quality and Yield returns the
--    customer's reserve on that strain is released: Reserved becomes what they kept (shipped - returned + still on open orders),
--    so Remaining is 0 and the strain stays on their list. Other reasons (wrong strain, overshipped, damaged, not delivered,
--    other) just give the returned lbs back to Remaining. The original reserve is kept in original_lbs.
-- Run after 159. Safe to re-run.
begin;

alter table return_orders drop constraint if exists return_orders_reason_check;
alter table return_orders add constraint return_orders_reason_check
  check (reason in ('quality', 'wrong_strain', 'overshipped', 'damaged', 'yield', 'not_delivered', 'other', 'mixed'));
alter table return_lines add column if not exists reason text;
update return_lines l set reason = r.reason from return_orders r where r.id = l.return_id and l.reason is null and r.reason <> 'mixed';
update return_lines set reason = 'other' where reason is null;
alter table return_lines alter column reason set not null;
alter table return_lines drop constraint if exists return_lines_reason_check;
alter table return_lines add constraint return_lines_reason_check
  check (reason in ('quality', 'wrong_strain', 'overshipped', 'damaged', 'yield', 'not_delivered', 'other'));

-- ---------- start a return: a reason per line (p_reason is the default for lines without one) ----------
create or replace function create_return(p_order int, p_lines jsonb, p_reason text, p_notes text default null) returns return_orders
language plpgsql security definer set search_path = public as $$
declare o orders; r return_orders; l jsonb; ol jsonb; avail numeric; want numeric; n int := 0; why text; whys text[] := '{}';
begin
  perform no_view_as();
  if not can_edit('sales') then raise exception 'Only Sales can start returns'; end if;
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status <> 'shipped' then raise exception 'Only shipped orders can be returned'; end if;
  insert into return_orders (rma, customer_id, order_id, reason, notes)
  values ('RMA-' || lpad(nextval('return_rma_seq')::text, 4, '0'), o.customer_id, o.id, 'mixed', nullif(trim(p_notes), ''))
  returning * into r;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    want := nullif(l ->> 'lbs', '')::numeric;
    if coalesce(want, 0) <= 0 then continue; end if;
    why := coalesce(nullif(l ->> 'reason', ''), nullif(p_reason, ''));
    if why is null or why not in ('quality', 'wrong_strain', 'overshipped', 'damaged', 'yield', 'not_delivered', 'other') then raise exception 'Pick a reason for every line'; end if;
    select x into ol from jsonb_array_elements(return_order_lines(o.id)) x where (x ->> 'id')::int = (l ->> 'line_id')::int;
    if ol is null then raise exception 'That line isn''t on this order'; end if;
    avail := (ol ->> 'shipped_lbs')::numeric - (ol ->> 'returned_lbs')::numeric;
    if want > avail + 0.001 then raise exception '% (%): only % lbs can come back (% shipped, % on other returns)', ol ->> 'strain', ol ->> 'crop_year',
      round(avail, 2), ol ->> 'shipped_lbs', ol ->> 'returned_lbs'; end if;
    insert into return_lines (return_id, order_line_id, strain, crop_year, product, site, price_per_lb, lbs, tags, reason)
    values (r.id, (ol ->> 'id')::int, ol ->> 'strain', (ol ->> 'crop_year')::int, ol ->> 'product',
            coalesce(nullif(l ->> 'site', ''), ol ->> 'site'), nullif(ol ->> 'price', '')::numeric, want,
            coalesce(array(select jsonb_array_elements_text(ol -> 'tags')), '{}'), why);
    whys := array_append(whys, why);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Add at least one line with lbs'; end if;
  update return_orders set reason = case when (select count(distinct x) from unnest(whys) x) = 1 then whys[1] else 'mixed' end where id = r.id returning * into r;
  insert into events (user_email, type, note, details)
  values (current_email(), 'return_created', r.rma || ' for ' || (select name from customers where id = r.customer_id),
          jsonb_build_object('return_id', r.id, 'rma', r.rma, 'order_id', o.id, 'so', o.so_number, 'reason', r.reason, 'lines', n));
  return r;
end $$;

-- ---------- the list: each line's reason ----------
create or replace function returns_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'rma', r.rma, 'status', r.status, 'reason', r.reason, 'notes', r.notes, 'manifest', r.manifest,
      'customer_id', r.customer_id, 'customer', c.name, 'order_id', r.order_id, 'so', o.so_number,
      'created_by', r.created_by, 'created_at', r.created_at, 'received_at', r.received_at, 'cancelled_at', r.cancelled_at,
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'strain', l.strain, 'crop_year', l.crop_year, 'site', l.site, 'lbs', l.lbs,
                  'received_lbs', l.received_lbs, 'price', l.price_per_lb, 'tags', l.tags, 'reason', l.reason,
                  'packages', (select coalesce(jsonb_agg(jsonb_build_object('tag', rp.tag, 'lbs', rp.lbs, 'code', p.code, 'at', rp.received_at)), '[]')
                                 from return_packages rp left join pallets p on p.id = rp.pallet_id where rp.return_line_id = l.id)) order by l.id), '[]')
                  from return_lines l where l.return_id = r.id),
      'credits', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'number', m.cm_number, 'total', m.total, 'date', m.memo_date, 'status', m.status,
                  'acct_status', m.acct_status, 'qbo_doc', m.qbo_doc, 'error', m.acct_error, 'sent_at', m.sent_at, 'created_at', m.created_at) order by m.id), '[]')
                  from credit_memos m where m.return_id = r.id)
    ) order by r.id desc), '[]')
    from return_orders r join customers c on c.id = r.customer_id left join orders o on o.id = r.order_id
   where is_sales() or has_module('accounting')
$$;

-- ---------- receive: credit memo lines are Product Refund for "not delivered", Product Return otherwise ----------
create or replace function return_receive(p_return int, p_manifest text, p_rows jsonb, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r return_orders; x jsonb; p pallets; rl0 return_lines; tg text; v_lbs numeric; got jsonb := '[]'; cm credit_memos; n int := 0; tot numeric; inv text;
begin
  if auth.role() <> 'service_role' then raise exception 'Server only'; end if;
  select * into r from return_orders where id = p_return for update;
  if r.id is null or r.status = 'cancelled' then return jsonb_build_object('error', 'No open return ' || coalesce(p_return::text, '')); end if;
  for x in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    tg := upper(trim(x ->> 'tag')); v_lbs := nullif(x ->> 'lbs', '')::numeric;
    if tg is null or v_lbs is null or v_lbs <= 0 then continue; end if;
    if exists (select 1 from return_packages where upper(tag) = tg and manifest is not distinct from p_manifest) then continue; end if;
    select * into p from pallets where upper(package_tag) = tg order by updated_at desc limit 1;
    select * into rl0 from return_lines l where l.return_id = r.id
     order by (tg = any(l.tags)) desc,
              (exists (select 1 from jsonb_array_elements_text(coalesce(x -> 'source_labels', '[]')) s where upper(s) = any(l.tags))) desc,
              (canonical_strain(coalesce(x ->> 'strain', p.strain)) is not distinct from canonical_strain(l.strain)) desc,
              (l.received_lbs < l.lbs) desc, l.id
     limit 1;
    if rl0.id is null then continue; end if;
    if p.id is not null then
      update pallets set return_line_id = rl0.id, returned_at = now(),
             strain = case when rl0.order_line_id is not null and tg <> all(rl0.tags) then rl0.strain else strain end,
             origin_site = coalesce(rl0.site, origin_site), crop_year = coalesce(rl0.crop_year, crop_year), product = rl0.product,
             needs_review = case when needs_review = 'Received from METRC: check strain and product' then null else needs_review end,
             notes = concat_ws('. ', notes, 'Returned on ' || r.rma), updated_at = now()
       where id = p.id;
    end if;
    insert into return_packages (return_line_id, pallet_id, tag, lbs, manifest, received_by) values (rl0.id, p.id, tg, v_lbs, p_manifest, p_by);
    update return_lines set received_lbs = received_lbs + v_lbs where id = rl0.id;
    got := got || jsonb_build_object('tag', tg, 'code', p.code, 'line_id', rl0.id, 'lbs', v_lbs);
    n := n + 1; p := null; rl0 := null;
  end loop;
  if n = 0 then return jsonb_build_object('rma', r.rma, 'received', 0); end if;
  update return_orders set status = 'received', manifest = coalesce(manifest, p_manifest), received_at = coalesce(received_at, now()), received_by = coalesce(received_by, p_by), updated_at = now()
   where id = r.id;
  select string_agg(distinct i.inv_number, ', ') into inv from return_lines l join invoice_lines il on il.order_line_id = l.order_line_id join invoices i on i.id = il.invoice_id
   where l.return_id = r.id and i.status <> 'void';
  insert into credit_memos (cm_number, return_id, customer_id, notes, created_by)
  values ('CM-' || r.rma || case when exists (select 1 from credit_memos where return_id = r.id) then '-' || (select count(*) + 1 from credit_memos where return_id = r.id) else '' end,
          r.id, r.customer_id, concat_ws(' · ', 'Return ' || r.rma, case when inv is not null then 'invoice ' || inv end, 'manifest ' || p_manifest), p_by)
  returning * into cm;
  insert into credit_memo_lines (credit_memo_id, return_line_id, sort, product, description, strain, crop_year, site, class, qty, price, amount)
  select cm.id, l.id, row_number() over (order by l.id),
         case when l.reason = 'not_delivered' then 'PRODUCT_REFUND' else 'PRODUCT_RETURN' end,
         concat_ws(' ', case when l.reason = 'not_delivered' then 'Product refund (not delivered):' else 'Product return:' end, l.strain, '(' || l.crop_year || ')', '-', r.rma),
         l.strain, l.crop_year, l.site, acct_class_for(l.site, 'flower', l.crop_year), g.lbs, coalesce(l.price_per_lb, 0), round(g.lbs * coalesce(l.price_per_lb, 0), 2)
    from (select (e ->> 'line_id')::int as line_id, sum((e ->> 'lbs')::numeric) as lbs from jsonb_array_elements(got) e group by 1) g
    join return_lines l on l.id = g.line_id;
  select coalesce(sum(amount), 0) into tot from credit_memo_lines where credit_memo_id = cm.id;
  update credit_memos set total = tot where id = cm.id;
  insert into events (user_email, type, note, details)
  values (coalesce(p_by, 'metrc'), 'return_received', r.rma || ': ' || n || ' packages, credit memo ' || cm.cm_number || ' $' || tot,
          jsonb_build_object('return_id', r.id, 'manifest', p_manifest, 'packages', got, 'credit_memo', cm.id, 'total', tot));
  return jsonb_build_object('rma', r.rma, 'received', n, 'credit_memo', cm.cm_number, 'total', tot, 'packages', got);
end $$;

-- ---------- reserves net out returns ----------
-- columns stay in the same order (portal, menu and Sales read them); original_lbs, returned and released are new at the end
create or replace view reserve_balances with (security_invoker = true) as
  with sold as (
    select o.customer_id, l.strain, l.crop_year,
           sum(l.lbs) filter (where o.status = 'shipped') as shipped,
           sum(l.lbs) filter (where o.status = 'pending') as pending,
           sum(l.lbs) filter (where o.status = 'submitted') as submitted
      from orders o join order_lines l on l.order_id = o.id
     where l.product = 'fresh_frozen'
     group by o.customer_id, l.strain, l.crop_year),
  back as (
    select r.customer_id, lower(rl.strain) as k, rl.crop_year, sum(rl.received_lbs) as returned,
           bool_or(rl.reason in ('quality', 'yield')) as released
      from return_orders r join return_lines rl on rl.return_id = r.id
     where r.status <> 'cancelled' and rl.product = 'fresh_frozen'
     group by r.customer_id, lower(rl.strain), rl.crop_year),
  b as (
    select r.*, coalesce(s.shipped, 0) - coalesce(k.returned, 0) as net_shipped, coalesce(s.pending, 0) as pend, coalesce(s.submitted, 0) as subm,
           coalesce(k.returned, 0) as ret, coalesce(k.released, false) as rel
      from reserves r
      left join sold s on s.customer_id = r.customer_id and lower(s.strain) = lower(r.strain) and s.crop_year = r.crop_year
      left join back k on k.customer_id = r.customer_id and k.k = lower(r.strain) and k.crop_year = r.crop_year
     where r.product = 'fresh_frozen')
  select b.id, b.customer_id, b.strain,
         case when b.rel then least(b.lbs, greatest(b.net_shipped, 0) + b.pend) else b.lbs end as reserved,
         b.net_shipped as shipped, b.pend as pending,
         case when b.rel then 0 else greatest(b.lbs - b.net_shipped - b.pend, 0) end as remaining,
         b.crop_year, b.subm as submitted, b.lbs as original_lbs, b.ret as returned, b.rel as released
    from b;

commit;
