-- DATA FIX 2026-11-11 (Msg ITEM-1): D7219 / D7220 (Royals Cherry buck run B-261106-1) have no item, so METRC to-dos
-- #1050 / #1051 fail with "has no item in the app". Cause: the run and its outputs have no crop year. Data fix 231
-- (G4217 strain fix, 11/6) changed the run's strain but didn't fill its crop year, so the outputs couldn't guess an item.
--  * Run B-261106-1: crop year 2026.
--  * D7219 (bucked, 358.04 lb): item "Lifted Farms (FL26OH) - Royals Cherry - OCAL Bucked Dry Flower".
--  * D7220 (trim, 47.6 lb):     item "Lifted Farms (FL26OH) - Royals Cherry - OCAL Dry Trim".
--    FL26OH: harvested at OHR (METRC harvest OHR-RoyalsCherry-Dry-102026), same as G4217's item and the
--    Governmint Oasis buck outputs (D7215 / D7216). The item cards are made here if missing (item_for).
--  * App only. Nothing goes to METRC from this file. When #1050 / #1051 are sent, the sender makes the items on
--    GVR processing (CCL21-0000679) in METRC first if they aren't there, then the packages.
-- Stops if anything doesn't look the way it did on 11/11. Safe to re-run.
begin;

do $$
declare r proc_runs; s int; bf bigint; tr bigint; n int;
begin
  select * into r from proc_runs where code = 'B-261106-1';
  if r.id is null or r.strain <> 'Royals Cherry' then raise exception 'Run B-261106-1 not found / not Royals Cherry'; end if;
  if (select count(*) from pallets where run_id = r.id) <> 2 then raise exception 'Run B-261106-1 should have exactly 2 outputs'; end if;
  if exists (select 1 from pallets where code in ('D7219', 'D7220') and run_id = r.id and item_id is not null) then
    raise notice 'Already has items'; return;
  end if;
  s := strain_id_of('Royals Cherry');
  bf := item_for(2026, 'OHR', 'BF', s);
  tr := item_for(2026, 'OHR', 'TR', s);
  if bf is null or tr is null then raise exception 'Could not find or make the Royals Cherry items'; end if;

  update proc_runs set crop_year = 2026, updated_at = now() where id = r.id;
  update pallets set crop_year = 2026, updated_at = now() where run_id = r.id and code in ('D7219', 'D7220');
  -- after the crop year, so the item guess doesn't override it
  update pallets set item_id = bf where run_id = r.id and code = 'D7219' and product = 'bucked';
  get diagnostics n = row_count; if n <> 1 then raise exception 'D7219 not bucked'; end if;
  update pallets set item_id = tr where run_id = r.id and code = 'D7220' and product = 'trim';
  get diagnostics n = row_count; if n <> 1 then raise exception 'D7220 not trim'; end if;

  insert into events (user_email, type, pallet_id, lbs, note, details)
  select 'aziz@lifted-organics.com', 'item_fix', p.id, p.current_weight, 'Item set (run had no crop year)',
         jsonb_build_object('code', p.code, 'run', r.code, 'item', (select metrc_name from items where id = p.item_id))
    from pallets p where p.run_id = r.id;
end $$;

select p.code, p.product, p.crop_year, i.metrc_name, i.metrc_status
  from pallets p left join items i on i.id = p.item_id
 where p.code in ('D7219', 'D7220');

commit;
