-- Data fix 11/5 (Msg LELAND-6). App only, nothing to METRC. Aziz said yes 11/5.
-- W2: was Cheetah Piss 290, no tag. Really Its It on ABC06030007AD3D000003002 (630, GVR 6J) + new W2-1 on 1A4060300030F35000005159 (10, GVR 7B). Both flagged: repackage later in METRC.
-- W16, W103: not at GVR, no active METRC package. Archived as entered by mistake.
-- RUN LIVE by Claude 11/5 via Management API. First try rolled back: a 'created' event queues a METRC new-package to-do, so W2-1 is logged as tag_audit (added) instead.
-- Guard: rolls back if any METRC to-do gets created.
begin;
select set_config('request.jwt.claims','{"email":"aziz@lifted-organics.com","role":"authenticated","amr":[{"method":"oauth"}]}',true);
create temp table _mx on commit drop as select coalesce(max(id),0) m from comp_metrc_actions;

insert into events(user_email,type,pallet_id,note,details) values
 (current_email(),'tag_audit',680,'Leland 11/5: W2 is Its It on ...003002 (630 lb, 6J). METRC already right; app only.',
  jsonb_build_object('from',null,'to','ABC06030007AD3D000003002','metrc',false,'strain_from','Cheetah Piss','strain_to','Its It')),
 (current_email(),'weight_audit',680,'Leland 11/5: 630 lb at 6J (METRC ...003002 = 630). App only.',
  jsonb_build_object('from',290,'to',630,'diff',340,'metrc',false));

update pallets set strain='Its It', package_tag='ABC06030007AD3D000003002', tag_pending=false,
  current_weight=630, item_id=256, crop_year=2025,
  needs_review='Repackage later in METRC: combine ...003002 (630) with W2-1 ...005159 (10) (Aziz 11/5)', updated_at=now()
 where id=680 and code='W2';

with n as (
 insert into pallets(code,strain,status,current_weight,og_weight,package_tag,tag_pending,parent_id,slot_id,kind,product,crop_year,origin_site,item_id,pushed,needs_review)
 values ('W2-1','Its It','in_freezer',10,10,'1A4060300030F35000005159',false,680,813,'package','fresh_frozen',2025,'OHR',256,true,
  'Repackage later in METRC: combine ...005159 (10) with W2 ...003002 (630) (Aziz 11/5)')
 returning id)
insert into events(user_email,type,pallet_id,to_slot_id,lbs,note,details)
 select current_email(),'tag_audit',id,813,10,'Leland 11/5: 10 lb Its It bin at 7B is METRC 1A4060300030F35000005159 (made from ...003002). App only.',
  jsonb_build_object('from',null,'to','1A4060300030F35000005159','metrc',false,'added',true) from n;

select remove_pallet(753,'mistake','W16: not at GVR (Leland 11/5). No METRC package. Aziz 11/5: archive.');
select remove_pallet(765,'mistake','W103: not at GVR (Leland 11/5). METRC ...003103 finished 9/3. Aziz 11/5: archive.');

do $$ begin
 if exists (select 1 from comp_metrc_actions where id > (select m from _mx)) then raise exception 'A METRC to-do was created; rolling back'; end if;
end $$;
commit;
