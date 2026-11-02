-- 158: Dry Biomass as its own product, like fresh frozen (Aziz 11/1, Msg BIO-1).
--  * pallets.product 'dry_biomass' (finish DB). Combine harvests log Dry Biomass pallets with B numbers (B1, B2...), pushed to METRC
--    like fresh frozen; the METRC wet weight for a combine harvest is the pallet weight (no raw bins).
--  * Items: SU or FL by harvest date (SU = harvested on or before cult.su_last_day, default 08-31; FL after), BIO in the code:
--    SU26-OH-OCAL-BIO-GasFace, METRC "Lifted Farms (SU26OH) - Gas Face - OCAL Dry Biomass". Fresh frozen and the rest stay FL.
--  * Sales can put Dry Biomass on orders (not on the customer Menu or Reserves: those stay fresh frozen only). Invoices say
--    "Dry Biomass", batch = the pallet's item code, accounting product BIOMASS.
--  * History: the 7 Dry Biomass-only QuickBooks invoices become shipped orders + linked invoices (like 154, nothing to QuickBooks),
--    and TSL SO-26030601's biomass lines get order lines.
--  * Mod Mintz = Modified Mintz (alias + the 2 history lines).
-- RUN LIVE by Claude 11/1 (dry run with rollback first). 7 new history orders, 28 Dry Biomass order lines.
-- Patches some live functions by text (stops with an error if the text isn't what it expects). Safe to re-run.
begin;

-- 1. the product
alter table pallets drop constraint if exists pallets_product_check;
alter table pallets add constraint pallets_product_check check (product = any (array['fresh_frozen','wet','unbucked','bucked','bucked_standards','standards','smalls','trim','dry_biomass']));
update finishes set pallet_product = 'dry_biomass' where code = 'DB' and pallet_product is distinct from 'dry_biomass';

create or replace function product_label(p text) returns text language sql immutable as $$
  select case p when 'fresh_frozen' then 'Fresh Frozen' when 'wet' then 'Wet (raw)' when 'unbucked' then 'Unbucked' when 'bucked' then 'Bucked'
                when 'bucked_standards' then 'Bucked Standards' when 'standards' then 'Standards' when 'smalls' then 'Smalls' when 'trim' then 'Trim'
                when 'dry_biomass' then 'Dry Biomass'
                else initcap(coalesce(p, '')) end
$$;

create or replace function batch_name(p_year integer, p_site text, p_strain text, p_product text) returns text language sql immutable as $$
  select 'FL' || right(coalesce(p_year, 0)::text, 2) || '-' || case upper(coalesce(p_site, '')) when 'GVR' then 'GV' else 'OH' end
         || '-OCAL-' || case coalesce(p_product, 'fresh_frozen') when 'fresh_frozen' then 'FF' when 'dry_biomass' then 'BIO' else 'DF' end
         || '-' || regexp_replace(coalesce(p_strain, ''), '[^A-Za-z0-9#]', '', 'g')
$$;

-- 2. SU / FL by harvest date
insert into app_settings (key, value) values ('cult.su_last_day', '08-31') on conflict (key) do nothing;
create or replace function harvest_season(p_day date) returns text language sql stable security definer set search_path = public as $$
  select case when p_day is not null
               and to_char(p_day, 'MM-DD') <= coalesce((select value from app_settings where key = 'cult.su_last_day'), '08-31')
              then 'SU' else 'FL' end
$$;

-- 3. items carry the season
alter table items add column if not exists season text not null default 'FL';
alter table items drop constraint if exists items_season_check;
alter table items add constraint items_season_check check (season in ('FL', 'SU'));
alter table items drop constraint if exists items_crop_year_site_cert_finish_strain_id_key;
alter table items drop constraint if exists items_season_key;
alter table items add constraint items_season_key unique (crop_year, season, site, cert, finish, strain_id);

create or replace function item_sku(p_year int, p_site text, p_cert text, p_finish text, p_strain int, p_season text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(p_season, 'FL') || lpad((p_year % 100)::text, 2, '0') || '-' || (select farm_code from sites where code = p_site) || '-'
         || coalesce(p_cert, 'OCAL') || '-' || case p_finish when 'DB' then 'BIO' else p_finish end || '-' || regexp_replace(metrc_strain(p_strain), '\s+', '', 'g')
$$;
create or replace function item_sku(p_year int, p_site text, p_cert text, p_finish text, p_strain int) returns text
language sql stable security definer set search_path = public as $$ select item_sku(p_year, p_site, p_cert, p_finish, p_strain, 'FL') $$;

create or replace function item_metrc_name(p_year int, p_site text, p_cert text, p_finish text, p_strain int, p_season text) returns text
language sql stable security definer set search_path = public as $$
  select 'Lifted Farms (' || coalesce(p_season, 'FL') || lpad((p_year % 100)::text, 2, '0') || (select farm_code from sites where code = p_site) || ') - '
         || metrc_strain(p_strain) || ' - ' || coalesce(p_cert, 'OCAL') || ' '
         || (select coalesce(metrc_label, name) from finishes where code = p_finish)
$$;
create or replace function item_metrc_name(p_year int, p_site text, p_cert text, p_finish text, p_strain int) returns text
language sql stable security definer set search_path = public as $$ select item_metrc_name(p_year, p_site, p_cert, p_finish, p_strain, 'FL') $$;

drop function if exists item_for(int, text, text, int, text);
create or replace function item_for(p_year int, p_site text, p_finish text, p_strain int, p_cert text default 'OCAL', p_season text default 'FL') returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint; s text := coalesce(p_season, 'FL');
begin
  if p_year is null or p_site is null or p_finish is null or p_strain is null then return null; end if;
  if not exists (select 1 from sites where code = p_site and farm_code is not null) then return null; end if;
  select id into i from items where crop_year = p_year and season = s and site = p_site and cert = p_cert and finish = p_finish and strain_id = p_strain;
  if i is null then
    insert into items (sku, crop_year, season, site, cert, finish, strain_id, metrc_name, license, roshi_category, acct_class, uom)
    values (item_sku(p_year, p_site, p_cert, p_finish, p_strain, s), p_year, s, p_site, p_cert, p_finish, p_strain,
            item_metrc_name(p_year, p_site, p_cert, p_finish, p_strain, s),
            (select license from sites where code = p_site),
            (select name from finishes where code = p_finish) || ' - ' || p_year,
            case p_site when 'OHR' then '06_Oak Hill' when 'GVR' then '05_1363 GVR' end,
            (select uom from finishes where code = p_finish))
    on conflict (crop_year, season, site, cert, finish, strain_id) do nothing
    returning id into i;
    if i is null then
      select id into i from items where crop_year = p_year and season = s and site = p_site and cert = p_cert and finish = p_finish and strain_id = p_strain;
    end if;
  end if;
  return i;
end $$;
revoke execute on function item_for(int, text, text, int, text, text) from public, anon, authenticated;

-- Dry Biomass pallets get the SU / FL item from their harvest date; everything else stays FL
create or replace function pallet_item_guess(p pallets) returns bigint
language sql stable security definer set search_path = public as $$
  select item_for(
    coalesce(p.crop_year, (select h.crop_year from cult_harvests h where h.id = coalesce(p.harvest_id, p.from_harvest)),
             extract(year from p.harvest_date)::int),
    p.origin_site,
    (select code from finishes where pallet_product = coalesce(p.product, 'fresh_frozen')),
    strain_id_of(p.strain), 'OCAL',
    case when p.product = 'dry_biomass' then harvest_season(coalesce(p.harvest_date, current_date)) else 'FL' end)
$$;

-- 4. combine harvests make B pallets of Dry Biomass
create or replace function cult_pallet_letter(h cult_harvests) returns text
language sql stable security definer set search_path = public as $$
  select case when h.kind = 'combine' then 'B'
              when coalesce((select pl.trial from cult_plantings pl where pl.id = h.planting_id), false)
                or exists (select 1 from fields f where f.id = h.field_id and f.kind = 'trials') then 'T'
              else coalesce((select s.pallet_prefix from sites s where s.code = h.site), 'P') end
$$;

do $$
declare d text;
begin
  -- cult_add_pallets: combine too, product dry_biomass, B numbers never come from the tag
  d := pg_get_functiondef('cult_add_pallets(bigint, jsonb)'::regprocedure);
  if position('dry_biomass' in d) = 0 then
    if position('if h.kind not in (''ff'') then raise exception ''Pallets are for fresh frozen harvests''; end if;' in d) = 0
       or position('status, slot_id, harvest_id, received_site, notes, boxes, partial, pushed)' in d) = 0
       or position('coalesce((r ->> ''pushed'')::boolean, false) and h.status = ''done'')' in d) = 0
       or position('if v_code is null and v_tag ~ ''[0-9]{4}$''' in d) = 0 then
      raise exception '158: cult_add_pallets is not what 158 expects; nothing changed';
    end if;
    d := replace(d, 'if h.kind not in (''ff'') then raise exception ''Pallets are for fresh frozen harvests''; end if;',
                    'if h.kind not in (''ff'', ''combine'') then raise exception ''Pallets are for fresh frozen and combine (Dry Biomass) harvests''; end if;');
    d := replace(d, 'status, slot_id, harvest_id, received_site, notes, boxes, partial, pushed)',
                    'status, slot_id, harvest_id, received_site, notes, boxes, partial, pushed, product)');
    d := replace(d, 'coalesce((r ->> ''pushed'')::boolean, false) and h.status = ''done'')',
                    'coalesce((r ->> ''pushed'')::boolean, false) and h.status = ''done'', case when h.kind = ''combine'' then ''dry_biomass'' end)');
    d := replace(d, 'if v_code is null and v_tag ~ ''[0-9]{4}$''', 'if v_code is null and pre <> ''B'' and v_tag ~ ''[0-9]{4}$''');
    execute d;
  end if;

  -- cult_push: combine too; its METRC wet weight is the pallet weight
  d := pg_get_functiondef('cult_push(bigint, bigint[], boolean)'::regprocedure);
  if position('''combine''' in d) = 0 then
    if position('if h.kind not in (''ff'') then raise exception ''Push is for fresh frozen harvests.' in d) = 0
       or position('select coalesce(sum(lbs), 0) into new_wet from cult_weights where harvest_id = h.id and kind = ''raw'' and not pushed;' in d) = 0 then
      raise exception '158: cult_push is not what 158 expects; nothing changed';
    end if;
    d := replace(d, 'if h.kind not in (''ff'') then raise exception ''Push is for fresh frozen harvests.',
                    'if h.kind not in (''ff'', ''combine'') then raise exception ''Push is for fresh frozen and combine harvests.');
    d := replace(d, 'select coalesce(sum(lbs), 0) into new_wet from cult_weights where harvest_id = h.id and kind = ''raw'' and not pushed;',
                    'select coalesce(sum(lbs), 0) into new_wet from cult_weights where harvest_id = h.id and kind = ''raw'' and not pushed;
  if h.kind = ''combine'' then new_wet := new_wet + coalesce((select sum(og_weight) from pallets where id = any(ids)), 0); end if;   -- 158: Dry Biomass: wet weight = pallet weight');
    execute d;
  end if;

  -- cult_finish: combine finishes like fresh frozen (every pallet pushed, waste + finish to-dos)
  d := pg_get_functiondef('cult_finish(bigint, integer, text)'::regprocedure);
  if position('h.kind in (''ff'', ''combine'')' in d) = 0 then
    if position('if h.kind = ''ff'' then' in d) = 0 then raise exception '158: cult_finish is not what 158 expects; nothing changed'; end if;
    d := replace(d, 'if h.kind = ''ff'' then', 'if h.kind in (''ff'', ''combine'') then');
    execute d;
  end if;

  -- create_order: Dry Biomass can go on an order
  d := pg_get_functiondef('create_order(integer, jsonb, text, date, text, text, boolean)'::regprocedure);
  if position('dry_biomass' in d) = 0 then
    if position('''fresh_frozen'',''standards'',''smalls'',''trim'',''bucked'',''unbucked'')' in d) = 0 then raise exception '158: create_order is not what 158 expects'; end if;
    d := replace(d, '''fresh_frozen'',''standards'',''smalls'',''trim'',''bucked'',''unbucked'')', '''fresh_frozen'',''standards'',''smalls'',''trim'',''bucked'',''unbucked'',''dry_biomass'')');
    execute d;
  end if;

  -- _make_invoice: a Dry Biomass package's batch is its item code (SU26-OH-OCAL-BIO-GasFace)
  d := pg_get_functiondef('_make_invoice(integer)'::regprocedure);
  if position('dry_biomass' in d) = 0 then
    if position('batch_name(ln.crop_year, coalesce(split_part(p.origin_site, ''+'', 1), f.site, f2.site, p.received_site, case when p.code like ''G%'' then ''GVR'' else ''OHR'' end), ln.strain, ln.product)' in d) = 0 then
      raise exception '158: _make_invoice is not what 158 expects';
    end if;
    d := replace(d, 'batch_name(ln.crop_year, coalesce(split_part(p.origin_site, ''+'', 1), f.site, f2.site, p.received_site, case when p.code like ''G%'' then ''GVR'' else ''OHR'' end), ln.strain, ln.product)',
                    'coalesce(case when ln.product = ''dry_biomass'' then (select it.sku from items it where it.id = p.item_id) end, batch_name(ln.crop_year, coalesce(split_part(p.origin_site, ''+'', 1), f.site, f2.site, p.received_site, case when p.code like ''G%'' then ''GVR'' else ''OHR'' end), ln.strain, ln.product))');
    execute d;
  end if;
end $$;

-- 5. Mod Mintz = Modified Mintz
update strains set aliases = array_append(coalesce(aliases, '{}'), 'Mod Mintz')
 where name = 'Modified Mintz' and not ('Mod Mintz' = any(coalesce(aliases, '{}')));
update order_lines set strain = 'Modified Mintz', updated_at = now() where strain = 'Mod Mintz';
update invoice_lines set strain = 'Modified Mintz' where strain = 'Mod Mintz';

-- 6. history: Dry Biomass invoices from QuickBooks (154 left them for this)
alter table invoices disable trigger invoice_queue_push;
alter table invoices disable trigger invoice_shipping_line;
alter table invoice_lines disable trigger invoice_line_bump;
do $$
declare d record; x jsonb; k int; o_id int; inv_id int; ol_id int; inv_no text; it text; ds text; v_code text; sn text; cy int;
        qty numeric; price numeric; amt numeric; is_bio boolean; n_o int := 0; n_l int := 0;
begin
  for d in select q.*, (select o.id from orders o where o.so_number = q.doc_number limit 1) as oid
             from acct_qbo_docs q
            where q.env = 'production' and q.kind = 'Invoice' and q.customer_id is not null
              and exists (select 1 from jsonb_array_elements(q.lines) y where y ->> 'item' ~* 'biomass')
              and (q.invoice_id is null
                   or exists (select 1 from invoices i join orders o on o.id = i.order_id where i.id = q.invoice_id and o.source = 'qbo'))
            order by q.txn_date loop
    o_id := d.oid; inv_id := d.invoice_id;
    if o_id is null then
      insert into orders (so_number, customer_id, status, order_date, shipped_date, source, notes, created_by, confirmed_at, modified_at)
      values (case when exists (select 1 from orders where so_number = d.doc_number) then d.doc_number || '-Q' else d.doc_number end,
              d.customer_id, 'shipped', d.txn_date, d.txn_date, 'qbo', 'From QuickBooks invoice ' || d.doc_number || ' (Dry Biomass, 158)',
              'QuickBooks history import (158)', d.txn_date, now())
      returning id into o_id;
      n_o := n_o + 1;
    end if;
    if inv_id is null then
      inv_no := case when d.doc_number ~ '^SO-' then 'INV-' || substr(d.doc_number, 4) else d.doc_number end;
      if exists (select 1 from invoices where inv_number = inv_no) then inv_no := inv_no || '-Q'; end if;
      insert into invoices (inv_number, order_id, customer_id, invoice_date, due_date, subtotal, total, status, notes, acct_status, acct_ref, acct_push_after, created_by)
      values (inv_no, o_id, d.customer_id, d.txn_date, coalesce(d.due_date, d.txn_date), coalesce(d.total, 0), coalesce(d.total, 0),
              case when coalesce(d.balance, 0) <= 0 then 'paid' else 'open' end,
              'Copied from QuickBooks ' || d.doc_number || ' (history import 11/1/2026)', 'sent', d.qbo_id, null, 'QuickBooks history import (158)')
      returning id into inv_id;
      insert into acct_pushes (invoice_id, env, status, qbo_id, doc_number, total, balance, sent_by, sent_at, synced_at, line_map)
      values (inv_id, 'production', 'sent', d.qbo_id, d.doc_number, coalesce(d.total, 0), coalesce(d.balance, 0),
              'QuickBooks history import (158), linked to QuickBooks #' || d.doc_number, now(), now(), null)
      on conflict (invoice_id, env) do nothing;
      update acct_qbo_docs set invoice_id = inv_id where env = 'production' and kind = 'Invoice' and qbo_id = d.qbo_id;
    end if;
    k := 0;
    for x in select * from jsonb_array_elements(d.lines) loop
      k := k + 1;
      it := coalesce(x ->> 'item', ''); ds := coalesce(x ->> 'description', '');
      is_bio := it ~* 'biomass';
      qty := coalesce((x ->> 'qty')::numeric, 1); amt := coalesce((x ->> 'amount')::numeric, 0);
      price := coalesce((x ->> 'price')::numeric, case when qty <> 0 then round(amt / qty, 4) else amt end);
      ol_id := null; sn := null; cy := null;
      if is_bio then
        v_code := trim(substring(ds from '(?:FL|SU)\d\d-[A-Z]+-[A-Z]+-[A-Z]+-([^(\n]+)'));
        sn := coalesce((select s.name from strains s
                         where regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') = regexp_replace(lower(coalesce(v_code, split_part(ds, E'\n', 1))), '[^a-z0-9]', '', 'g')
                            or exists (select 1 from unnest(coalesce(s.aliases, '{}'::text[])) a
                                        where regexp_replace(lower(a), '[^a-z0-9]', '', 'g') = regexp_replace(lower(coalesce(v_code, split_part(ds, E'\n', 1))), '[^a-z0-9]', '', 'g'))
                         order by s.active desc nulls last limit 1),
                       nullif(trim(coalesce(v_code, split_part(ds, E'\n', 1))), ''), 'Biomass');
        cy := coalesce(2000 + substring(ds from '(?:FL|SU)(\d\d)-')::int,
                       case when extract(month from d.txn_date) >= 9 then extract(year from d.txn_date)::int else extract(year from d.txn_date)::int - 1 end);
        -- an order line, unless this invoice line already has one
        if not exists (select 1 from invoice_lines il where il.invoice_id = inv_id and il.sort = k and il.order_line_id is not null) then
          insert into order_lines (order_id, strain, product, lbs, ordered_lbs, price_per_lb, price_override, crop_year, farm)
          values (o_id, sn, 'dry_biomass', greatest(qty, 0), greatest(qty, 0), price, true, cy,
                  case substring(ds from '(?:FL|SU)\d\d-([A-Z]+)-') when 'OH' then 'OH' when 'OHR' then 'OH' when 'GV' then 'GV' end)
          returning id into ol_id;
          n_l := n_l + 1;
        end if;
      end if;
      if exists (select 1 from invoice_lines il where il.invoice_id = inv_id and il.sort = k) then
        if ol_id is not null then update invoice_lines set order_line_id = ol_id, strain = sn, crop_year = cy where invoice_id = inv_id and sort = k; end if;
      else
        insert into invoice_lines (invoice_id, sort, kind, item, description, strain, crop_year, qty, uom, price, amount, order_line_id)
        values (inv_id, k, case when is_bio or it ~* 'fresh frozen|standards|smalls|trim' then 'product' else 'charge' end, it, ds, sn, cy, qty,
                case when is_bio then 'lb' else 'ea' end, price, amt, ol_id);
      end if;
    end loop;
  end loop;
  insert into events (user_email, type, note, details)
  values ('QuickBooks history import (158)', 'qbo_history_import', 'Dry Biomass invoices from QuickBooks', jsonb_build_object('new_orders', n_o, 'order_lines', n_l));
end $$;
alter table invoices enable trigger invoice_queue_push;
alter table invoices enable trigger invoice_shipping_line;
alter table invoice_lines enable trigger invoice_line_bump;

commit;
