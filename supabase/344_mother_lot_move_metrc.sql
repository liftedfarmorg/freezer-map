-- 344 (Msg POT-4): moving a mother lot sends a METRC change of location (it's an immature plant batch in METRC), on Auto,
-- the same way receivers and donors move (339). Fires when a lot's location changes: Up pot > Moved to, or Location on the card.
-- Only when the METRC location really changes (GH bench to GH bench is all "Greenhouse": app only; a bed inside a hoop: app only).
-- Anyone with Nursery can do it (Aziz 11/12). Run after 343. Re-runnable.

create or replace function _metrc_nursery_mother_move() returns trigger
language plpgsql security definer set search_path = public as $$
declare lic text; a_loc text; b_loc text; rm text;
begin
  if new.room_id is null or new.room_id is not distinct from old.room_id then return new; end if;
  if new.plant_tag is null or new.status <> 'active' then return new; end if;
  lic := (select license from nursery_sites where code = new.site);
  if lic is null then return new; end if;
  select location into a_loc from metrc_location_map where app_kind = 'room' and app_ref = old.room_id::text and license = lic;
  select location into b_loc from metrc_location_map where app_kind = 'room' and app_ref = new.room_id::text and license = lic;
  if a_loc is not null and b_loc is not null and lower(a_loc) = lower(b_loc) then return new; end if;   -- same METRC location
  rm := (select name from nursery_rooms where id = new.room_id);
  insert into comp_metrc_actions (license, action, tag, summary, details, kind)
  values (lic, 'Nursery move: mother lot', new.plant_tag,
          concat_ws(' · ', new.strain, 'G' || new.gen, greatest(0, new.qty - new.lost) || ' plants',
                    coalesce((select name from nursery_rooms where id = old.room_id), '?') || ' > ' || rm),
          jsonb_build_object('type', 'nursery_move', 'what', 'batch', 'mother_id', new.id, 'lot_tag', upper(new.plant_tag),
                             'from_room_id', old.room_id, 'room_id', new.room_id, 'room', rm, 'on', coalesce(nullif(current_setting('nursery.move_on', true), '')::date, current_date), 'by', current_email()),
          'nursery_move');
  return new;
end $$;

drop trigger if exists metrc_nursery_mother_move on nursery_mothers;
create trigger metrc_nursery_mother_move after update of room_id on nursery_mothers for each row execute function _metrc_nursery_mother_move();

update metrc_push_kinds set label = 'Nursery: move immature batches / flowering plants / mother lots' where kind = 'nursery_move';
