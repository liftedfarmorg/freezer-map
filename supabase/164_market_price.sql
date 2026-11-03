-- 164: Market price per crop year (Matt, 11/2). Outside customers with no contract price pay the market price for that crop year;
-- contract customers pay their contract price for everything (reserve and open menu), as before.
--  * market_prices: one $/lb per crop year, set in Sales > Settings > Market price (Sales Admins). Only staff can read it.
--  * terms_for: a customer's price for a crop year = their contract price (their terms for that year, carried over from an earlier
--    year, or the customer's own price), else that year's market price. Outside customers only: our own farms are not priced.
--    Everything that prices fresh frozen goes through it: portal orders and order changes, Sales orders, invoices made at shipping
--    (a line without a price), the portal's prices and dashboard.
--  * my_terms (old portal menu) and set_order_line (Sales adding a line to an order) used the customer's own price directly:
--    now the same price as everywhere else. set_order_line is patched by text (013 / 039 changed it live).
--  * Lines already on orders keep the price they have. A crop year with no market price set prices like before (no price).
-- Safe to re-run. RUN LIVE 11/2/2026 (Matt, via Claude) after a rolled-back test on live data: a no-contract customer's portal order
-- took the market price, Bear Labs kept its $40 contract price, our own farms stayed unpriced. No market price set yet.
begin;

create table if not exists market_prices (
  crop_year    int primary key check (crop_year between 2000 and 2100),
  price_per_lb numeric(10,2) not null check (price_per_lb >= 0),
  updated_by   text default current_email(),
  updated_at   timestamptz not null default now()
);
alter table market_prices enable row level security;
drop policy if exists read_market_prices on market_prices;
create policy read_market_prices on market_prices for select to authenticated using (is_sales() or has_module('accounting'));
revoke all on market_prices from anon;
grant select on market_prices to authenticated;
grant all on market_prices to service_role;

-- only for the server's own functions (customers never read the market price directly)
create or replace function market_price(p_year int) returns numeric
language sql stable security definer set search_path = public as $$
  select price_per_lb from market_prices where crop_year = p_year
$$;
revoke execute on function market_price(int) from public, anon, authenticated;

create or replace function set_market_price(p_year int, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare was numeric;
begin
  perform no_view_as();
  if not (is_sales_admin() or is_owner()) then raise exception 'Only a Sales Admin can set the market price'; end if;
  if p_year is null or p_year not between 2000 and 2100 then raise exception 'Pick a crop year'; end if;
  if p_price is not null and p_price < 0 then raise exception 'The price can''t be negative'; end if;
  select price_per_lb into was from market_prices where crop_year = p_year;
  if p_price is null then delete from market_prices where crop_year = p_year;
  else
    insert into market_prices (crop_year, price_per_lb) values (p_year, round(p_price, 2))
    on conflict (crop_year) do update set price_per_lb = excluded.price_per_lb, updated_by = current_email(), updated_at = now();
  end if;
  insert into events (user_email, type, note, details)
  values (current_email(), 'market_price', p_year || ' crop', jsonb_build_object('crop_year', p_year, 'price', p_price, 'was', was));
end $$;
revoke execute on function set_market_price(int, numeric) from public, anon;
grant execute on function set_market_price(int, numeric) to authenticated;

-- a customer's terms for a crop year (020); no contract price = the market price (outside customers)
create or replace function terms_for(p_customer int, p_year int)
returns table (price_per_lb numeric, contract_lbs numeric, monthly_min_lbs numeric, deposit_usd numeric, storage_fee numeric, from_year int)
language sql stable security definer set search_path = public as $$
  select coalesce(x.price_per_lb, case when (select kind from customers where id = p_customer) = 'external' then market_price(p_year) end),
         x.contract_lbs, x.monthly_min_lbs, x.deposit_usd, x.storage_fee, x.from_year
    from (
      (select t.price_per_lb, t.contract_lbs, t.monthly_min_lbs, t.deposit_usd, t.storage_fee, t.crop_year as from_year
         from customer_terms t where t.customer_id = p_customer and t.crop_year <= p_year
        order by t.crop_year desc limit 1)
      union all
      select c.price_per_lb, c.contract_lbs, c.monthly_min_lbs, c.deposit_usd, c.storage_fee, null::int
        from customers c where c.id = p_customer
         and not exists (select 1 from customer_terms t where t.customer_id = p_customer and t.crop_year <= p_year)) x
$$;

-- the old portal menu's price (014): same price as everywhere else
create or replace function my_terms() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'price_per_lb', coalesce(price_per_lb, case when kind = 'external' then market_price(crop_year()) end),
                            'contract_lbs', contract_lbs, 'reserves_enabled', reserves_enabled)
    from customers where id = my_customer()
$$;

-- Sales adding a line to an order (012, changed live by 013 / 039): price from terms_for, not the customer's own price only
do $$
declare d text; was text := '(select price_per_lb from customers where id = o.customer_id)';
begin
  d := pg_get_functiondef('set_order_line(int, int, text, numeric, numeric)'::regprocedure);
  if position('terms_for(o.customer_id' in d) = 0 then
    if position(was in d) = 0 then raise exception 'set_order_line is not what 164 expects; nothing changed'; end if;
    execute replace(d, was, '(select t.price_per_lb from terms_for(o.customer_id, crop_year()) t)');
  end if;
end $$;

commit;

select (select count(*) from market_prices) as market_prices_set,
       position('market_price(' in pg_get_functiondef('terms_for(int,int)'::regprocedure)) > 0 as terms_for_updated,
       position('terms_for(o.customer_id' in pg_get_functiondef('set_order_line(int,int,text,numeric,numeric)'::regprocedure)) > 0 as set_order_line_updated;
