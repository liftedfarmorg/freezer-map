-- Numbered 176 because another chat's 175_repackage_multi.sql went in first (same night). Inside it still says 175.
-- RUN LIVE 11/3 by Claude in the SQL Editor (Aziz OK). Dry run first, then the real run; checks after: 4 patches in, 131 of 131 menu rows priced.
-- 175: pricing (Aziz 11/3). Build step 2 of 3 (item cards, pricing, open menu).
-- How a line gets its price (portal orders, order changes, Sales orders, Sales adding a line, invoices made at shipping):
--   1. the customer's contract price for that product: fresh frozen = their contract price (customer_terms / customer), any other
--      product = their contract price for that product (one price per product across all strains, Aziz 11/3)
--   2. the item card price for that strain + product + crop year (SHO / BHO on fresh frozen; shared by both farms' cards)
--   3. the market price for that product + crop year (e.g. 2026 Fresh Frozen), outside customers only, as in 164
--   4. none = Call/Email for Price (Sales prices it on the order)
-- Special prices are still changed on the sales order line. Lines already on orders keep their prices.
-- The open menu and the public link show 2 then 3. The customer portal (Matt's) shows each line's price (my_line_prices).
-- Live functions are patched by text (like 164); each patch stops the whole file if the function isn't what it expects.
-- Safe to re-run.
begin;

-- ---------- market price per product ----------
alter table market_prices add column if not exists finish text not null default 'FF' references finishes(code);
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'market_prices_pkey' and array_length(conkey, 1) = 1) then
    alter table market_prices drop constraint market_prices_pkey;
    alter table market_prices add primary key (crop_year, finish);
  end if;
end $$;

create or replace function market_price(p_year int, p_finish text) returns numeric
language sql stable security definer set search_path = public as $$
  select price_per_lb from market_prices where crop_year = p_year and finish = coalesce(p_finish, 'FF')
$$;
revoke execute on function market_price(int, text) from public, anon, authenticated;
create or replace function market_price(p_year int) returns numeric
language sql stable security definer set search_path = public as $$ select market_price(p_year, 'FF') $$;
revoke execute on function market_price(int) from public, anon, authenticated;

drop function if exists set_market_price(int, numeric);
create or replace function set_market_price(p_year int, p_price numeric, p_finish text default 'FF') returns void
language plpgsql security definer set search_path = public as $$
declare was numeric; f text := coalesce(p_finish, 'FF');
begin
  perform no_view_as();
  if not (is_sales_admin() or is_owner()) then raise exception 'Only a Sales Admin can set the market price'; end if;
  if p_year is null or p_year not between 2000 and 2100 then raise exception 'Pick a crop year'; end if;
  if not exists (select 1 from finishes where code = f) then raise exception 'Unknown product %', f; end if;
  if p_price is not null and p_price < 0 then raise exception 'The price can''t be negative'; end if;
  select price_per_lb into was from market_prices where crop_year = p_year and finish = f;
  if p_price is null then delete from market_prices where crop_year = p_year and finish = f;
  else
    insert into market_prices (crop_year, finish, price_per_lb) values (p_year, f, round(p_price, 2))
    on conflict (crop_year, finish) do update set price_per_lb = excluded.price_per_lb, updated_by = current_email(), updated_at = now();
  end if;
  insert into events (user_email, type, note, details)
  values (current_email(), 'market_price', p_year || ' ' || (select name from finishes where code = f),
          jsonb_build_object('crop_year', p_year, 'finish', f, 'price', p_price, 'was', was));
end $$;
revoke execute on function set_market_price(int, numeric, text) from public, anon;
grant execute on function set_market_price(int, numeric, text) to authenticated;

-- ---------- item card price ----------
alter table items add column if not exists price_per_lb numeric(10,2) check (price_per_lb >= 0);
alter table items add column if not exists price_bho numeric(10,2) check (price_bho >= 0);   -- fresh frozen BHO (blank = same as SHO)

-- sets the price on this card and the other farm's card of the same strain + product + crop year (one price on the menu)
create or replace function set_item_price(p_item bigint, p_price numeric, p_bho numeric default null) returns int
language plpgsql security definer set search_path = public as $$
declare it items; n int;
begin
  perform no_view_as();
  if not (is_sales_admin() or is_owner()) then raise exception 'Only a Sales Admin can change prices'; end if;
  if coalesce(p_price, 0) < 0 or coalesce(p_bho, 0) < 0 then raise exception 'Prices can''t be negative'; end if;
  select * into it from items where id = p_item;
  if it.id is null then raise exception 'Item not found'; end if;
  update items set price_per_lb = round(p_price, 2), price_bho = case when finish = 'FF' then round(p_bho, 2) end, updated_at = now()
   where strain_id = it.strain_id and finish = it.finish and crop_year = it.crop_year;
  get diagnostics n = row_count;
  insert into events (user_email, type, note, details)
  values (current_email(), 'item_price', it.sku, jsonb_build_object('item', it.id, 'price', p_price, 'bho', p_bho, 'cards', n));
  return n;
end $$;
revoke all on function set_item_price(bigint, numeric, numeric) from public, anon;
grant execute on function set_item_price(bigint, numeric, numeric) to authenticated;

create or replace function item_price(p_strain text, p_year int, p_finish text, p_grade text default null) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(case when p_grade = 'BHO' then i.price_bho end, i.price_per_lb)
    from items i where i.strain_id = strain_id_of(p_strain) and i.finish = coalesce(p_finish, 'FF') and i.crop_year = p_year and i.price_per_lb is not null
   order by i.updated_at desc limit 1
$$;
revoke execute on function item_price(text, int, text, text) from public, anon, authenticated;

-- ---------- contract price per product (not fresh frozen; that one stays on the customer's terms) ----------
create table if not exists customer_product_prices (
  customer_id  int not null references customers(id) on delete cascade,
  crop_year    int not null,
  finish       text not null references finishes(code),
  price_per_lb numeric(10,2) not null check (price_per_lb >= 0),
  updated_by   text default current_email(),
  updated_at   timestamptz not null default now(),
  primary key (customer_id, crop_year, finish));
alter table customer_product_prices enable row level security;
drop policy if exists read_cpp on customer_product_prices;
create policy read_cpp on customer_product_prices for select to authenticated using (is_sales() or has_module('accounting'));
grant select on customer_product_prices to authenticated;
grant all on customer_product_prices to service_role;

create or replace function set_customer_product_price(p_customer int, p_year int, p_finish text, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform no_view_as();
  if not (is_sales_admin() or is_owner()) then raise exception 'Only a Sales Admin can change contract prices'; end if;
  if p_finish = 'FF' then raise exception 'The fresh frozen contract price is on the customer''s terms'; end if;
  if p_price is null then delete from customer_product_prices where customer_id = p_customer and crop_year = p_year and finish = p_finish;
  else insert into customer_product_prices (customer_id, crop_year, finish, price_per_lb) values (p_customer, p_year, p_finish, round(p_price, 2))
       on conflict (customer_id, crop_year, finish) do update set price_per_lb = excluded.price_per_lb, updated_by = current_email(), updated_at = now();
  end if;
  insert into events (user_email, type, note, details)
  values (current_email(), 'contract_product_price', (select name from customers where id = p_customer),
          jsonb_build_object('customer', p_customer, 'year', p_year, 'finish', p_finish, 'price', p_price));
end $$;
revoke all on function set_customer_product_price(int, int, text, numeric) from public, anon;
grant execute on function set_customer_product_price(int, int, text, numeric) to authenticated;

-- the customer's own contract price, no market fallback: fresh frozen from their terms (carried over), others from the table above
create or replace function contract_price(p_customer int, p_year int, p_finish text) returns numeric
language sql stable security definer set search_path = public as $$
  select case when coalesce(p_finish, 'FF') = 'FF' then
      coalesce((select t.price_per_lb from customer_terms t where t.customer_id = p_customer and t.crop_year <= p_year order by t.crop_year desc limit 1),
               case when not exists (select 1 from customer_terms t where t.customer_id = p_customer and t.crop_year <= p_year)
                    then (select c.price_per_lb from customers c where c.id = p_customer) end)
    else (select x.price_per_lb from customer_product_prices x where x.customer_id = p_customer and x.finish = p_finish and x.crop_year <= p_year
           order by x.crop_year desc limit 1) end
$$;
revoke execute on function contract_price(int, int, text) from public, anon, authenticated;

-- ---------- the price for a line ----------
create or replace function line_price(p_customer int, p_year int, p_strain text, p_product text default 'fresh_frozen', p_grade text default null) returns numeric
language sql stable security definer set search_path = public as $$
  with f as (select coalesce((select code from finishes where pallet_product = coalesce(p_product, 'fresh_frozen')), 'FF') c)
  select coalesce(
    contract_price(p_customer, p_year, (select c from f)),
    item_price(p_strain, p_year, (select c from f), p_grade),
    case when (select kind from customers where id = p_customer) = 'external' then market_price(p_year, (select c from f)) end)
$$;
revoke execute on function line_price(int, int, text, text, text) from public, anon, authenticated;

-- the menu's price (no customer): item card, else market
create or replace function menu_price(p_strain text, p_year int, p_finish text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(item_price(p_strain, p_year, p_finish), market_price(p_year, p_finish))
$$;
revoke execute on function menu_price(text, int, text) from public, anon, authenticated;

-- the customer portal: this customer's price for each fresh frozen strain + crop year on their menu
create or replace function my_line_prices() returns table (strain text, crop_year int, price numeric)
language sql stable security definer set search_path = public as $$
  select m.strain, m.crop_year, line_price(my_customer(), m.crop_year, m.strain, 'fresh_frozen', null)
    from _menu_numbers() m where my_customer() is not null
$$;
revoke all on function my_line_prices() from public, anon;
grant execute on function my_line_prices() to authenticated;

-- ---------- patch the live functions that price lines ----------
do $$
declare d text; fn regprocedure;
  pats text[][] := array[
    -- function, what it has now, what it gets
    array['place_order(jsonb,text,text,date,boolean)', 'select t.price_per_lb into price from terms_for(me, l.yr) t;', 'price := line_price(me, l.yr, s, ''fresh_frozen'', null);'],
    array['update_my_order(integer,jsonb,text,text,date)', 'select t.price_per_lb into price from terms_for(me, l.yr) t;', 'price := line_price(me, l.yr, s, ''fresh_frozen'', null);'],
    array['create_order(integer,jsonb,text,date,text,text,boolean)', 'if pr is null and prod = ''fresh_frozen'' then select t.price_per_lb into pr from terms_for(p_customer, yr) t; end if;', 'if pr is null then pr := line_price(p_customer, yr, s, prod, null); end if;'],
    array['set_order_line(integer,integer,text,numeric,numeric)', '(select t.price_per_lb from terms_for(o.customer_id, crop_year()) t)', 'line_price(o.customer_id, crop_year(), s, ''fresh_frozen'', null)'],
    array['_make_invoice(integer)', 'case when ln.product = ''fresh_frozen'' then (select t.price_per_lb from terms_for(o.customer_id, ln.crop_year) t) end', 'line_price(o.customer_id, ln.crop_year, ln.strain, ln.product, ln.grade)']];
  i int;
begin
  for i in 1 .. array_length(pats, 1) loop
    fn := pats[i][1]::regprocedure;
    d := pg_get_functiondef(fn);
    if position(pats[i][3] in d) > 0 then continue; end if;          -- already done
    if position(pats[i][2] in d) = 0 then raise exception '% is not what 175 expects; nothing changed', pats[i][1]; end if;
    execute replace(d, pats[i][2], pats[i][3]);
  end loop;
end $$;

-- ---------- the open menu (174): item card price, else market price for that product ----------
do $$
declare d text := pg_get_functiondef('_menu_rows()'::regprocedure);
begin
  if position('menu_price(' in d) = 0 then
    if position('case when r.p = ''FF'' then market_price(r.y) end' in d) = 0 then raise exception '_menu_rows is not what 175 expects'; end if;
    execute replace(d, 'case when r.p = ''FF'' then market_price(r.y) end', 'menu_price(r.s, r.y, r.p)');
  end if;
end $$;

-- ---------- item cards (171) also return the price ----------
drop function if exists item_cards();
create or replace function item_cards()
returns table (id bigint, sku text, strain_id int, strain text, strain_type text, finish text, product text, crop_year int, season text, site text,
               license text, metrc_name text, on_menu boolean, active boolean, metrc_status text,
               licenses jsonb, home_in_metrc boolean, packages int, lbs numeric, pkgs_other_item int, created_at timestamptz,
               price_per_lb numeric, price_bho numeric, market numeric)
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
         i.created_at, i.price_per_lb, i.price_bho, market_price(i.crop_year, i.finish)
    from items i join strains s on s.id = i.strain_id left join finishes f on f.code = i.finish
    left join lic on lic.item_id = i.id
   where is_staff()
   order by s.name, i.crop_year desc, f.sort, i.site
$$;
revoke all on function item_cards() from public, anon;
grant execute on function item_cards() to authenticated;

commit;
