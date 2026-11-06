-- 218: Invoices are made at delivery (Msg #251-259, Aziz 11/5). Order changes plan A + B.
--  * Depart only makes manifests. The invoice is made when the stop outcome is recorded (driver, carrier link, office),
--    for what the customer kept: rejected / not delivered packages aren't billed; nothing kept = no invoice.
--    Pickups: made at Picked up, as before. Invoice date = delivery date, so net terms count from delivery.
--  * Until the invoice is sent to QuickBooks (sending is manual; auto, when turned on, is 30 min after it's made = after
--    delivery) it can be edited, and fixing the stop outcome rebuilds it. Once it's in QuickBooks the outcome is final:
--    product coming back after that comes on a return manifest (Sales > Returns).
--  * Void is gone for sales invoices. In QuickBooks already: Credit memo (owe less) or Bill the difference (owe more),
--    both from the invoice, both go to QuickBooks like returns' credit memos (and to Business Central when we switch).
--  * Fully rejected, or not delivered because the customer cancelled: the order is cancelled once everything is received
--    back (its lbs go back to the customer's reserve).
--  * Accounting alerts go to the Accounting module plus a list (Accounting > Settings), starting with Matt and Nikki.
--  * "Make invoice now" on an order that isn't delivered: refused (send the Sales Order to collect payment ahead).
--  * Lazer Buddha (INV-26110403, made at Depart, never sent to QuickBooks, stop still open) goes back to no invoice, so the
--    not-delivered test runs on the new rules. Punch (delivered, in QuickBooks) is untouched.
-- Nothing goes to METRC. Safe to re-run.
begin;

alter table invoices add column if not exists parent_invoice_id int references invoices(id);
alter table invoices add column if not exists bill_reason text;
alter table credit_memos add column if not exists invoice_id int references invoices(id);
alter table credit_memos add column if not exists reason text;
alter table credit_memo_lines add column if not exists invoice_line_id int references invoice_lines(id) on delete set null;
create index if not exists credit_memos_invoice on credit_memos (invoice_id) where invoice_id is not null;
create index if not exists invoices_parent on invoices (parent_invoice_id) where parent_invoice_id is not null;

insert into app_settings (key, value) values ('acct.alert_people', 'matt@lifted-organics.com,nikki@lifted-organics.com') on conflict (key) do nothing;

-- =====================================================================================================
-- 1. invoice lines from what was picked, minus what came back on the truck
-- =====================================================================================================
-- picks of one order line that the customer kept (not on a stop return)
create or replace function _kept_picks(p_line int, p_stop int) returns table (pallet_id bigint, lbs numeric)
language sql stable security definer set search_path = public as $$
  select x.pallet_id, x.lbs from order_picks x join pallets p on p.id = x.pallet_id
   where x.order_line_id = p_line
     and not exists (select 1 from stop_returns r where p_stop is not null and r.stop_id = p_stop and r.cancelled_at is null
                       and (r.pallet_id = x.pallet_id or r.pallet_id = p.container_id))
$$;

create or replace function _invoice_line_packages(p_il int, p_line int, p_order int) returns void
language plpgsql security definer set search_path = public as $$
declare ln order_lines; o orders;
begin
  select * into ln from order_lines where id = p_line;
  select * into o from orders where id = p_order;
  delete from invoice_packages where invoice_line_id = p_il;
  insert into invoice_packages (invoice_line_id, package_tag, pallet_code, lbs, batch)
  select p_il, p.package_tag, p.code, k.lbs,
         coalesce(case when ln.product = 'dry_biomass' then (select it.sku from items it where it.id = p.item_id) end, batch_name(ln.crop_year, coalesce(split_part(p.origin_site, '+', 1), f.site, f2.site, p.received_site, case when p.code like 'G%' then 'GVR' else 'OHR' end), ln.strain, ln.product))
    from _kept_picks(ln.id, o.stop_id) k join pallets p on p.id = k.pallet_id
    left join load_items li on li.pallet_id = p.id and li.stop_id = o.stop_id
    left join slots s on s.id = li.from_slot left join freezers f on f.id = s.freezer_id
    left join slots s2 on s2.id = p.slot_id left join freezers f2 on f2.id = s2.freezer_id
   order by p.code;
end $$;

-- the delivery date of an order's stop (Pacific), else its ship date
create or replace function _order_delivered_on(p_order int) returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.delivered_at at time zone 'America/Los_Angeles')::date from orders o join load_stops s on s.id = o.stop_id where o.id = p_order and s.status = 'delivered'),
                  (select shipped_date from orders where id = p_order), _local_today())
$$;

create or replace function _make_invoice(p_order integer) returns invoices
language plpgsql security definer set search_path = public as $$
declare o orders; c customers; i invoices; num text; ln record; il invoice_lines; k int := 0; qty numeric; picked boolean;
begin
  select * into o from orders where id = p_order;
  select * into i from invoices where order_id = o.id and status <> 'void' and parent_invoice_id is null order by id desc limit 1;
  if i.id is not null then return i; end if;
  select * into c from customers where id = o.customer_id;
  num := 'INV-' || coalesce(nullif(regexp_replace(coalesce(o.so_number, ''), '^SO-', ''), ''), lpad(o.id::text, 6, '0'));
  if exists (select 1 from invoices where inv_number = num) then
    num := num || '-' || ((select count(*) from invoices where inv_number like num || '%') + 1);
  end if;
  insert into invoices (inv_number, order_id, customer_id, invoice_date, terms_code, po_number, notes)
  values (num, o.id, o.customer_id, _order_delivered_on(o.id), coalesce(o.payment_terms, c.payment_terms, 'RECEIPT'), o.po_number, null)
  returning * into i;
  for ln in select ol.* from order_lines ol where ol.order_id = o.id and ol.lbs > 0 order by ol.crop_year desc, ol.strain loop
    picked := exists (select 1 from order_picks x where x.order_line_id = ln.id);
    select coalesce(sum(k2.lbs), 0) into qty from _kept_picks(ln.id, o.stop_id) k2;
    if not picked then qty := ln.lbs; end if;            -- Roshi / hand orders without picks: the ordered lbs
    if qty <= 0 then continue; end if;                     -- everything on this line came back
    k := k + 1;
    insert into invoice_lines (invoice_id, sort, kind, item, description, strain, crop_year, qty, uom, price, order_line_id)
    values (i.id, k, 'product', product_label(ln.product) || ' - ' || ln.crop_year, ln.strain || ' - ' || product_label(ln.product), ln.strain, ln.crop_year, qty, 'lb',
            coalesce(ln.price_per_lb, line_price(o.customer_id, ln.crop_year, ln.strain, ln.product, ln.grade), 0), ln.id)
    returning * into il;
    if picked then perform _invoice_line_packages(il.id, ln.id, o.id); end if;
  end loop;
  if k = 0 then   -- nothing kept: no invoice
    delete from invoice_lines where invoice_id = i.id;
    delete from invoices where id = i.id;
    return null;
  end if;
  -- Roshi-imported orders carry their package tags on the lines
  insert into invoice_packages (invoice_line_id, package_tag, lbs, batch)
  select il2.id, ol.package_tag, ol.lbs, batch_name(ol.crop_year, null, ol.strain)
    from invoice_lines il2 join order_lines ol on ol.id = il2.order_line_id
   where il2.invoice_id = i.id and ol.package_tag is not null and not exists (select 1 from invoice_packages ip where ip.invoice_line_id = il2.id);
  update invoices set manifest = (select nullif(trim(s.manifest), '') from load_stops s where s.id = o.stop_id) where id = i.id and manifest is null;
  i := recompute_invoice(i.id);
  insert into events (user_email, type, details)
  values (coalesce(current_email(), 'system'), 'invoice_created', jsonb_build_object('invoice_id', i.id, 'inv', i.inv_number, 'so', o.so_number, 'customer', c.name, 'total', i.total));
  return i;
end $$;

-- an invoice not in QuickBooks yet, brought in line with what was kept (prices and charge lines stay as Sales left them);
-- nothing kept: the invoice is removed (it was never sent anywhere)
create or replace function _invoice_rebuild(p_inv int) returns void
language plpgsql security definer set search_path = public as $$
declare i invoices; o orders; l record; v_qty numeric; picked boolean;
begin
  select * into i from invoices where id = p_inv;
  if i.id is null or i.acct_status = 'sent' or i.status = 'void' then return; end if;
  select * into o from orders where id = i.order_id;
  for l in select * from invoice_lines where invoice_id = i.id and kind = 'product' and order_line_id is not null loop
    picked := exists (select 1 from order_picks x where x.order_line_id = l.order_line_id);
    if not picked then continue; end if;
    select coalesce(sum(k.lbs), 0) into v_qty from _kept_picks(l.order_line_id, o.stop_id) k;
    if v_qty <= 0 then
      update invoice_lines set applies_to = null where applies_to = l.id;
      delete from invoice_lines where id = l.id;
    else
      update invoice_lines set qty = v_qty where id = l.id;
      perform _invoice_line_packages(l.id, l.order_line_id, o.id);
    end if;
  end loop;
  if not exists (select 1 from invoice_lines where invoice_id = i.id and kind = 'product')
     and not exists (select 1 from lot_feedback where invoice_id = i.id) then
    delete from acct_pushes where invoice_id = i.id and status <> 'sent';
    delete from invoice_lines where invoice_id = i.id;
    delete from invoices where id = i.id;
    insert into events (user_email, type, details)
    values (coalesce(current_email(), 'system'), 'invoice_removed', jsonb_build_object('invoice_id', i.id, 'inv', i.inv_number, 'why', 'nothing delivered on this order'));
    return;
  end if;
  update invoices set invoice_date = _order_delivered_on(o.id), updated_at = now() where id = i.id;
  perform recompute_invoice(i.id);
end $$;

-- the stop outcome decides the invoice of every order on that stop
create or replace function _invoice_for_stop(p_stop int) returns void
language plpgsql security definer set search_path = public as $$
declare od record; i invoices; s load_stops;
begin
  select * into s from load_stops where id = p_stop;
  for od in select * from orders where stop_id = p_stop and status <> 'cancelled' loop
    select * into i from invoices where order_id = od.id and status <> 'void' and parent_invoice_id is null order by id desc limit 1;
    if i.id is not null then
      perform _invoice_rebuild(i.id);
    elsif s.status = 'delivered' then
      if od.status = 'pending' then update orders set status = 'shipped', shipped_date = coalesce(shipped_date, _local_today()) where id = od.id; end if;
      perform _make_invoice(od.id);
    end if;
  end loop;
end $$;
revoke all on function _invoice_for_stop(int) from public, anon, authenticated;
revoke all on function _invoice_rebuild(int) from public, anon, authenticated;
revoke all on function _make_invoice(int) from public, anon, authenticated;

-- orders shipping at Depart don't get an invoice any more; a pickup does (it's delivered at our dock), and so does an
-- order whose stop is already delivered
create or replace function invoice_on_ship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' and new.stop_id is not null
     and exists (select 1 from load_stops s join loads l on l.id = s.load_id where s.id = new.stop_id and (l.kind = 'pickup' or s.status = 'delivered')) then
    perform _make_invoice(new.id);
  end if;
  return new;
end $$;

create or replace function make_invoice(p_order integer) returns invoices
language plpgsql security definer set search_path = public as $$
declare o orders; i invoices;
begin
  perform no_view_as();
  if not can_edit('sales') then raise exception 'Only Sales can make invoices'; end if;
  select * into o from orders where id = p_order;
  select * into i from invoices where order_id = o.id and status <> 'void' and parent_invoice_id is null order by id desc limit 1;
  if i.id is not null then return i; end if;
  if o.status <> 'shipped' then
    raise exception 'The invoice is made when the order is delivered. To collect payment ahead, send the customer the Sales Order.';
  end if;
  if o.stop_id is not null and not exists (select 1 from load_stops s join loads l on l.id = s.load_id where s.id = o.stop_id and (l.kind = 'pickup' or s.status = 'delivered')) then
    raise exception 'The invoice is made when this stop is delivered (Transit > the load > Record outcome).';
  end if;
  i := _make_invoice(p_order);
  if i.id is null then raise exception 'Nothing on this order was delivered, so there''s no invoice.'; end if;
  return i;
end $$;

-- no more Void on sales invoices
create or replace function set_invoice_status(p_inv integer, p_status text, p_note text default null) returns invoices
language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  perform no_view_as();
  if not _can_bill(p_inv) then raise exception 'Only Sales'; end if;
  if p_status not in ('open','paid','void') then raise exception 'Unknown status'; end if;
  select * into i from invoices where id = p_inv;
  if i.acct_status = 'sent' and p_status in ('open','paid') then raise exception '% is in QuickBooks. Payments are recorded in QuickBooks and show up here on the next sync.', i.inv_number; end if;
  if p_status = 'void' and i.nursery_order_id is null then
    raise exception 'Invoices can''t be voided. Not in QuickBooks yet: edit it. In QuickBooks: Credit memo (they owe less) or Bill the difference (they owe more).';
  end if;
  if i.acct_status = 'sent' and p_status = 'void' then raise exception '% is in QuickBooks. Void it there.', i.inv_number; end if;
  if p_status = 'void' and not (is_sales_admin() or (i.nursery_order_id is not null and is_mod_admin('nursery'))) then raise exception 'Only an Admin can void an invoice'; end if;
  update invoices set status = p_status, paid_at = case when p_status = 'paid' then coalesce(paid_at, current_date) else null end,
         notes = case when nullif(trim(p_note), '') is null then notes else concat_ws(E'\n', notes, trim(p_note)) end, updated_at = now()
   where id = p_inv returning * into i;
  insert into events (user_email, type, note, details)
  values (current_email(), case when i.nursery_order_id is not null then 'nursery_invoice_' else 'invoice_' end || p_status, p_note,
          jsonb_build_object('invoice_id', i.id, 'inv', i.inv_number, 'total', i.total));
  return i;
end $$;

create or replace function _inv_editable(p_inv integer) returns invoices
language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  perform no_view_as();
  if not _can_bill(p_inv) then raise exception 'Only Sales can change invoices'; end if;
  select * into i from invoices where id = p_inv for update;
  if i.id is null then raise exception 'Invoice not found'; end if;
  if i.status = 'void' then raise exception 'That invoice is void'; end if;
  if i.acct_status = 'sent' then raise exception '% is already in QuickBooks, so it can''t change. Use Credit memo (they owe less) or Bill the difference (they owe more).', i.inv_number; end if;
  return i;
end $$;

-- =====================================================================================================
-- 2. after it's in QuickBooks: credit memo or a second invoice, from the invoice
-- =====================================================================================================
create or replace function _reason_label(p text) returns text language sql immutable as $$
  select case p when 'return' then 'Return' when 'rejected' then 'Rejected' when 'not_delivered' then 'Not delivered' when 'cancelled' then 'Cancelled'
                when 'price_correction' then 'Price correction' when 'quality' then 'Quality' when 'missed_charge' then 'Missed charge' else 'Other' end
$$;

-- p: { reason, notes, lines: [{ invoice_line_id?, description?, qty, price }] }
create or replace function make_credit_memo(p_inv int, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i invoices; why text := coalesce(nullif(p ->> 'reason', ''), ''); x jsonb; il invoice_lines; cm credit_memos; k int := 0; q numeric; pr numeric;
        prod text; base text; n int; tot numeric; dsc text; credited numeric;
begin
  perform no_view_as();
  if not (_can_bill(p_inv) or can_edit('accounting')) then raise exception 'Only Sales or Accounting can make credit memos'; end if;
  select * into i from invoices where id = p_inv;
  if i.id is null then raise exception 'Invoice not found'; end if;
  if i.acct_status <> 'sent' then raise exception '% isn''t in QuickBooks yet. Edit the invoice instead.', i.inv_number; end if;
  if why not in ('return', 'rejected', 'not_delivered', 'cancelled', 'price_correction', 'quality', 'other') then raise exception 'Pick a reason'; end if;
  if why = 'other' and nullif(trim(coalesce(p ->> 'notes', '')), '') is null then raise exception 'Say why in the note'; end if;
  prod := case why when 'price_correction' then 'SALES_DISCOUNT' when 'other' then 'SALES_DISCOUNT' when 'quality' then 'QUALITY_DISCOUNT'
                   when 'return' then 'PRODUCT_RETURN' else 'PRODUCT_REFUND' end;
  base := 'CM-' || regexp_replace(i.inv_number, '^INV-', '');
  n := (select count(*) from credit_memos where cm_number = base or cm_number like base || '-%');
  insert into credit_memos (cm_number, customer_id, invoice_id, reason, notes, created_by, memo_date)
  values (base || case when n > 0 then '-' || (n + 1) else '' end, i.customer_id, i.id, why,
          concat_ws(' · ', _reason_label(why), 'invoice ' || i.inv_number, nullif(trim(coalesce(p ->> 'notes', '')), '')), current_email(), _local_today())
  returning * into cm;
  for x in select * from jsonb_array_elements(coalesce(p -> 'lines', '[]')) loop
    q := nullif(x ->> 'qty', '')::numeric; pr := nullif(x ->> 'price', '')::numeric;
    if q is null or q <= 0 or pr is null or pr <= 0 then continue; end if;
    il := null;
    if nullif(x ->> 'invoice_line_id', '') is not null then
      select * into il from invoice_lines where id = (x ->> 'invoice_line_id')::int and invoice_id = i.id;
      if il.id is null then raise exception 'That line isn''t on %', i.inv_number; end if;
      if il.kind = 'product' and why <> 'price_correction' and q > il.qty then raise exception 'More than the % lbs billed on that line', il.qty; end if;
    end if;
    dsc := coalesce(nullif(trim(x ->> 'description'), ''), il.description, _reason_label(why));
    k := k + 1;
    insert into credit_memo_lines (credit_memo_id, invoice_line_id, sort, product, description, strain, crop_year, class, qty, price, amount)
    values (cm.id, il.id, k, prod, _reason_label(why) || ' - ' || dsc, il.strain, il.crop_year,
            coalesce(il.acct_class, (select acct_class from invoice_lines where invoice_id = i.id and acct_class is not null order by sort limit 1)),
            q, pr, round(q * pr, 2));
  end loop;
  if k = 0 then raise exception 'Add at least one line with an amount'; end if;
  select coalesce(sum(amount), 0) into tot from credit_memo_lines where credit_memo_id = cm.id;
  select coalesce(sum(m.total), 0) into credited from credit_memos m where m.invoice_id = i.id and m.id <> cm.id and m.status <> 'void';
  if tot + credited > i.total + 0.005 then raise exception 'Credits ($%) would be more than the invoice ($%)', tot + credited, i.total; end if;
  update credit_memos set total = tot where id = cm.id returning * into cm;
  insert into events (user_email, type, note, details)
  values (current_email(), 'credit_memo_made', cm.cm_number || ' $' || tot || ' against ' || i.inv_number,
          jsonb_build_object('credit_memo', cm.id, 'invoice_id', i.id, 'inv', i.inv_number, 'reason', why, 'total', tot));
  return jsonb_build_object('id', cm.id, 'number', cm.cm_number, 'total', tot);
end $$;
revoke all on function make_credit_memo(int, jsonb) from public, anon;
grant execute on function make_credit_memo(int, jsonb) to authenticated;

-- p: { reason, notes, lines: [{ description, qty, price, product (acct product code) }] }  ->  a new invoice (INV-...-2)
create or replace function make_followup_invoice(p_inv int, p jsonb) returns invoices
language plpgsql security definer set search_path = public as $$
declare i invoices; f invoices; why text := coalesce(nullif(p ->> 'reason', ''), ''); x jsonb; k int := 0; q numeric; pr numeric; base text; n int; cls text;
begin
  perform no_view_as();
  if not _can_bill(p_inv) then raise exception 'Only Sales can bill'; end if;
  select * into i from invoices where id = p_inv;
  if i.id is null then raise exception 'Invoice not found'; end if;
  if i.acct_status <> 'sent' then raise exception '% isn''t in QuickBooks yet. Edit the invoice instead.', i.inv_number; end if;
  if why not in ('price_correction', 'missed_charge', 'other') then raise exception 'Pick a reason'; end if;
  base := regexp_replace(i.inv_number, '-\d{1,2}$', '');   -- INV-26110403-2 -> INV-26110403
  n := (select count(*) from invoices where inv_number = base or inv_number like base || '-%');
  select acct_class into cls from invoice_lines where invoice_id = i.id and acct_class is not null order by sort limit 1;
  insert into invoices (inv_number, order_id, customer_id, invoice_date, terms_code, po_number, notes, manifest, seller_license, parent_invoice_id, bill_reason)
  values (base || '-' || (n + 1), null, i.customer_id, _local_today(), i.terms_code, i.po_number,
          concat_ws(' · ', _reason_label(why) || ' on ' || i.inv_number, nullif(trim(coalesce(p ->> 'notes', '')), '')), i.manifest, i.seller_license, i.id, why)
  returning * into f;
  for x in select * from jsonb_array_elements(coalesce(p -> 'lines', '[]')) loop
    q := nullif(x ->> 'qty', '')::numeric; pr := nullif(x ->> 'price', '')::numeric;
    if q is null or q <= 0 or pr is null or pr <= 0 or nullif(trim(coalesce(x ->> 'description', '')), '') is null then continue; end if;
    k := k + 1;
    insert into invoice_lines (invoice_id, sort, kind, item, description, qty, uom, price, acct_product, acct_class)
    values (f.id, k, 'charge', trim(x ->> 'description'), trim(x ->> 'description'), q, coalesce(nullif(trim(x ->> 'uom'), ''), case when x ->> 'product' = 'SHIPPING' then 'ea' else 'lb' end), pr,
            nullif(x ->> 'product', ''), cls);
  end loop;
  if k = 0 then raise exception 'Add at least one line with an amount'; end if;
  f := recompute_invoice(f.id);
  insert into events (user_email, type, note, details)
  values (current_email(), 'invoice_created', f.inv_number || ' (' || _reason_label(why) || ' on ' || i.inv_number || ')',
          jsonb_build_object('invoice_id', f.id, 'inv', f.inv_number, 'parent', i.inv_number, 'reason', why, 'total', f.total));
  return f;
end $$;
revoke all on function make_followup_invoice(int, jsonb) from public, anon;
grant execute on function make_followup_invoice(int, jsonb) to authenticated;

-- what's been done against an invoice (the invoice screen)
create or replace function invoice_adjustments(p_inv int) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when can_see_invoice(p_inv) then jsonb_build_object(
    'credits', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'number', m.cm_number, 'total', m.total, 'reason', m.reason, 'date', m.memo_date,
                 'acct_status', m.acct_status, 'status', m.status) order by m.id) from credit_memos m where m.invoice_id = p_inv), '[]'::jsonb),
    'followups', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'number', f.inv_number, 'total', f.total, 'reason', f.bill_reason, 'date', f.invoice_date,
                 'acct_status', f.acct_status) order by f.id) from invoices f where f.parent_invoice_id = p_inv), '[]'::jsonb),
    'parent', (select jsonb_build_object('id', pi.id, 'number', pi.inv_number) from invoices x join invoices pi on pi.id = x.parent_invoice_id where x.id = p_inv),
    'products', (select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by sort) from acct_products where active)) end
$$;
revoke all on function invoice_adjustments(int) from public, anon;
grant execute on function invoice_adjustments(int) to authenticated;

-- Accounting > Settings: who gets Accounting alerts (besides the Accounting module)
create or replace function set_acct_alert_people(p_emails text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  perform no_view_as();
  if not (is_owner() or mod_level('accounting') = 'admin') then raise exception 'Only Owners and Accounting Admins'; end if;
  v := (select string_agg(distinct lower(trim(e)), ',') from unnest(string_to_array(replace(coalesce(p_emails, ''), ';', ','), ',')) e where trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  insert into app_settings (key, value) values ('acct.alert_people', coalesce(v, '')) on conflict (key) do update set value = excluded.value;
  return coalesce(v, '');
end $$;
revoke all on function set_acct_alert_people(text) from public, anon;
grant execute on function set_acct_alert_people(text) to authenticated;

create or replace function acct_alert_people() returns text
language sql stable security definer set search_path = public as $$
  select case when is_staff() then (select value from app_settings where key = 'acct.alert_people') end
$$;
revoke all on function acct_alert_people() from public, anon;
grant execute on function acct_alert_people() to authenticated;

CREATE OR REPLACE FUNCTION public._stop_outcome(p_stop integer, p jsonb, p_by text, p_via text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 218: once the invoice is in QuickBooks the outcome is final. Product the customer took and later sends back comes on a
  -- return manifest (Sales > Returns), which makes the credit memo.
  if fix and site is null and exists (select 1 from invoices i join orders od on od.id = i.order_id
                                       where od.stop_id = s.id and i.status <> 'void' and i.acct_status = 'sent') then
    raise exception 'The invoice for this stop is already in QuickBooks, so what happened here can''t change anymore. If the customer is sending product back, it comes back on a return manifest (Sales > Returns).';
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
  -- 218: the invoice is made here, for what the customer kept (nothing kept = no invoice). Fixing the outcome before the
  -- invoice goes to QuickBooks rebuilds it.
  if site is null then perform _invoice_for_stop(s.id); end if;

  -- tell people (not for a plain delivery / drop-off)
  if o not in ('delivered', 'dropped_off') or (fix and was is distinct from o) then
    msg := format('%s stop %s, %s: %s%s. %s package(s) coming back on the truck.%s', l.code, s.seq, c.name, label,
                  case when rcv is not null then ' (received by ' || rcv || ')' else '' end, nback, coalesce(' Note: ' || note_, ''))
           || case when fix then format(' (changed from %s)', coalesce(was, 'nothing')) else '' end;
    if site is null then
      perform _alert('sales', false, 'stop_outcome', 'Delivery: ' || label || ' at ' || c.name, msg, jsonb_build_object('stop_id', s.id, 'load_id', l.id));
    end if;
    if o in ('partly_rejected', 'fully_rejected', 'not_delivered') then
      perform _alert('distribution', true, 'stop_metrc', 'METRC: ' || label || ' on manifest ' || coalesce(s.manifest, '(none)'),
        msg || case when o = 'not_delivered' then ' Void the manifest once the product is received back.'
                    else ' Check the customer rejected those packages in METRC.' end, jsonb_build_object('stop_id', s.id, 'load_id', l.id));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'outcome', o, 'back', nback, 'load_done', (select status from loads where id = l.id) = 'delivered');
end $function$

;

CREATE OR REPLACE FUNCTION public.receive_returns(p_ids bigint[], p_site text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 218: fully rejected, or not delivered because the customer cancelled: the order is cancelled once it's all back
  -- (its holds come off; the lbs go back to the customer's reserve)
  foreach sid in array sids loop
    if exists (select 1 from load_stops s where s.id = sid and (s.outcome = 'fully_rejected' or (s.outcome = 'not_delivered' and s.outcome_reason = 'cancelled')))
       and not exists (select 1 from stop_returns x where x.stop_id = sid and x.back_at is null and x.cancelled_at is null) then
      for o in select od.id, od.so_number, l.code from orders od join load_stops s on s.id = od.stop_id join loads l on l.id = s.load_id
                where od.stop_id = sid and od.status in ('shipped', 'pending') loop
        update orders set status = 'cancelled', updated_at = now() where id = o.id;
        insert into events (user_email, type, details) values (current_email(), 'order_cancelled',
          jsonb_build_object('order_id', o.id, 'so', o.so_number, 'load', o.code, 'why', 'rejected / cancelled at the stop, received back'));
      end loop;
    end if;
  end loop;
  update app_alerts a set done_at = now(), done_by = current_email()
   where a.done_at is null and a.kind = 'stop_outcome' and a.module = 'sales'
     and (a.ref ->> 'stop_id')::int = any(sids)
     and not exists (select 1 from stop_returns x where x.stop_id = (a.ref ->> 'stop_id')::int and x.back_at is null and x.cancelled_at is null);
  return jsonb_build_object('received', n, 'restaged', restaged, 'ready', ready);
end $function$

;

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
           where new.module = 'accounting' and trim(v) <> '') x;
  if who is not null then perform _notify(who, new.title, new.body, url, new.kind, new.ref); end if;
  return null;
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
    where a.done_at is null and a.kind in ('stop_outcome', 'stop_metrc', 'acct_flag')
      and (is_owner() or (case when a.admins then mod_level(a.module) = 'admin' else mod_level(a.module) is not null end)
           or (a.module = 'accounting' and jwt_email() = any(string_to_array(replace(coalesce((select value from app_settings where key = 'acct.alert_people'), ''), ' ', ''), ','))))), '[]'::jsonb);
end $function$

;

-- =====================================================================================================
-- 3. going live: invoices made at Depart for stops that haven't been delivered, never sent to QuickBooks, go away
--    (11/5: only Lazer Buddha INV-26110403 on L-1104-5). They'll be made at the stop outcome under the new rules.
-- =====================================================================================================
do $$
declare r record;
begin
  for r in select i.id, i.inv_number, i.total, o.so_number from invoices i join orders o on o.id = i.order_id
             join load_stops s on s.id = o.stop_id join loads l on l.id = s.load_id
            where l.kind = 'delivery' and s.status = 'pending' and i.acct_status <> 'sent' and i.status = 'open' and i.parent_invoice_id is null
              and not exists (select 1 from lot_feedback f where f.invoice_id = i.id) loop
    delete from acct_pushes where invoice_id = r.id and status <> 'sent';
    update invoice_lines set applies_to = null where invoice_id = r.id;
    delete from invoice_lines where invoice_id = r.id;
    delete from invoices where id = r.id;
    insert into events (user_email, type, details) values (coalesce(current_email(), 'system'), 'invoice_removed',
      jsonb_build_object('invoice_id', r.id, 'inv', r.inv_number, 'so', r.so_number, 'total', r.total, 'why', '218: invoices are made at delivery now; this stop isn''t delivered yet'));
  end loop;
end $$;

commit;
