-- 315: Save as draft + the New order price fill-in (Aziz 11/7, Msg #313-315).
--  * order_line_prices(customer, lines): the price a line would get for this customer, exactly as create_order works it out
--    (line_price from 176: their contract price for that product, else the item card price for that strain + product + crop
--    year, else the market price). Read only, Sales only. New sales order fills $/lb with it; it can still be changed.
--  * Drafts: New sales order can save as a draft (create_order p_confirm = false, already there). A draft holds nothing.
--    Confirming a draft (set_order_status draft -> pending) is Sales Admins only and runs the same stock check as confirming a
--    portal order; it records who confirmed it, and the SO number comes from the existing so_on_confirm trigger.
--  * set_order_status is patched by text (like 164 / 176); the patch stops the whole file if the live function isn't what it expects.
-- RUN LIVE 11/7 by Claude in the SQL Editor (Aziz OK, Msg 314). Safe to re-run.
begin;

create or replace function order_line_prices(p_customer int, p_lines jsonb)
returns table (product text, strain text, crop_year int, price numeric)
language sql stable security definer set search_path = public as $$
  select x ->> 'product', x ->> 'strain', (x ->> 'year')::int,
         line_price(p_customer, (x ->> 'year')::int, coalesce(canonical_strain(x ->> 'strain'), x ->> 'strain'), coalesce(x ->> 'product', 'fresh_frozen'), null)
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x
   where is_sales()
$$;
revoke all on function order_line_prices(int, jsonb) from public, anon;
grant execute on function order_line_prices(int, jsonb) to authenticated;

do $$
declare d text; n text;
  a1 text := 'if o.status = ''submitted'' and p_status in (''pending'', ''shipped'') then';
  b1 text := 'if o.status = ''draft'' and p_status in (''pending'', ''shipped'') and not (is_sales_admin() or is_owner()) then raise exception ''Only a Sales Admin can confirm a draft''; end if;
  if o.status in (''submitted'', ''draft'') and p_status in (''pending'', ''shipped'') then';
  a2 text := 'confirmed_by = case when o.status = ''submitted'' and p_status = ''pending'' then current_email() else confirmed_by end';
  b2 text := 'confirmed_by = case when o.status in (''submitted'', ''draft'') and p_status = ''pending'' then current_email() else confirmed_by end';
  a3 text := 'confirmed_at = case when o.status = ''submitted'' and p_status = ''pending'' then now() else confirmed_at end';
  b3 text := 'confirmed_at = case when o.status in (''submitted'', ''draft'') and p_status = ''pending'' then now() else confirmed_at end';
begin
  d := pg_get_functiondef('set_order_status(integer,text,text,text,date)'::regprocedure);
  if position('Only a Sales Admin can confirm a draft' in d) > 0 then raise notice 'set_order_status already patched'; return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 then raise exception 'set_order_status is not what 315 expects; nothing changed'; end if;
  n := replace(replace(replace(d, a1, b1), a2, b2), a3, b3);
  execute n;
end $$;

commit;
