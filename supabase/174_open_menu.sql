-- RUN LIVE 11/3 by Claude in the SQL Editor.
-- 174: the new open menu (Aziz 11/3). Replaces Sales > Open menu, and the same menu at a public link with no login
-- (lifted-orders.app/menu/<code>). Matt's customer portal menu is NOT changed.
--  * Products: Fresh Frozen (open lbs = what the portal shows: free rounded down to 10) and Dry Flower = Standards + Smalls
--    (on hand minus confirmed orders, whole lbs). Hidden strains and item cards that are off the menu are left out.
--  * Price: market price for the crop year on Fresh Frozen for now; nothing = "Call/Email for Price". Item card prices come with
--    the pricing step.
--  * Strain info for the pop-up: type, lineage, SHO / BHO yield (strain Sales settings), THC % from the latest lab test, photo, note.
--  * Public link: on/off and a code (Sales > Settings > Public menu). A new code kills the old link. Only Sales Admins change it.
-- Safe to re-run.
begin;

create or replace function _menu_rows()
returns table (product text, strain text, crop_year int, open_lbs numeric, price numeric, strain_type text, lineage text,
               sho numeric, bho numeric, thc numeric, photo_url text, note text)
language sql stable security definer set search_path = public as $$
  with ff as (
    select 'FF'::text p, m.strain s, m.crop_year y, greatest(floor(m.free / 10) * 10, 0) lbs
      from _menu_numbers() m where m.on_menu and m.free >= 10
  ), dfp as (
    select case p.product when 'standards' then 'ST' else 'SM' end p, canonical_strain(p.strain) s,
           coalesce(p.crop_year, extract(year from p.harvest_date)::int, crop_year()) y, sum(coalesce(p.current_weight, 0)) lbs
      from pallets p
     where p.kind = 'package' and p.product in ('standards', 'smalls') and p.status in ('in_freezer', 'unslotted') and p.strain is not null
     group by 1, 2, 3
  ), dfo as (
    select case l.product when 'standards' then 'ST' else 'SM' end p, lower(l.strain) k, l.crop_year y, sum(l.lbs) lbs
      from orders o join order_lines l on l.order_id = o.id
     where o.status = 'pending' and l.product in ('standards', 'smalls') group by 1, 2, 3
  ), df as (
    select d.p, d.s, d.y, floor(d.lbs - coalesce(o.lbs, 0)) lbs from dfp d left join dfo o on o.p = d.p and o.k = lower(d.s) and o.y = d.y
     where d.s is not null and coalesce((select st.show_on_menu from strains st where lower(st.name) = lower(d.s) limit 1), true)
  ), rows_ as (select * from ff union all select * from df where lbs >= 1),
  thc as (   -- latest lab THC per strain
    select distinct on (z.sid) z.sid, z.total_thc from (
      select strain_id_of(h.strain) sid, t.total_thc, t.results_on, t.id
        from cult_tests t join cult_harvests h on h.id = t.harvest_id where t.total_thc is not null) z
     order by z.sid, z.results_on desc nulls last, z.id desc)
  select r.p, r.s, r.y, r.lbs,
         case when r.p = 'FF' then market_price(r.y) end,
         st.strain_type, st.lineage, si.solventless_pct, si.hydrocarbon_pct,
         thc.total_thc,
         si.photo_url, si.menu_note
    from rows_ r
    left join strains st on st.id = strain_id_of(r.s)
    left join strain_info si on si.strain_id = st.id
    left join thc on thc.sid = st.id
   -- an item card switched off the menu hides it (only when every card of that strain + product + year is off)
   where not exists (select 1 from items i where i.strain_id = st.id and i.finish = r.p and i.crop_year = r.y)
      or exists (select 1 from items i where i.strain_id = st.id and i.finish = r.p and i.crop_year = r.y and coalesce(i.on_menu, true))
   order by r.s, r.y desc, r.p
$$;
revoke all on function _menu_rows() from public, anon, authenticated;

-- Sales > Open menu (staff)
drop function if exists staff_menu();
create or replace function staff_menu()
returns table (product text, strain text, crop_year int, open_lbs numeric, price numeric, strain_type text, lineage text,
               sho numeric, bho numeric, thc numeric, photo_url text, note text)
language sql stable security definer set search_path = public as $$
  select * from _menu_rows() where is_staff()
$$;
revoke all on function staff_menu() from public, anon;
grant execute on function staff_menu() to authenticated;

-- the public link: nothing comes back unless it's switched on and the code matches
create or replace function public_menu(p_code text)
returns table (product text, strain text, crop_year int, open_lbs numeric, price numeric, strain_type text, lineage text,
               sho numeric, bho numeric, thc numeric, photo_url text, note text)
language sql stable security definer set search_path = public as $$
  select m.* from _menu_rows() m
   where coalesce((select value from app_settings where key = 'menu.public_on'), 'false') = 'true'
     and length(coalesce(p_code, '')) >= 8
     and p_code = (select value from app_settings where key = 'menu.public_code')
$$;
revoke all on function public_menu(text) from public;
grant execute on function public_menu(text) to anon, authenticated;

-- Sales > Settings > Public menu
create or replace function public_menu_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_sales() or is_owner() then jsonb_build_object(
    'on', coalesce((select value from app_settings where key = 'menu.public_on'), 'false') = 'true',
    'code', (select value from app_settings where key = 'menu.public_code')) end
$$;
revoke all on function public_menu_settings() from public, anon;
grant execute on function public_menu_settings() to authenticated;

create or replace function set_public_menu(p_on boolean, p_new_code boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  perform no_view_as();
  if not (is_sales_admin() or is_owner()) then raise exception 'Only a Sales Admin can change the public menu link'; end if;
  if p_new_code or not exists (select 1 from app_settings where key = 'menu.public_code') then
    c := substr(md5(random()::text || clock_timestamp()::text || coalesce(current_email(), '')), 1, 12);
    insert into app_settings values ('menu.public_code', c) on conflict (key) do update set value = excluded.value;
  end if;
  if p_on is not null then
    insert into app_settings values ('menu.public_on', p_on::text) on conflict (key) do update set value = excluded.value;
  end if;
  insert into events (user_email, type, note, details)
  values (current_email(), 'public_menu', case when p_new_code then 'new link' when p_on then 'switched on' else 'switched off' end,
          jsonb_build_object('on', p_on, 'new_code', p_new_code));
  return public_menu_settings();
end $$;
revoke all on function set_public_menu(boolean, boolean) from public, anon;
grant execute on function set_public_menu(boolean, boolean) to authenticated;

commit;
