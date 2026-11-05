-- 184: pallets not in a slot and never "received" had no site (Msg SPLIT-6, 11/4). App only, nothing to METRC.
-- Rama got "T036-1 isn't in a freezer or received at a site" building the Bear Labs mixed pallet, and Fulfillment showed "4 at ?":
-- 30 OHR pallets (T027-T047 trials, the 7 split bags from SQL 130, and the 4 split pieces) were unslotted with received_site empty.
--  * Those 30 get received_site = the farm they came from. The existing staging trigger then put them in OHR Staging (30 "staged" events,
--    no METRC to-dos). They show in OHR Staging on the freezer map; move them to real slots as usual.
--  * New trigger: a pallet that ends up unslotted with no site takes its parent's site (split pieces) or the farm it came from.
--  * pallet_site() falls back the same way.
-- Run live by Claude 11/4.
begin;
create or replace function pallet_site(p pallets) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select f.site from slots s join freezers f on f.id = s.freezer_id where s.id = coalesce(p.slot_id, (select c.slot_id from pallets c where c.id = p.container_id))),
                  p.received_site,
                  case when p.status = 'unslotted' and p.container_id is null then nullif(split_part(coalesce(p.origin_site, ''), '+', 1), '') end)
$$;

create or replace function _pallet_unslotted_site() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'unslotted' and new.slot_id is null and new.container_id is null and new.received_site is null then
    new.received_site := coalesce(
      (select pallet_site(pp) from pallets pp where pp.id = new.parent_id),
      nullif(split_part(coalesce(new.origin_site, ''), '+', 1), ''));
  end if;
  return new;
end $$;
drop trigger if exists zz_pallet_unslotted_site on pallets;
create trigger zz_pallet_unslotted_site before insert or update of status, slot_id, container_id, received_site on pallets
  for each row execute function _pallet_unslotted_site();

update pallets p set received_site = nullif(split_part(coalesce(p.origin_site, ''), '+', 1), '')
 where p.status = 'unslotted' and p.slot_id is null and p.container_id is null and p.received_site is null and p.origin_site is not null;
commit;
