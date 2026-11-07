-- 231: DATA FIX (Aziz 11/6, Msg #280-281). G4217 (990 lbs unbucked dry flower at GVR, METRC tag ...7202) came back from
-- Central Coast Processing labeled "Government Oasis", but it's Royals Cherry (METRC's source harvest is already
-- OHR-RoyalsCherry-Dry-102026; CCP mislabeled the item). App only; nothing is sent to METRC.
--  * G4217: strain Royals Cherry, linked to the Royals Cherry wet lot sent to CCP (DN10, lot FL26-OH-223-02), processor CCP.
--  * New item "Lifted Farms (FL26OH) - Royals Cherry - OCAL Unbucked Dry Flower" (same setup as the Governmint one) on G4217.
--  * Open buck run B-261106-1 (input G4217, no outputs yet) becomes Royals Cherry, so its outputs come out Royals Cherry.
--  * Activity line on G4217. Stops if anything doesn't look the way it did on 11/6. Safe to re-run.
begin;

do $$
declare p pallets; dn pallets; gi items; r proc_runs; new_item int;
begin
  select * into p from pallets where code = 'G4217';
  select * into dn from pallets where code = 'DN10';
  select * into gi from items where sku = 'FL26-OH-OCAL-UF-GovernmintOasis';
  select * into r from proc_runs where code = 'B-261106-1';
  if p.id is null or upper(p.package_tag) <> '1A4060300030F35000007202' then raise exception 'G4217 not found / tag changed'; end if;
  if p.strain = 'Royals Cherry' and p.wet_lot_id = dn.id then raise notice 'G4217 already fixed'; return; end if;
  if p.strain <> 'Government Oasis' or p.current_weight <> 990 then raise exception 'G4217 changed since 11/6 (% / %)', p.strain, p.current_weight; end if;
  if dn.id is null or dn.strain <> 'Royals Cherry' or dn.product <> 'wet' then raise exception 'DN10 not as expected'; end if;
  if gi.id is null then raise exception 'Governmint unbucked item not found'; end if;
  if r.id is null or r.status <> 'open' or exists (select 1 from pallets where run_id = r.id) then raise exception 'Run B-261106-1 isn''t open with no outputs any more'; end if;

  -- the Royals Cherry unbucked item, set up like the Governmint one
  select id into new_item from items where sku = 'FL26-OH-OCAL-UF-RoyalsCherry';
  if new_item is null then
    insert into items (sku, crop_year, site, cert, finish, strain_id, metrc_name, license, roshi_category, acct_class, default_price, uom,
                       metrc_status, active, created_by, season, on_menu, price_per_lb, price_bho)
    select 'FL26-OH-OCAL-UF-RoyalsCherry', crop_year, site, cert, finish, dn_item.strain_id,
           'Lifted Farms (FL26OH) - Royals Cherry - OCAL Unbucked Dry Flower', license, roshi_category, acct_class, default_price, uom,
           'to_create', active, 'aziz@lifted-organics.com', season, on_menu, price_per_lb, price_bho
      from items, (select strain_id from items where id = dn.item_id) dn_item where items.id = gi.id
    returning id into new_item;
  end if;

  update pallets set strain = 'Royals Cherry', wet_lot_id = dn.id, lot_id = dn.lot_id, processor_id = coalesce(processor_id, dn.processor_id),
                     crop_year = coalesce(crop_year, dn.crop_year), updated_at = now() where id = p.id;
  update pallets set item_id = new_item where id = p.id;     -- after the strain change, so the item guess doesn't override it
  update proc_runs set strain = 'Royals Cherry', notes = concat_ws(' · ', notes, 'Strain fixed 11/6: G4217 is Royals Cherry (CCP mislabeled it Governmint Oasis)'),
                       updated_at = now() where id = r.id;
  insert into events (user_email, type, pallet_id, lbs, note, details)
  values ('aziz@lifted-organics.com', 'strain_fix', p.id, p.current_weight, 'Mislabeled by Central Coast Processing as Governmint Oasis',
          jsonb_build_object('code', p.code, 'from', p.strain, 'to', 'Royals Cherry', 'wet_lot', dn.code, 'item', 'Lifted Farms (FL26OH) - Royals Cherry - OCAL Unbucked Dry Flower',
                             'run', r.code, 'metrc', 'Source harvest already OHR-RoyalsCherry-Dry-102026; item name on package ...7202 still CCP''s'));
end $$;

commit;
