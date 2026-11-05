-- Trial fixes round 1 (Msg RAMA-TRIALS-8, 11/5). Approved: Rama (fix plan review) + Aziz 11/5.
-- Reality, METRC and the app must match. Queues METRC to-dos (they send on Auto).
--  T022 MP x DB #79: ...822 229.58 -> 157.98 (Entry error). With T022-1 (40) = 197.98 counted.
--  T023 Darryl Strawberry: ...823 171.34 -> 310.38 (Entry error); all of it in 42C (Rama).
--  T009 Local Skunk: ...809 141 -> 85.54 (Entry error). Aziz: 40 lb left for the Bear Humboldt order.
--  T006 Runtz: package ...806 from OHR-0171 at 44.05 (all its wet weight), then adjust to 175 (Entry error, Aziz). Finish OHR-0171.
--  GG x PM #17 (OHR-0162, 363.99 left): T033 253.48 on ...833 (includes the 20 lb on ...827, Rama), T026 76.18 on ...826 (restored),
--    ...827 adjusted 20 -> 0 (Entry error: counted inside T033), waste 34.33, finish.
-- HELD: BBM #11 / T034, Lime Belts #38, GJ x P #33 (need decisions / wet weights).
-- Guard: rolls back unless exactly the expected 11 to-dos get created.
-- RUN LIVE by Claude 11/5 via Management API (as Aziz).
begin;
select set_config('request.jwt.claims','{"email":"aziz@lifted-organics.com","role":"authenticated","amr":[{"method":"oauth"}]}',true);
create temp table _mx on commit drop as select coalesce(max(id),0) m from comp_metrc_actions;

-- 1. adjustments (each queues an "Adjust package weight" to-do)
select adjust_weight(667, 157.98, 'Rama count 11/5: 197.98 total with T022-1 (40). 269.58 not found.', 'entry');
select adjust_weight(677, 310.38, 'Rama count 11/5: 279.58 (42C) + 30.8 (42O), all going to 42C.', 'entry');
select adjust_weight(668, 85.54, 'Aziz 11/5: 125.54 counted, 40 lb left for the Bear Humboldt order.', 'entry');
update pallets set slot_id = 743, updated_at = now() where id = 677;
insert into events(user_email,type,pallet_id,to_slot_id,note,details) values
 (current_email(),'tag_audit',677,743,'Rama 11/5: all Darryl Strawberry consolidated in 42C (was 42N in the app). App only.',jsonb_build_object('metrc',false,'slot','42C'));

-- 2. Runtz T006: package at 44.05 (all of OHR-0171's wet weight), then adjust to 175
update pallets set og_weight = 44.05, current_weight = 44.05, slot_id = 741, updated_at = now() where id = 662;
insert into comp_metrc_actions (at, license, kind, action, harvest_id, pallet_id, code, tag, lbs, summary, status, touch_tags, details)
select now(), 'CCL25-0000017', 'harvest_package', 'Create package from harvest', 146, p.id, p.code, p.package_tag, 44.05,
       p.code || ' · Runtz · OHR-0171-Frozen-101526', 'todo', array[upper(p.package_tag)],
       jsonb_build_object('harvest_id',146,'batch','OHR-0171-Frozen-101526','by','aziz@lifted-organics.com','note','11/5: package at the 44.05 lb wet weight, then adjust to 175 (Entry error, Aziz)')
  from pallets p where p.id = 662;
select adjust_weight(662, 175, 'Aziz 11/5: Runtz on hand ~175 lb (Rama). Packaged at the 44.05 lb wet weight first.', 'entry');
insert into comp_metrc_actions (at, license, kind, action, harvest_id, lbs, summary, status, due_at, details)
values (now(), 'CCL25-0000017', 'harvest_finish', 'Finish harvest', 146, null, 'Runtz · OHR-0171-Frozen-101526 · finish', 'todo', now() + interval '60 minutes',
        jsonb_build_object('harvest_id',146,'batch','OHR-0171-Frozen-101526','site','OHR','strain','Runtz','by','aziz@lifted-organics.com','note','11/5 round 1'));
update cult_harvests set ff_lbs = 44.05, waste_lbs = 0, updated_at = now() where id = 146;

-- 3. GG x PM #17
insert into events(user_email,type,pallet_id,note,details) values
 (current_email(),'tag_audit',665,'Rama 11/5: T033 is 253.48 on ...833 at 42R (the 20 lb on ...827 is inside it). App only; METRC via the to-dos below.',jsonb_build_object('from','ABC06030007AD3D000000827','to','ABC06030007AD3D000000833','metrc',false)),
 (current_email(),'weight_audit',665,'Rama 11/5 count: 253.48.',jsonb_build_object('from',20,'to',253.48,'diff',233.48,'metrc',false)),
 (current_email(),'tag_audit',1895,'Rama 11/5: T026 is real, 76.18 on ...826 at 42E. Restored (was removed 10/29).',jsonb_build_object('from',null,'to','ABC06030007AD3D000000826','metrc',false,'restored',true));
update pallets set package_tag='ABC06030007AD3D000000833', tag_pending=false, og_weight=253.48, current_weight=253.48, slot_id=756, needs_review=null, updated_at=now() where id=665;
update pallets set status='in_freezer', og_weight=76.18, current_weight=76.18, slot_id=747, needs_review=null, updated_at=now() where id=1895;
update cult_harvests set metrc_name = coalesce(metrc_name,'OHR-0162-Frozen-101926'), ff_lbs = 253.48 + 76.18 + 30, waste_lbs = 34.33, updated_at = now() where id = 175;

insert into comp_metrc_actions (at, license, kind, action, tag, lbs, summary, status, touch_tags, details)
values (now(), 'CCL25-0000017', 'adjust', 'Adjust package weight', 'ABC06030007AD3D000000827', 0,
        '...827 · Garlic Grapes x Pack Mule #17 · 20 > 0 (counted inside T033)', 'todo', array['ABC06030007AD3D000000827'],
        jsonb_build_object('type','weight_adjust','from',20,'to',0,'reason','entry','by','aziz@lifted-organics.com','note','Rama 11/5: the 20 lb is inside T033 (253.48 on ...833)'));
insert into comp_metrc_actions (at, license, kind, action, harvest_id, pallet_id, code, tag, lbs, summary, status, touch_tags, details)
select now(), 'CCL25-0000017', 'harvest_package', 'Create package from harvest', 175, p.id, p.code, p.package_tag, p.og_weight,
       p.code || ' · Garlic Grapes x Pack Mule #17 · OHR-0162-Frozen-101926', 'todo', array[upper(p.package_tag)],
       jsonb_build_object('harvest_id',175,'batch','OHR-0162-Frozen-101926','by','aziz@lifted-organics.com','note','Rama 11/5 count')
  from pallets p where p.id in (665, 1895) order by p.id;
insert into comp_metrc_actions (at, license, kind, action, harvest_id, lbs, summary, status, due_at, details)
select now(), 'CCL25-0000017', x.kind, x.action, 175, x.lbs, 'Garlic Grapes x Pack Mule #17 · OHR-0162-Frozen-101926' || x.s, 'todo', now() + x.after,
       jsonb_build_object('harvest_id',175,'batch','OHR-0162-Frozen-101926','site','OHR','strain','Garlic Grapes x Pack Mule #17','by','aziz@lifted-organics.com','note','11/5 round 1')
  from (values ('harvest_waste','Record harvest waste',34.33::numeric,' · 34.33 lb waste',interval '30 minutes'),
               ('harvest_finish','Finish harvest',null::numeric,' · finish',interval '60 minutes')) as x(kind,action,lbs,s,after);

-- guard: exactly these 11 new to-dos
do $g$ declare n int; bad text; begin
 select count(*), string_agg(kind||':'||coalesce(code,tag,''),', ') filter (where not (kind in ('adjust','harvest_package','harvest_waste','harvest_finish')))
   into n, bad from comp_metrc_actions where id > (select m from _mx);
 if n <> 11 or bad is not null then raise exception 'Unexpected to-dos (% new; %), rolling back', n, bad; end if;
end $g$;
commit;
