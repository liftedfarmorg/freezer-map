-- 155_molten_turbo.sql (first saved as 154; renumbered, 154 is qbo_history)  (Msg HARV-TIE-4, 2026-11-01; run live by Claude after Aziz's go)
-- App only, nothing to METRC. Harvest names left as they are (Aziz).
-- METRC: both packaged from one harvest OHR-0196-Frozen-101526 (1,945 plants = 933 + 1,012, 6,202.22 packaged).
-- Farm Data OHR 2026: Turbo Snax = MB x BP x P #9 (1,012, Block 2), Molten Grapes = MB x BP x P #5 (933, Block 2).
--   160 Turbo Snax, Block 2:    P727 + P728-P732 (from 192) = 3,789.38; plants 1,012; planting 71
--   161 Molten Grapes, Block 2: P733-P736 (from 180)        = 2,412.84; plants 933;   planting 73
--   180 and 192 (Block 1-A, made from the pallet sheet's typo) cancelled.
begin;

update pallets set harvest_id = 160, updated_at = now() where harvest_id = 192;
update pallets set harvest_id = 161, updated_at = now() where harvest_id = 180;

update cult_harvests set plants = 1012, plants_harvested = 1012, metrc_plants = 1012, planting_id = 71, ff_lbs = null,
       notes = concat_ws(' ', notes, '| 11/1 (154): Turbo Snax = MB x BP x P #9; P728-P732 moved here from 192; plants were the raw weight.'),
       updated_at = now()
 where id = 160;
update cult_harvests set plants = 933, plants_harvested = 933, metrc_plants = 933, planting_id = 73, ff_lbs = null,
       notes = concat_ws(' ', notes, '| 11/1 (154): Molten Grapes = MB x BP x P #5; P733-P736 moved here from 180; plants were the raw weight.'),
       updated_at = now()
 where id = 161;

update cult_harvests h set status = 'cancelled', stage = null,
       notes = concat_ws(' ', h.notes, '| Cancelled 11/1 (154): duplicate of harvest ' || x.keep || ', pallets are on that one.'),
       updated_at = now()
  from (values (192, 160), (180, 161)) as x(id, keep)
 where h.id = x.id and not exists (select 1 from pallets p where p.harvest_id = h.id);

insert into events (user_email, type, note, details)
values ('aziz@lifted-organics.com', 'harvest_fix', '154 Molten Grapes / Turbo Snax pallets onto 161 / 160; 180 / 192 cancelled',
        jsonb_build_object('msg', 'HARV-TIE-4'));
commit;

select h.id, h.strain, h.status, f.name as field, h.plants_harvested,
       coalesce((select sum(x) from unnest(h.raw_bins) x), 0) as raw_lbs,
       (select count(*) from pallets p where p.harvest_id = h.id and p.parent_id is null) as pallets,
       (select sum(og_weight) from pallets p where p.harvest_id = h.id and p.parent_id is null) as pallet_lbs
  from cult_harvests h left join fields f on f.id = h.field_id
 where h.id in (160, 161, 180, 192) order by h.id;
