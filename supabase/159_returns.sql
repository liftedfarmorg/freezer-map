-- 159: Return orders (Sales) and credit memos (QuickBooks).
--  * Sales > Returns: start a return from a shipped order (same permission as making an order). Lines carry the strain, crop year,
--    farm, the METRC tags we shipped and the invoice price per lb. Can't return more than shipped (net of earlier returns).
--    Reasons: quality, wrong strain, overshipped, damaged, yield, other. Numbered RMA-0001, ...
--    Statuses: open > received > credited, or cancelled (only while nothing has been received).
--  * Distribution > Inbound: a delivery whose packages (or their METRC source packages) are tags on an open return, or that comes
--    from that customer's license, shows the return. Receiving it in METRC (return_receive, after inbound_apply) links each package
--    to its return line: the package keeps / takes the line's strain, crop year and farm, is marked returned (never harvest) and
--    goes back into sellable inventory at its received weight. Reserves are not given back (returned lbs go to the open menu).
--  * The receive makes a credit memo (CM-RMA-0001): one line per return line, Product Return, received lbs x invoice price,
--    class from the farm / crop year rules. It goes to QuickBooks 30 minutes later with the invoices' auto-send (or Send now).
-- Run once in the Supabase SQL Editor. Safe to re-run.
begin;

create sequence if not exists return_rma_seq;

create table if not exists return_orders (
  id           serial primary key,
  rma          text not null unique,
  customer_id  int not null references customers(id),
  order_id     int references orders(id),
  status       text not null default 'open' check (status in ('open', 'received', 'credited', 'cancelled')),
  reason       text not null check (reason in ('quality', 'wrong_strain', 'overshipped', 'damaged', 'yield', 'other')),
  notes        text,
  manifest     text,
  received_at  timestamptz,
  received_by  text,
  created_by   text default current_email(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  cancelled_by text,
  cancelled_at timestamptz
);
create table if not exists return_lines (
  id            serial primary key,
  return_id     int not null references return_orders(id) on delete cascade,
  order_line_id int references order_lines(id) on delete set null,
  strain        text not null,
  crop_year     int,
  product       text not null default 'fresh_frozen',
  site          text,
  price_per_lb  numeric,
  lbs           numeric not null check (lbs > 0),
  tags          text[] not null default '{}',
  received_lbs  numeric not null default 0
);
create index if not exists return_lines_ret on return_lines (return_id);
create index if not exists return_lines_oline on return_lines (order_line_id);
create table if not exists return_packages (
  id             serial primary key,
  return_line_id int not null references return_lines(id) on delete cascade,
  pallet_id      bigint references pallets(id) on delete set null,
  tag            text,
  lbs            numeric not null,
  manifest       text,
  received_at    timestamptz not null default now(),
  received_by    text
);
alter table pallets add column if not exists return_line_id int references return_lines(id) on delete set null;

create table if not exists credit_memos (
  id           serial primary key,
  cm_number    text not null unique,
  return_id    int references return_orders(id),
  customer_id  int not null references customers(id),
  memo_date    date not null default current_date,
  total        numeric not null default 0,
  status       text not null default 'open' check (status in ('open', 'void')),
  notes        text,
  acct_status  text not null default 'pending' check (acct_status in ('pending', 'sent', 'error', 'skip')),
  qbo_id       text,
  qbo_doc      text,
  qbo_env      text,
  acct_error   text,
  sent_at      timestamptz,
  sent_by      text,
  pushing_at   timestamptz,
  created_by   text default current_email(),
  created_at   timestamptz not null default now()
);
create table if not exists credit_memo_lines (
  id             serial primary key,
  credit_memo_id int not null references credit_memos(id) on delete cascade,
  return_line_id int references return_lines(id) on delete set null,
  sort           int not null default 0,
  product        text not null default 'PRODUCT_RETURN' references acct_products(code),
  description    text not null,
  strain         text,
  crop_year      int,
  site           text,
  class          text,
  qty            numeric not null,
  price          numeric not null,
  amount         numeric not null
);

do $$ declare t text; begin
  foreach t in array array['return_orders', 'return_lines', 'return_packages', 'credit_memos', 'credit_memo_lines'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_%s on %I', t, t);
    execute format('create policy read_%s on %I for select to authenticated using (is_sales() or has_module(''accounting''))', t, t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select on %I to authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;
grant usage on sequence return_rma_seq to service_role;

-- ---------- what can come back on a shipped order ----------
create or replace function return_order_lines(p_order int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.id), '[]') from (
    select l.id, l.strain, l.crop_year, l.product, l.lbs as shipped_lbs,
           coalesce((select sum(rl.lbs) from return_lines rl join return_orders r on r.id = rl.return_id
                      where rl.order_line_id = l.id and r.status <> 'cancelled'), 0) as returned_lbs,
           coalesce((select il.price from invoice_lines il join invoices i on i.id = il.invoice_id
                      where il.order_line_id = l.id and i.status <> 'void' order by i.id desc limit 1), l.price_per_lb) as price,
           (select i.inv_number from invoice_lines il join invoices i on i.id = il.invoice_id
             where il.order_line_id = l.id and i.status <> 'void' order by i.id desc limit 1) as invoice,
           array(select distinct upper(t) from (
               select p.package_tag t from order_picks k join pallets p on p.id = k.pallet_id where k.order_line_id = l.id
               union select ip.package_tag from invoice_packages ip join invoice_lines il on il.id = ip.invoice_line_id where il.order_line_id = l.id
               union select l.package_tag) z where t is not null and t <> '') as tags,
           coalesce((select p.origin_site from order_picks k join pallets p on p.id = k.pallet_id where k.order_line_id = l.id and p.origin_site is not null limit 1),
                    (select p.origin_site from pallets p where upper(p.package_tag) = upper(l.package_tag) and p.origin_site is not null limit 1),
                    case l.farm when 'OH' then 'OHR' when 'GV' then 'GVR' end) as site
      from order_lines l join orders o on o.id = l.order_id
     where o.id = p_order and o.status = 'shipped' and l.lbs > 0
       and (is_sales() or has_module('accounting') or auth.role() = 'service_role')) x
$$;

-- ---------- start / cancel a return (same permission as making an order) ----------
create or replace function create_return(p_order int, p_lines jsonb, p_reason text, p_notes text default null) returns return_orders
language plpgsql security definer set search_path = public as $$
declare o orders; r return_orders; l jsonb; ol jsonb; avail numeric; want numeric; n int := 0;
begin
  perform no_view_as();
  if not can_edit('sales') then raise exception 'Only Sales can start returns'; end if;
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status <> 'shipped' then raise exception 'Only shipped orders can be returned'; end if;
  if p_reason not in ('quality', 'wrong_strain', 'overshipped', 'damaged', 'yield', 'other') then raise exception 'Pick a reason'; end if;
  insert into return_orders (rma, customer_id, order_id, reason, notes)
  values ('RMA-' || lpad(nextval('return_rma_seq')::text, 4, '0'), o.customer_id, o.id, p_reason, nullif(trim(p_notes), ''))
  returning * into r;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    want := nullif(l ->> 'lbs', '')::numeric;
    if coalesce(want, 0) <= 0 then continue; end if;
    select x into ol from jsonb_array_elements(return_order_lines(o.id)) x where (x ->> 'id')::int = (l ->> 'line_id')::int;
    if ol is null then raise exception 'That line isn''t on this order'; end if;
    avail := (ol ->> 'shipped_lbs')::numeric - (ol ->> 'returned_lbs')::numeric;
    if want > avail + 0.001 then raise exception '% (%): only % lbs can come back (% shipped, % on other returns)', ol ->> 'strain', ol ->> 'crop_year',
      round(avail, 2), ol ->> 'shipped_lbs', ol ->> 'returned_lbs'; end if;
    insert into return_lines (return_id, order_line_id, strain, crop_year, product, site, price_per_lb, lbs, tags)
    values (r.id, (ol ->> 'id')::int, ol ->> 'strain', (ol ->> 'crop_year')::int, ol ->> 'product',
            coalesce(nullif(l ->> 'site', ''), ol ->> 'site'), nullif(ol ->> 'price', '')::numeric, want,
            coalesce(array(select jsonb_array_elements_text(ol -> 'tags')), '{}'));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Add at least one line with lbs'; end if;
  insert into events (user_email, type, note, details)
  values (current_email(), 'return_created', r.rma || ' for ' || (select name from customers where id = r.customer_id),
          jsonb_build_object('return_id', r.id, 'rma', r.rma, 'order_id', o.id, 'so', o.so_number, 'reason', p_reason, 'lines', n));
  return r;
end $$;

create or replace function cancel_return(p_id int, p_note text default null) returns return_orders
language plpgsql security definer set search_path = public as $$
declare r return_orders;
begin
  perform no_view_as();
  if not can_edit('sales') then raise exception 'Only Sales can cancel returns'; end if;
  select * into r from return_orders where id = p_id for update;
  if r.id is null then raise exception 'Return not found'; end if;
  if r.status <> 'open' or exists (select 1 from return_packages rp join return_lines rl on rl.id = rp.return_line_id where rl.return_id = r.id) then
    raise exception 'Something on % was already received. It can''t be cancelled.', r.rma; end if;
  update return_orders set status = 'cancelled', cancelled_by = current_email(), cancelled_at = now(), updated_at = now(),
         notes = concat_ws(' | ', notes, nullif(trim(p_note), '')) where id = r.id returning * into r;
  insert into events (user_email, type, note, details) values (current_email(), 'return_cancelled', r.rma, jsonb_build_object('return_id', r.id));
  return r;
end $$;

-- ---------- the list for Sales > Returns ----------
create or replace function returns_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'rma', r.rma, 'status', r.status, 'reason', r.reason, 'notes', r.notes, 'manifest', r.manifest,
      'customer_id', r.customer_id, 'customer', c.name, 'order_id', r.order_id, 'so', o.so_number,
      'created_by', r.created_by, 'created_at', r.created_at, 'received_at', r.received_at, 'cancelled_at', r.cancelled_at,
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'strain', l.strain, 'crop_year', l.crop_year, 'site', l.site, 'lbs', l.lbs,
                  'received_lbs', l.received_lbs, 'price', l.price_per_lb, 'tags', l.tags,
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

-- shipped orders a return can start from (last 2 years, newest first)
create or replace function returnable_orders(p_customer int default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.shipped desc nulls last, x.id desc), '[]') from (
    select o.id, o.so_number as so, o.customer_id, c.name as customer, coalesce(o.shipped_date, o.order_date) as shipped,
           (select sum(l.lbs) from order_lines l where l.order_id = o.id) as lbs,
           (select string_agg(distinct l.strain, ', ') from order_lines l where l.order_id = o.id) as strains
      from orders o join customers c on c.id = o.customer_id
     where o.status = 'shipped' and (p_customer is null or o.customer_id = p_customer)
       and coalesce(o.shipped_date, o.order_date) >= current_date - 730 and c.kind = 'external'
       and (is_sales() or has_module('accounting'))) x
$$;

-- ---------- Inbound: which open return a delivery / package belongs to ----------
-- p_rows: [{tag, source_labels: [...], from_license}] -> [{tag, return_id, rma, customer, line_id, how}]
create or replace function returns_match(p_rows jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(m), '[]') from (
    select x ->> 'tag' as tag, h.return_id, h.rma, h.customer, h.line_id, h.how
      from jsonb_array_elements(coalesce(p_rows, '[]')) x
      cross join lateral (
        select r.id as return_id, r.rma, c.name as customer, l.id as line_id,
               case when upper(x ->> 'tag') = any(l.tags) then 'tag' when exists (select 1 from jsonb_array_elements_text(coalesce(x -> 'source_labels', '[]')) s where upper(s) = any(l.tags)) then 'source'
                    else 'customer' end as how
          from return_orders r join return_lines l on l.return_id = r.id join customers c on c.id = r.customer_id
         where r.status in ('open', 'received')
           and (upper(x ->> 'tag') = any(l.tags)
                or exists (select 1 from jsonb_array_elements_text(coalesce(x -> 'source_labels', '[]')) s where upper(s) = any(l.tags))
                or (nullif(x ->> 'from_license', '') is not null and upper(c.license) = upper(x ->> 'from_license') and l.received_lbs < l.lbs))
         order by (upper(x ->> 'tag') = any(l.tags)) desc, r.id limit 1) h
     where auth.role() = 'service_role' or is_staff()) m
$$;

-- ---------- receive (called by the server right after inbound_apply, once METRC took the delivery) ----------
-- p_rows: [{tag, lbs, strain, source_labels}]; makes the credit memo for what came in
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
    -- the line: our tag, then a METRC source tag, then the same strain, then any line with room
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
  -- credit memo for this receipt: one line per return line, received lbs x invoice price
  select string_agg(distinct i.inv_number, ', ') into inv from return_lines l join invoice_lines il on il.order_line_id = l.order_line_id join invoices i on i.id = il.invoice_id
   where l.return_id = r.id and i.status <> 'void';
  insert into credit_memos (cm_number, return_id, customer_id, notes, created_by)
  values ('CM-' || r.rma || case when exists (select 1 from credit_memos where return_id = r.id) then '-' || (select count(*) + 1 from credit_memos where return_id = r.id) else '' end,
          r.id, r.customer_id, concat_ws(' · ', 'Return ' || r.rma, case when inv is not null then 'invoice ' || inv end, 'manifest ' || p_manifest), p_by)
  returning * into cm;
  insert into credit_memo_lines (credit_memo_id, return_line_id, sort, description, strain, crop_year, site, class, qty, price, amount)
  select cm.id, l.id, row_number() over (order by l.id), concat_ws(' ', 'Product return:', l.strain, '(' || l.crop_year || ')', '-', r.rma),
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

-- ---------- credit memo to QuickBooks (server) ----------
create or replace function cm_payload(p_id int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m credit_memos; c customers; probs jsonb := '[]'; ls jsonb;
begin
  if not (auth.role() = 'service_role' or has_module('accounting') or is_sales()) then raise exception 'Not allowed'; end if;
  select * into m from credit_memos where id = p_id;
  if m.id is null then raise exception 'Credit memo not found'; end if;
  select * into c from customers where id = m.customer_id;
  select coalesce(jsonb_agg(jsonb_build_object('line_id', l.id, 'product', l.product, 'item', ap.name, 'class', l.class, 'description', l.description,
           'qty', l.qty, 'price', l.price, 'amount', l.amount) order by l.sort), '[]') into ls
    from credit_memo_lines l left join acct_products ap on ap.code = l.product where l.credit_memo_id = m.id;
  if exists (select 1 from credit_memo_lines where credit_memo_id = m.id and class is null) then probs := probs || to_jsonb('A line has no class (farm or crop year unknown).'::text); end if;
  if exists (select 1 from credit_memo_lines where credit_memo_id = m.id and price <= 0) then probs := probs || to_jsonb('A line has no price (the original invoice price wasn''t found).'::text); end if;
  if c.kind is distinct from 'external' then probs := probs || to_jsonb(format('%s is one of our own farms.', c.name)); end if;
  if m.status = 'void' then probs := probs || to_jsonb('This credit memo is void.'::text); end if;
  if jsonb_array_length(ls) = 0 then probs := probs || to_jsonb('No lines on this credit memo.'::text); end if;
  return jsonb_build_object('id', m.id, 'doc_number', m.cm_number, 'date', m.memo_date, 'total', m.total, 'memo', m.notes,
    'rma', (select rma from return_orders where id = m.return_id), 'qbo_id', case when m.qbo_env = acct_env() then m.qbo_id end, 'acct_status', m.acct_status,
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'legal_name', coalesce(nullif(c.legal_name, ''), c.name), 'qbo_name', c.qbo_name, 'kind', c.kind,
        'email', c.billing_email, 'phone', c.billing_phone, 'contact', c.billing_contact, 'billing_address', c.billing_address,
        'ship_to_address', coalesce(c.ship_to_address, c.address), 'license', c.license),
    'lines', ls, 'problems', probs);
end $$;

-- one push at a time per credit memo
create or replace function cm_claim_push(p_id int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.role() <> 'service_role' then raise exception 'Server only'; end if;
  update credit_memos set pushing_at = now() where id = p_id and (pushing_at is null or pushing_at < now() - interval '3 minutes');
  get diagnostics n = row_count; return n > 0;
end $$;
create or replace function cm_record_push(p_id int, p_env text, p_qbo_id text, p_doc text, p_total numeric, p_error text, p_by text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Server only'; end if;
  if p_error is not null then
    update credit_memos set acct_status = 'error', acct_error = left(p_error, 1000), pushing_at = null where id = p_id;
  else
    update credit_memos set acct_status = 'sent', acct_error = null, qbo_id = p_qbo_id, qbo_doc = p_doc, qbo_env = p_env, sent_at = now(), sent_by = p_by, pushing_at = null where id = p_id;
    update return_orders r set status = 'credited', updated_at = now()
     where r.id = (select return_id from credit_memos where id = p_id) and r.status = 'received'
       and not exists (select 1 from return_lines l where l.return_id = r.id and l.received_lbs < l.lbs - 0.001);
    insert into events (user_email, type, note, details)
    values (coalesce(p_by, 'auto'), 'credit_memo_sent', (select cm_number from credit_memos where id = p_id) || ' to QuickBooks #' || coalesce(p_doc, p_qbo_id),
            jsonb_build_object('credit_memo', p_id, 'qbo_id', p_qbo_id, 'env', p_env, 'total', p_total));
  end if;
end $$;
create or replace function cm_release_push(p_id int) returns void
language sql security definer set search_path = public as $$ update credit_memos set pushing_at = null where id = p_id and auth.role() = 'service_role' $$;
-- the auto-send: credit memos 30 minutes old that haven't gone yet
create or replace function cm_autopush_due() returns int[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id order by id), '{}') from credit_memos
   where auth.role() = 'service_role' and status = 'open' and acct_status = 'pending' and created_at < now() - interval '30 minutes'
$$;

do $$ declare f text; begin
  foreach f in array array['return_order_lines(int)', 'create_return(int, jsonb, text, text)', 'cancel_return(int, text)', 'returns_list()', 'returnable_orders(int)',
                           'returns_match(jsonb)', 'cm_payload(int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['return_receive(int, text, jsonb, text)', 'cm_claim_push(int)', 'cm_record_push(int, text, text, text, numeric, text, text)', 'cm_release_push(int)', 'cm_autopush_due()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
