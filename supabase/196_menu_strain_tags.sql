-- Migration 196: customer portal menu shows each strain's grade (SHO / BHO) and type (S, S/H, H, I/H, I).
-- Customers can't read the strains table, so this hands them just name, aliases, type and default grade.
-- Also adds the grade to the public open menu link and Sales > Open menu. Read only. Safe to re-run. Run after 195 (view as per tab).
set client_min_messages = warning;

create or replace function menu_strain_tags()
returns table (strain text, aliases text[], strain_type text, grade text)
language plpgsql stable security definer set search_path = public as $$
begin
  if my_customer() is null and not is_staff() then raise exception 'Not allowed'; end if;
  return query
    select s.name::text, coalesce(s.aliases, '{}')::text[], s.strain_type::text, s.default_grade::text
      from strains s;
end $$;

revoke all on function menu_strain_tags() from public, anon;
grant execute on function menu_strain_tags() to authenticated;

-- Public open menu link + Sales > Open menu: same rows as before plus the strain's default grade (SHO / BHO).
-- _menu_rows() itself is left alone (176 patched it in place); these two just add the grade on top.
drop function if exists staff_menu();
create function staff_menu()
returns table (product text, strain text, crop_year int, open_lbs numeric, price numeric, strain_type text, lineage text,
               sho numeric, bho numeric, thc numeric, photo_url text, note text, grade text)
language sql stable security definer set search_path = public as $$
  select m.*, st.default_grade::text from _menu_rows() m left join strains st on st.id = strain_id_of(m.strain) where is_staff()
$$;
revoke all on function staff_menu() from public, anon;
grant execute on function staff_menu() to authenticated;

drop function if exists public_menu(text);
create function public_menu(p_code text)
returns table (product text, strain text, crop_year int, open_lbs numeric, price numeric, strain_type text, lineage text,
               sho numeric, bho numeric, thc numeric, photo_url text, note text, grade text)
language sql stable security definer set search_path = public as $$
  select m.*, st.default_grade::text from _menu_rows() m left join strains st on st.id = strain_id_of(m.strain)
   where coalesce((select value from app_settings where key = 'menu.public_on'), 'false') = 'true'
     and length(coalesce(p_code, '')) >= 8
     and p_code = (select value from app_settings where key = 'menu.public_code')
$$;
revoke all on function public_menu(text) from public;
grant execute on function public_menu(text) to anon, authenticated;
