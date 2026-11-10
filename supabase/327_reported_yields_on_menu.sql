-- 327: customer-reported yields feed the menu and the strain card (Aziz 11/9, Msg YLD-14/15).
--  * _reported_yields(): per strain (all crop years together), from SENT yield reports only (326). SHO = hash % of fresh frozen
--    (non-BHO runs), BHO = BHO % of fresh frozen, per run, same math as Sales > Reported Yields. Lowest, highest, lbs-weighted
--    average, runs, customers, lbs, and "ready" = 2+ customers and 100+ lbs behind it (same rule as that screen).
--  * _menu_yields(): what every menu shows per strain. Setting menu.yield_source:
--      'higher' (default): our strain profile low-high; once the reported number is ready, each end is the higher of ours vs
--                          reported (low vs lowest, high vs highest).
--      'reported':         the customers' lowest-highest only (blank where nobody has reported).
--  * staff_menu / public_menu (Open menu + public link): yields are the menu yields; plus the reported lowest / highest / runs
--    for the strain card (shown before "ready" too).
--  * strain_menu_info (catalog PDF, reserves menu, Reported Yields "Menu shows"): same columns, now the menu yields.
--  * menu_yield_settings() / set_menu_yield_source(): Sales Admins (and Owners) switch the source.
--  * The strain profile (Settings > Strains) keeps OUR numbers; nothing here writes to it.
-- Safe to re-run.
begin;

create or replace function _reported_yields()
returns table (strain_id int, sho_lo numeric, sho_hi numeric, sho_avg numeric, sho_runs int, sho_ready boolean,
               bho_lo numeric, bho_hi numeric, bho_avg numeric, bho_runs int, bho_ready boolean)
language sql stable security definer set search_path = public as $$
  with parts as (
    select y.customer_id cid, strain_id_of(l ->> 's') sid,
           coalesce(case when jsonb_typeof(p -> 'bho') = 'boolean' then (p ->> 'bho')::boolean end, false) bho,
           case when jsonb_typeof(p -> 'ff') = 'number' then (p ->> 'ff')::numeric end ff,
           case when jsonb_typeof(p -> 'outV') = 'number' then (p ->> 'outV')::numeric end v,
           p ->> 'outU' u
      from yield_reports y
      cross join lateral jsonb_array_elements(case when jsonb_typeof(y.lines) = 'array' then y.lines else '[]' end) l
      cross join lateral jsonb_array_elements(case when jsonb_typeof(l -> 'parts') = 'array' then l -> 'parts' else '[]' end) p
     where y.sent_at is not null
  ), runs as (
    select cid, sid, bho, ff,
           case when u in ('%', '%ff') then v when u = 'g' then 100 * v / (ff * 453.592) when u = 'kg' then 100 * v * 1000 / (ff * 453.592)
                when u = 'lb' then 100 * v / ff end pct
      from parts where sid is not null and ff > 0 and v is not null and v >= 0
  ), r as (select * from runs where pct is not null and pct <= 100)
  select sid,
         round(min(pct) filter (where not bho), 1), round(max(pct) filter (where not bho), 1),
         round(sum(pct * ff) filter (where not bho) / nullif(sum(ff) filter (where not bho), 0), 1),
         (count(*) filter (where not bho))::int,
         count(distinct cid) filter (where not bho) >= 2 and coalesce(sum(ff) filter (where not bho), 0) >= 100,
         round(min(pct) filter (where bho), 1), round(max(pct) filter (where bho), 1),
         round(sum(pct * ff) filter (where bho) / nullif(sum(ff) filter (where bho), 0), 1),
         (count(*) filter (where bho))::int,
         count(distinct cid) filter (where bho) >= 2 and coalesce(sum(ff) filter (where bho), 0) >= 100
    from r group by sid
$$;

create or replace function _menu_yields()
returns table (strain_id int, sho numeric, sho_high numeric, bho numeric, bho_high numeric,
               rep_sho_lo numeric, rep_sho_hi numeric, rep_sho_runs int, rep_bho_lo numeric, rep_bho_hi numeric, rep_bho_runs int)
language sql stable security definer set search_path = public as $$
  with src as (select coalesce((select value from app_settings where key = 'menu.yield_source'), 'higher') v),
  o as (   -- ours, one number filling both ends when only one is set
    select i.strain_id, coalesce(i.solventless_pct, i.solventless_high_pct) sl, coalesce(i.solventless_high_pct, i.solventless_pct) sh,
           coalesce(i.hydrocarbon_pct, i.hydrocarbon_high_pct) bl, coalesce(i.hydrocarbon_high_pct, i.hydrocarbon_pct) bh
      from strain_info i
  )
  select s.id,
         case when src.v = 'reported' then r.sho_lo when r.sho_ready then greatest(o.sl, r.sho_lo) else o.sl end,
         case when src.v = 'reported' then r.sho_hi when r.sho_ready then greatest(o.sh, r.sho_hi) else o.sh end,
         case when src.v = 'reported' then r.bho_lo when r.bho_ready then greatest(o.bl, r.bho_lo) else o.bl end,
         case when src.v = 'reported' then r.bho_hi when r.bho_ready then greatest(o.bh, r.bho_hi) else o.bh end,
         r.sho_lo, r.sho_hi, coalesce(r.sho_runs, 0), r.bho_lo, r.bho_hi, coalesce(r.bho_runs, 0)
    from strains s cross join src
    left join o on o.strain_id = s.id
    left join _reported_yields() r on r.strain_id = s.id
$$;
revoke all on function _reported_yields() from public, anon, authenticated;
revoke all on function _menu_yields() from public, anon, authenticated;

-- ---------- Open menu + public link ----------
drop function if exists staff_menu();
create function staff_menu()
returns table (product text, strain text, crop_year int, open_lbs numeric, price numeric, strain_type text, lineage text,
               sho numeric, bho numeric, thc numeric, photo_url text, note text, grade text, sho_high numeric, bho_high numeric,
               rep_sho_lo numeric, rep_sho_hi numeric, rep_sho_runs int, rep_bho_lo numeric, rep_bho_hi numeric, rep_bho_runs int)
language sql stable security definer set search_path = public as $$
  select m.product, m.strain, m.crop_year, m.open_lbs, m.price, m.strain_type, m.lineage, y.sho, y.bho, m.thc, m.photo_url, m.note,
         st.default_grade::text, y.sho_high, y.bho_high, y.rep_sho_lo, y.rep_sho_hi, y.rep_sho_runs, y.rep_bho_lo, y.rep_bho_hi, y.rep_bho_runs
    from _menu_rows() m left join strains st on st.id = strain_id_of(m.strain) left join _menu_yields() y on y.strain_id = st.id
   where is_staff()
$$;
revoke all on function staff_menu() from public, anon;
grant execute on function staff_menu() to authenticated;

drop function if exists public_menu(text);
create function public_menu(p_code text)
returns table (product text, strain text, crop_year int, open_lbs numeric, price numeric, strain_type text, lineage text,
               sho numeric, bho numeric, thc numeric, photo_url text, note text, grade text, sho_high numeric, bho_high numeric,
               rep_sho_lo numeric, rep_sho_hi numeric, rep_sho_runs int, rep_bho_lo numeric, rep_bho_hi numeric, rep_bho_runs int)
language sql stable security definer set search_path = public as $$
  select m.product, m.strain, m.crop_year, m.open_lbs, m.price, m.strain_type, m.lineage, y.sho, y.bho, m.thc, m.photo_url, m.note,
         st.default_grade::text, y.sho_high, y.bho_high, y.rep_sho_lo, y.rep_sho_hi, y.rep_sho_runs, y.rep_bho_lo, y.rep_bho_hi, y.rep_bho_runs
    from _menu_rows() m left join strains st on st.id = strain_id_of(m.strain) left join _menu_yields() y on y.strain_id = st.id
   where coalesce((select value from app_settings where key = 'menu.public_on'), 'false') = 'true'
     and length(coalesce(p_code, '')) >= 8
     and p_code = (select value from app_settings where key = 'menu.public_code')
$$;
revoke all on function public_menu(text) from public;
grant execute on function public_menu(text) to anon, authenticated;

-- ---------- catalog PDF, reserves menu, Reported Yields "Menu shows": same columns as 325, now the menu yields ----------
create or replace function strain_menu_info()
returns table (name text, solventless_pct numeric, hydrocarbon_pct numeric, spot_price numeric, photo_url text, menu_note text, lineage text,
               solventless_high_pct numeric, hydrocarbon_high_pct numeric)
language sql stable security definer set search_path = public as $$
  select s.name, y.sho, y.bho, i.spot_price, i.photo_url, i.menu_note, s.lineage, y.sho_high, y.bho_high
    from strains s left join strain_info i on i.strain_id = s.id left join _menu_yields() y on y.strain_id = s.id
   where s.active and (is_staff() or my_customer() is not null)
$$;
revoke execute on function strain_menu_info() from public, anon;
grant execute on function strain_menu_info() to authenticated;

-- ---------- the switch ----------
create or replace function menu_yield_settings() returns text
language sql stable security definer set search_path = public as $$
  select case when is_staff() then coalesce((select value from app_settings where key = 'menu.yield_source'), 'higher') end
$$;
create or replace function set_menu_yield_source(p_source text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform no_view_as();
  if not (is_sales_admin() or is_owner()) then raise exception 'Only a Sales Admin can change where menu yields come from'; end if;
  if p_source not in ('higher', 'reported') then raise exception 'Menu yields come from "higher" or "reported"'; end if;
  insert into app_settings values ('menu.yield_source', p_source) on conflict (key) do update set value = excluded.value;
  insert into events (user_email, type, note, details)
  values (current_email(), 'menu_yield_source', p_source, jsonb_build_object('source', p_source));
  return p_source;
end $$;
revoke all on function menu_yield_settings() from public, anon;
revoke all on function set_menu_yield_source(text) from public, anon;
grant execute on function menu_yield_settings() to authenticated;
grant execute on function set_menu_yield_source(text) to authenticated;

commit;
