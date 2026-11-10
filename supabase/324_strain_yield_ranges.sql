-- 324: SHO and BHO yields as a low and a high (Aziz 11/9, Msg YLD-2).
--  * strain_info: solventless_pct / hydrocarbon_pct stay and are now the LOW. New: solventless_high_pct / hydrocarbon_high_pct.
--    Today's numbers stay as the low with the high blank, so every menu shows the same single number until a high is entered.
--  * set_strain_info takes the two new fields (Sales Admins only, like the lows) and stops if a low is above its high.
--    Patched by text; stops if the live function isn't what it expects.
--  * strain_menu_info (catalog PDF, reserves menu) and staff_menu / public_menu (Sales > Open menu + the public link) also
--    return the highs. Same rows, two more columns on the end.
--  * Matt's customer portal: no change.
-- Safe to re-run.
begin;

alter table strain_info add column if not exists solventless_high_pct numeric check (solventless_high_pct between 0 and 100);
alter table strain_info add column if not exists hydrocarbon_high_pct numeric check (hydrocarbon_high_pct between 0 and 100);

-- ---------- set_strain_info: accept the highs, low can't be above high ----------
do $$
declare d text;
  a1 text := '"solventless_pct":"sales","hydrocarbon_pct":"sales",';
  b1 text := '"solventless_pct":"sales","hydrocarbon_pct":"sales","solventless_high_pct":"sales","hydrocarbon_high_pct":"sales",';
  a2 text := E'    hydrocarbon_pct = case when p_vals ? ''hydrocarbon_pct'' then nullif(p_vals ->> ''hydrocarbon_pct'', '''')::numeric else hydrocarbon_pct end,\n';
  b2 text := a2
    || E'    solventless_high_pct = case when p_vals ? ''solventless_high_pct'' then nullif(p_vals ->> ''solventless_high_pct'', '''')::numeric else solventless_high_pct end,\n'
    || E'    hydrocarbon_high_pct = case when p_vals ? ''hydrocarbon_high_pct'' then nullif(p_vals ->> ''hydrocarbon_high_pct'', '''')::numeric else hydrocarbon_high_pct end,\n';
  a3 text := E'  insert into events (user_email, type, note, details)\n  values (current_email(), ''strain_info''';
  b3 text := E'  -- 324: a low can''t be above its high\n'
    || E'  if (after ->> ''solventless_pct'')::numeric > (after ->> ''solventless_high_pct'')::numeric then\n'
    || E'    raise exception ''Solventless yield: the low (%) is above the high (%)'', (after ->> ''solventless_pct'') || ''%'', (after ->> ''solventless_high_pct'') || ''%''; end if;\n'
    || E'  if (after ->> ''hydrocarbon_pct'')::numeric > (after ->> ''hydrocarbon_high_pct'')::numeric then\n'
    || E'    raise exception ''Hydrocarbon yield: the low (%) is above the high (%)'', (after ->> ''hydrocarbon_pct'') || ''%'', (after ->> ''hydrocarbon_high_pct'') || ''%''; end if;\n'
    || a3;
begin
  d := pg_get_functiondef('set_strain_info(int, jsonb)'::regprocedure);
  if position('solventless_high_pct' in d) > 0 then raise notice 'set_strain_info already takes the highs'; return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 then
    raise exception 'set_strain_info is not what 324 expects; nothing changed';
  end if;
  execute replace(replace(replace(d, a1, b1), a2, b2), a3, b3);
end $$;

-- ---------- strain_menu_info: + the highs (catalog PDF, reserves menu) ----------
drop function if exists strain_menu_info();
create function strain_menu_info()
returns table (name text, solventless_pct numeric, hydrocarbon_pct numeric, spot_price numeric, photo_url text, menu_note text, lineage text,
               solventless_high_pct numeric, hydrocarbon_high_pct numeric)
language sql stable security definer set search_path = public as $$
  select s.name, i.solventless_pct, i.hydrocarbon_pct, i.spot_price, i.photo_url, i.menu_note, s.lineage,
         i.solventless_high_pct, i.hydrocarbon_high_pct
    from strains s left join strain_info i on i.strain_id = s.id
   where s.active and (is_staff() or my_customer() is not null)
$$;
revoke execute on function strain_menu_info() from public, anon;
grant execute on function strain_menu_info() to authenticated;

-- ---------- Sales > Open menu + public link: same as 196 plus sho_high / bho_high ----------
drop function if exists staff_menu();
create function staff_menu()
returns table (product text, strain text, crop_year int, open_lbs numeric, price numeric, strain_type text, lineage text,
               sho numeric, bho numeric, thc numeric, photo_url text, note text, grade text, sho_high numeric, bho_high numeric)
language sql stable security definer set search_path = public as $$
  select m.*, st.default_grade::text, si.solventless_high_pct, si.hydrocarbon_high_pct
    from _menu_rows() m left join strains st on st.id = strain_id_of(m.strain) left join strain_info si on si.strain_id = st.id
   where is_staff()
$$;
revoke all on function staff_menu() from public, anon;
grant execute on function staff_menu() to authenticated;

drop function if exists public_menu(text);
create function public_menu(p_code text)
returns table (product text, strain text, crop_year int, open_lbs numeric, price numeric, strain_type text, lineage text,
               sho numeric, bho numeric, thc numeric, photo_url text, note text, grade text, sho_high numeric, bho_high numeric)
language sql stable security definer set search_path = public as $$
  select m.*, st.default_grade::text, si.solventless_high_pct, si.hydrocarbon_high_pct
    from _menu_rows() m left join strains st on st.id = strain_id_of(m.strain) left join strain_info si on si.strain_id = st.id
   where coalesce((select value from app_settings where key = 'menu.public_on'), 'false') = 'true'
     and length(coalesce(p_code, '')) >= 8
     and p_code = (select value from app_settings where key = 'menu.public_code')
$$;
revoke all on function public_menu(text) from public;
grant execute on function public_menu(text) to anon, authenticated;

commit;
