-- RUN LIVE 11/3 by Claude in the SQL Editor.
-- 171: item cards (Aziz 11/3). Build order: item cards, then pricing, then the new open menu.
--  * An item card = one app item = one METRC item name (crop year + farm + cert + product + strain). The same card applies on
--    every license where METRC has an item with that exact name (METRC makes one on a license when a package is received
--    there). The card's licenses come straight from METRC's item lists (metrc_items, pulled nightly), so a receipt in METRC
--    shows up on the card after the next pull. The app is the source: new cards are made in the app and sent to METRC (170).
--  * On the menu: per card. Fresh Frozen, Standards and Smalls start on; everything else (trim, biomass, wet, unbucked...) off.
--    New cards follow the same rule.
--  * Flags (no auto fixes, Aziz 11/3): not in METRC on its home license yet; live packages that METRC has on a different item.
--  * Strain type picker: Indica, Indica Hybrid, Hybrid, Sativa Hybrid, Sativa. Sets the strain's METRC indica / sativa %
--    (100/0, 75/25, 50/50, 25/75, 0/100) in the app. Strains already in METRC aren't changed there yet (flagged on the card).
--  * Any module Admin can change cards; staff can view.
-- Safe to re-run.
begin;

-- ---------- on the menu ----------
alter table items add column if not exists on_menu boolean;
update items set on_menu = finish in ('FF', 'ST', 'SM') where on_menu is null;
alter table items alter column on_menu set default false;
create or replace function _item_menu_default() returns trigger language plpgsql as $$
begin
  if new.on_menu is null then new.on_menu := new.finish in ('FF', 'ST', 'SM'); end if;
  return new;
end $$;
drop trigger if exists item_menu_default on items;
create trigger item_menu_default before insert on items for each row execute function _item_menu_default();

-- ---------- strain type ----------
alter table strains add column if not exists strain_type text check (strain_type in ('Indica', 'Indica Hybrid', 'Hybrid', 'Sativa Hybrid', 'Sativa'));

create or replace function set_strain_type(p_strain int, p_type text) returns void
language plpgsql security definer set search_path = public as $$
declare ind numeric;
begin
  perform no_view_as();
  if not (is_any_admin() or is_owner()) then raise exception 'Only an Admin can change the strain type'; end if;
  ind := case p_type when 'Indica' then 100 when 'Indica Hybrid' then 75 when 'Hybrid' then 50 when 'Sativa Hybrid' then 25 when 'Sativa' then 0 end;
  if p_type is not null and ind is null then raise exception 'Pick Indica, Indica Hybrid, Hybrid, Sativa Hybrid or Sativa'; end if;
  update strains set strain_type = p_type,
         metrc_indica = coalesce(ind, metrc_indica), metrc_sativa = coalesce(100 - ind, metrc_sativa), updated_at = now()
   where id = p_strain;
  insert into events (user_email, type, note, details)
  values (current_email(), 'strain_type', (select name from strains where id = p_strain), jsonb_build_object('type', p_type, 'indica', ind));
end $$;
revoke all on function set_strain_type(int, text) from public, anon;
grant execute on function set_strain_type(int, text) to authenticated;

-- ---------- the list ----------
drop function if exists item_cards();
create or replace function item_cards()
returns table (id bigint, sku text, strain_id int, strain text, strain_type text, finish text, product text, crop_year int, season text, site text,
               license text, metrc_name text, on_menu boolean, active boolean, metrc_status text,
               licenses jsonb, home_in_metrc boolean, packages int, lbs numeric, pkgs_other_item int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  with live as (
    select p.id, p.item_id, p.package_tag, coalesce(p.current_weight, 0) lbs
      from pallets p where p.item_id is not null and p.status in ('in_freezer', 'unslotted', 'in_transit', 'at_processor')
  ), lic as (
    select i.id item_id, jsonb_agg(jsonb_build_object('license', x.license, 'site', l.site, 'kind', l.kind, 'metrc_id', x.id) order by l.kind, x.license) licenses,
           bool_or(x.license = i.license) home
      from items i join metrc_items x on lower(x.name) = lower(i.metrc_name) and not x.archived
      left join licenses l on l.license_no = x.license
     group by i.id
  )
  select i.id, i.sku, i.strain_id, s.name, s.strain_type, i.finish, f.name, i.crop_year, i.season, i.site, i.license, i.metrc_name,
         coalesce(i.on_menu, false), i.active, i.metrc_status,
         coalesce(lic.licenses, '[]'::jsonb), coalesce(lic.home, false),
         (select count(*)::int from live where live.item_id = i.id),
         (select coalesce(sum(live.lbs), 0) from live where live.item_id = i.id),
         (select count(*)::int from live join metrc_packages mp on mp.label = upper(live.package_tag) and mp.state in ('active', 'intransit')
           where live.item_id = i.id and mp.item is not null and lower(mp.item) <> lower(i.metrc_name)),
         i.created_at
    from items i join strains s on s.id = i.strain_id left join finishes f on f.code = i.finish
    left join lic on lic.item_id = i.id
   where is_staff()
   order by s.name, i.crop_year desc, f.sort, i.site
$$;
revoke all on function item_cards() from public, anon;
grant execute on function item_cards() to authenticated;

-- the live packages on a card, with what METRC has each on
create or replace function item_card_packages(p_item bigint)
returns table (pallet_id bigint, code text, tag text, status text, lbs numeric, metrc_license text, metrc_item text)
language sql stable security definer set search_path = public as $$
  select p.id, p.code, p.package_tag, p.status, p.current_weight, mp.license, mp.item
    from pallets p left join metrc_packages mp on mp.label = upper(p.package_tag) and mp.state in ('active', 'intransit')
   where p.item_id = p_item and p.status in ('in_freezer', 'unslotted', 'in_transit', 'at_processor') and is_staff()
   order by p.code
$$;
revoke all on function item_card_packages(bigint) from public, anon;
grant execute on function item_card_packages(bigint) to authenticated;

-- ---------- change a card ----------
create or replace function set_item_card(p_item bigint, p_on_menu boolean default null, p_active boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform no_view_as();
  if not (is_any_admin() or is_owner()) then raise exception 'Only an Admin can change item cards'; end if;
  update items set on_menu = coalesce(p_on_menu, on_menu), active = coalesce(p_active, active), updated_at = now() where id = p_item;
  insert into events (user_email, type, note, details)
  values (current_email(), 'item_card', (select sku from items where id = p_item), jsonb_build_object('item', p_item, 'on_menu', p_on_menu, 'active', p_active));
end $$;
revoke all on function set_item_card(bigint, boolean, boolean) from public, anon;
grant execute on function set_item_card(bigint, boolean, boolean) to authenticated;

-- new card from the strain card: makes the app item and (170) sends it to METRC
create or replace function new_item_card(p_strain int, p_year int, p_site text, p_finish text) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  perform no_view_as();
  if not (is_any_admin() or is_owner()) then raise exception 'Only an Admin can make item cards'; end if;
  if exists (select 1 from items where crop_year = p_year and season = 'FL' and site = p_site and cert = 'OCAL' and finish = p_finish and strain_id = p_strain) then
    raise exception 'That item card already exists';
  end if;
  i := item_for(p_year, p_site, p_finish, p_strain);
  if i is null then raise exception 'Could not make that item (check the farm and product)'; end if;
  insert into events (user_email, type, note, details)
  values (current_email(), 'item_card_new', (select sku from items where id = i), jsonb_build_object('item', i));
  return i;
end $$;
revoke all on function new_item_card(int, int, text, text) from public, anon;
grant execute on function new_item_card(int, int, text, text) to authenticated;

commit;
