-- DATA FIX 2026-11-11 (Msg C7-UNDO-1, Aziz: "we don't want to combine these anymore"). Undo combine C7 (Its It 2025, 640 lb on
-- ...7207, made 11/5 from W2 ...003002 630 lb + W2-1 ...005159 10 lb). METRC never got it: both sources still active at
-- 630 / 10 on CCL21-0000679 and ...7207 doesn't exist there. App only; nothing goes to METRC.
--  * The two packages come back as they were: W2 (...003002, 630) and W2-1 (...005159, 10), both in slot 794 (6J, where
--    Leland consolidated them), in_freezer. The old "repackage later in METRC: combine" review flags are cleared.
--  * The combined package goes back to its own code C7 and is archived. It keeps tag ...7207 so the app never hands that tag
--    out again (the label may already be on the pallet).
--  * METRC to-do #874 (Combine C7) is skipped. Event type 'unmerge' makes no METRC to-do.
-- No orders, loads or other open to-dos on any of the three (checked 11/11). Stops if anything changed. Safe to re-run.
begin;

do $$
declare c pallets; a pallets; b pallets; n int;
begin
  select * into c from pallets where id = 2153;
  select * into a from pallets where id = 680;
  select * into b from pallets where id = 2147;
  if c.status = 'archived' and a.status = 'in_freezer' then raise notice 'Already undone'; return; end if;
  if c.id is null or c.status <> 'in_freezer' or upper(c.package_tag) <> '1A4060300030F35000007207' or c.current_weight <> 640 then raise exception 'C7/W2 (2153) not as on 11/11'; end if;
  if a.status <> 'merged' or a.merged_into <> 2153 or upper(a.package_tag) <> 'ABC06030007AD3D000003002' or a.current_weight <> 630 then raise exception '...003002 (680) not as on 11/11'; end if;
  if b.status <> 'merged' or b.merged_into <> 2153 or upper(b.package_tag) <> '1A4060300030F35000005159' or b.current_weight <> 10 then raise exception '...005159 (2147) not as on 11/11'; end if;
  if exists (select 1 from order_picks where pallet_id in (680, 2147, 2153)) or exists (select 1 from load_items where pallet_id in (680, 2147, 2153)) then
    raise exception 'One of them is on an order or a load now';
  end if;

  update pallets set code = 'C7', status = 'archived', slot_id = null, current_weight = 0, updated_at = now(),
                     notes = concat_ws(' · ', notes, 'Combine undone 11/11 (Aziz): back to W2 + W2-1, never in METRC')
   where id = 2153;
  update pallets set code = 'W2', status = 'in_freezer', merged_into = null, slot_id = c.slot_id, needs_review = null, updated_at = now() where id = 680;
  update pallets set code = 'W2-1', status = 'in_freezer', merged_into = null, slot_id = c.slot_id, needs_review = null, updated_at = now() where id = 2147;

  update comp_metrc_actions set status = 'skipped', push_state = null, push_error = null, done_by = 'aziz@lifted-organics.com', done_at = now(),
         note = 'Combine undone in the app 11/11 (Aziz): W2 and W2-1 stay separate. Never reached METRC.'
   where id = 874 and kind = 'combine' and status in ('todo', 'error');
  get diagnostics n = row_count; if n <> 1 then raise exception 'To-do #874 not open'; end if;

  insert into events (user_email, type, pallet_id, lbs, note, details) values
    ('aziz@lifted-organics.com', 'unmerge', 2153, 640, 'Combine C7 undone (Aziz 11/11)', jsonb_build_object('back', jsonb_build_array('W2', 'W2-1'), 'todo', 874)),
    ('aziz@lifted-organics.com', 'unmerge', 680, 630, 'Back out of C7 (Aziz 11/11)', jsonb_build_object('from', 'C7', 'from_id', 2153)),
    ('aziz@lifted-organics.com', 'unmerge', 2147, 10, 'Back out of C7 (Aziz 11/11)', jsonb_build_object('from', 'C7', 'from_id', 2153));
end $$;

select id, code, status, right(package_tag, 7) tag, current_weight, slot_id, merged_into from pallets where id in (680, 2147, 2153) order by id;
select id, status, note from comp_metrc_actions where id = 874;

commit;
