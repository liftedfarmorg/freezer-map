-- 161: returns, part 3.
--  * Credit memo lines: one per return line (each strain on its own line); the description is the return reason
--    ("Yield", "Not delivered", ...) followed by the strain and crop year.
--  * "Already received in METRC": a return whose packages came in before the return existed (or were received on Inbound
--    without picking the return) is received from the packages already in the app: pick them, check the lbs, done. Same result
--    as receiving on Inbound (packages marked returned on the line, credit memo made).
--  * "Credit without receiving" (Sales Admins): Not delivered lines credited without any package coming back.
--  * Farm on a return line can be corrected while nothing on it has been received (return_set_line_site).
-- Run after 160. Safe to re-run.
begin;

-- the core: p_items [{pallet_id?, tag?, line_id?, lbs, strain?, source_labels?}]; no pallet and no tag = credit only
create or replace function _return_apply(p_return int, p_manifest text, p_items jsonb, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r return_orders; x jsonb; p pallets; rl0 return_lines; tg text; v_lbs numeric; got jsonb := '[]'; cm credit_memos; n int := 0; tot numeric; inv text;
begin
  select * into r from return_orders where id = p_return for update;
  if r.id is null or r.status = 'cancelled' then raise exception 'No open return %', coalesce(p_return::text, ''); end if;
  for x in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    v_lbs := nullif(x ->> 'lbs', '')::numeric;
    if v_lbs is null or v_lbs <= 0 then continue; end if;
    p := null; rl0 := null;
    if nullif(x ->> 'pallet_id', '') is not null then select * into p from pallets where id = (x ->> 'pallet_id')::bigint; end if;
    tg := upper(trim(coalesce(x ->> 'tag', p.package_tag, '')));
    if tg = '' then tg := null; end if;
    if p.id is null and tg is not null then select * into p from pallets where upper(package_tag) = tg order by updated_at desc limit 1; end if;
    if p.id is not null and exists (select 1 from return_packages where pallet_id = p.id) then continue; end if;
    if tg is not null and exists (select 1 from return_packages where upper(tag) = tg and manifest is not distinct from p_manifest) then continue; end if;
    if nullif(x ->> 'line_id', '') is not null then
      select * into rl0 from return_lines where id = (x ->> 'line_id')::int and return_id = r.id;
    else
      select * into rl0 from return_lines l where l.return_id = r.id
       order by (tg is not null and tg = any(l.tags)) desc,
                (exists (select 1 from jsonb_array_elements_text(coalesce(x -> 'source_labels', '[]')) s where upper(s) = any(l.tags))) desc,
                (canonical_strain(coalesce(x ->> 'strain', p.strain)) is not distinct from canonical_strain(l.strain)) desc,
                (l.received_lbs < l.lbs) desc, l.id
       limit 1;
    end if;
    if rl0.id is null then continue; end if;
    if p.id is not null then
      update pallets set return_line_id = rl0.id, returned_at = coalesce(returned_at, now()),
             strain = case when rl0.order_line_id is not null and (tg is null or tg <> all(rl0.tags)) then rl0.strain else strain end,
             origin_site = coalesce(rl0.site, origin_site), crop_year = coalesce(rl0.crop_year, crop_year), product = rl0.product,
             needs_review = case when needs_review = 'Received from METRC: check strain and product' then null else needs_review end,
             notes = concat_ws('. ', notes, 'Returned on ' || r.rma), updated_at = now()
       where id = p.id;
    end if;
    insert into return_packages (return_line_id, pallet_id, tag, lbs, manifest, received_by) values (rl0.id, p.id, tg, v_lbs, p_manifest, p_by);
    update return_lines set received_lbs = received_lbs + v_lbs where id = rl0.id;
    got := got || jsonb_build_object('tag', tg, 'code', p.code, 'line_id', rl0.id, 'lbs', v_lbs);
    n := n + 1;
  end loop;
  if n = 0 then return jsonb_build_object('rma', r.rma, 'received', 0); end if;
  update return_orders set status = 'received', manifest = coalesce(manifest, p_manifest), received_at = coalesce(received_at, now()), received_by = coalesce(received_by, p_by), updated_at = now()
   where id = r.id;
  select string_agg(distinct i.inv_number, ', ') into inv from return_lines l join invoice_lines il on il.order_line_id = l.order_line_id join invoices i on i.id = il.invoice_id
   where l.return_id = r.id and i.status <> 'void';
  insert into credit_memos (cm_number, return_id, customer_id, notes, created_by)
  values ('CM-' || r.rma || case when exists (select 1 from credit_memos where return_id = r.id) then '-' || (select count(*) + 1 from credit_memos where return_id = r.id) else '' end,
          r.id, r.customer_id, concat_ws(' · ', 'Return ' || r.rma, case when inv is not null then 'invoice ' || inv end, case when p_manifest is not null then 'manifest ' || p_manifest end), p_by)
  returning * into cm;
  -- one line per return line (each strain on its own line); description = the reason, then strain and crop year
  insert into credit_memo_lines (credit_memo_id, return_line_id, sort, product, description, strain, crop_year, site, class, qty, price, amount)
  select cm.id, l.id, row_number() over (order by l.id),
         case when l.reason = 'not_delivered' then 'PRODUCT_REFUND' else 'PRODUCT_RETURN' end,
         concat_ws(' - ', case l.reason when 'quality' then 'Quality' when 'yield' then 'Yield' when 'wrong_strain' then 'Wrong strain' when 'overshipped' then 'Overshipped'
                                       when 'damaged' then 'Damaged' when 'not_delivered' then 'Not delivered' else 'Other' end,
                   l.strain || coalesce(' (' || l.crop_year || ')', '')),
         l.strain, l.crop_year, l.site, acct_class_for(l.site, 'flower', l.crop_year), g.lbs, coalesce(l.price_per_lb, 0), round(g.lbs * coalesce(l.price_per_lb, 0), 2)
    from (select (e ->> 'line_id')::int as line_id, sum((e ->> 'lbs')::numeric) as lbs from jsonb_array_elements(got) e group by 1) g
    join return_lines l on l.id = g.line_id;
  select coalesce(sum(amount), 0) into tot from credit_memo_lines where credit_memo_id = cm.id;
  update credit_memos set total = tot where id = cm.id;
  insert into events (user_email, type, note, details)
  values (coalesce(p_by, 'metrc'), 'return_received', r.rma || ': ' || n || ' lines/packages, credit memo ' || cm.cm_number || ' $' || tot,
          jsonb_build_object('return_id', r.id, 'manifest', p_manifest, 'packages', got, 'credit_memo', cm.id, 'total', tot));
  return jsonb_build_object('rma', r.rma, 'received', n, 'credit_memo', cm.cm_number, 'total', tot, 'packages', got);
end $$;
revoke all on function _return_apply(int, text, jsonb, text) from public, anon, authenticated;

-- Inbound (server, right after METRC took the delivery)
create or replace function return_receive(p_return int, p_manifest text, p_rows jsonb, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Server only'; end if;
  return _return_apply(p_return, p_manifest, (select coalesce(jsonb_agg(x - 'line_id' - 'pallet_id'), '[]') from jsonb_array_elements(coalesce(p_rows, '[]')) x), p_by);
end $$;

-- packages already in the app that could be this return's: our tags first, then anything received on Inbound in the last 120 days
create or replace function return_candidates(p_return int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.ours desc, x.received_on desc nulls last, x.code), '[]') from (
    select p.id, p.code, p.strain, p.status, p.package_tag as tag, p.current_weight as lbs_now, p.received_site as site,
           e.lbs as received_lbs, (e.at at time zone 'America/Los_Angeles')::date as received_on, e.details ->> 'manifest' as manifest, e.details ->> 'from' as from_name,
           exists (select 1 from return_lines l where l.return_id = p_return and upper(p.package_tag) = any(l.tags)) as ours,
           (select l.id from return_lines l where l.return_id = p_return
             order by (upper(p.package_tag) = any(l.tags)) desc, (canonical_strain(p.strain) is not distinct from canonical_strain(l.strain)) desc, l.id limit 1) as line_id
      from pallets p
      left join lateral (select ev.lbs, ev.at, ev.details from events ev where ev.pallet_id = p.id and ev.type = 'inbound_received' order by ev.at desc limit 1) e on true
     where p.kind = 'package' and p.return_line_id is null and not exists (select 1 from return_packages rp where rp.pallet_id = p.id)
       and (exists (select 1 from return_lines l where l.return_id = p_return and upper(p.package_tag) = any(l.tags))
            or (e.at is not null and e.at > now() - interval '120 days'))
       and (is_sales() or has_module('accounting'))) x
$$;

-- "Already received in METRC" (Sales) and "Credit without receiving" (Sales Admins; Not delivered lines only)
-- p_items [{pallet_id, line_id, lbs}] or, credit only, [{line_id, lbs}]
create or replace function return_receive_manual(p_return int, p_items jsonb, p_manifest text default null, p_credit_only boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; res jsonb;
begin
  perform no_view_as();
  if not can_edit('sales') then raise exception 'Only Sales can receive returns'; end if;
  if p_credit_only then
    if not (is_sales_admin() or is_owner()) then raise exception 'Only a Sales Admin can credit without receiving'; end if;
    for x in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
      if nullif(x ->> 'pallet_id', '') is not null or nullif(x ->> 'tag', '') is not null then raise exception 'Credit without receiving takes no packages'; end if;
      if not exists (select 1 from return_lines where id = (x ->> 'line_id')::int and return_id = p_return and reason = 'not_delivered') then
        raise exception 'Credit without receiving is only for Not delivered lines'; end if;
      if (x ->> 'lbs')::numeric > (select lbs - received_lbs from return_lines where id = (x ->> 'line_id')::int) + 0.001 then
        raise exception 'More than is left on that line'; end if;
    end loop;
  else
    for x in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
      if nullif(x ->> 'pallet_id', '') is null then raise exception 'Pick the package for every line'; end if;
      if nullif(x ->> 'line_id', '') is null then raise exception 'Pick the return line for every package'; end if;
    end loop;
  end if;
  res := _return_apply(p_return, nullif(trim(p_manifest), ''), p_items, current_email());
  if coalesce((res ->> 'received')::int, 0) = 0 then raise exception 'Nothing was received (already on this return?)'; end if;
  return res;
end $$;

-- fix the farm on a line before anything on it is received (credit memo class and the packages' farm follow it)
create or replace function return_set_line_site(p_line int, p_site text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform no_view_as();
  if not can_edit('sales') then raise exception 'Only Sales can change returns'; end if;
  if upper(p_site) not in (select code from sites) then raise exception 'Unknown farm %', p_site; end if;
  update return_lines set site = upper(p_site) where id = p_line and received_lbs = 0;
  if not found then raise exception 'Something on that line was already received'; end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['return_candidates(int)', 'return_receive_manual(int, jsonb, text, boolean)', 'return_set_line_site(int, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function return_receive(int, text, jsonb, text) from public, anon, authenticated';
  execute 'grant execute on function return_receive(int, text, jsonb, text) to service_role';
end $$;

commit;
