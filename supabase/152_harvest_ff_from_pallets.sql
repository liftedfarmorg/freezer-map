-- 152_harvest_ff_from_pallets.sql  (Msg HARV-TIE-2, 2026-11-01; run live by Claude after Aziz's go)
-- These harvests had the whole strain's fresh frozen total typed on each one, so the Harvested tab
-- double counted. Clearing it lets each harvest show its own pallets (the totals still add up):
--   Banana Bonanza 142 + 95          = 20,007.4   (7,007.4 + 13,000)
--   Banana Punch 140 + 81            = 11,410.16  (2,586.42 + 8,823.74)
--   Canal St Runtz 55 + 145          = 1,799.94   (966.96 + 832.98)
--   Dragonfruit Soda 42 + 43 + 155   = 3,693.36   (2,354.98 + 1,161.68 + 176.70)
--   Nam Wah GVR 132 + 166 + 167      = 18,730.6   (15,600 + 2,600 + 530.6)
--   Ruby Violet 141 + 87             = 1,493.7    (472.44 + 1,021.26)
-- Left as is: Rainbow Guava 106 and Sour Strawberry 114. Their number is right; the pallet total is higher only
-- because the Enigma pallets (P832 490; P830 + P831 1,300) sit on them, which Aziz said to leave.
-- App only, nothing to METRC.
begin;
update cult_harvests h set ff_lbs = null, updated_at = now()
 where h.id in (142, 95, 140, 55, 42, 43, 155, 132, 141)
   and h.status = 'done' and h.kind = 'ff'
   and exists (select 1 from pallets p where p.harvest_id = h.id and p.parent_id is null);
insert into events (user_email, type, note, details)
values ('aziz@lifted-organics.com', 'harvest_fix', '152 strain totals cleared from harvests; each shows its own pallets',
        jsonb_build_object('msg', 'HARV-TIE-2', 'harvests', jsonb_build_array(142, 95, 140, 55, 42, 43, 155, 132, 141)));
commit;

select h.id, h.strain, h.harvested_on, h.ff_lbs,
       (select sum(og_weight) from pallets p where p.harvest_id = h.id and p.parent_id is null) as pallet_lbs
  from cult_harvests h where h.id in (142, 95, 140, 55, 42, 43, 155, 132, 141) order by h.strain, h.harvested_on;
