-- 156: Fulfillment > Shipped shows every shipped order, not only ones that left on an app load (Aziz 11/1, Msg FULFILL-QBO-5).
--  * fulfillment_orders: shipped orders with or without a load stop, back to p_days (the app now asks for 730 days).
--  * each order also carries its invoice number and the METRC manifest on that invoice (Roshi / QuickBooks history has no load).
-- Read-only function change, no data touched. Patches the live function text (it was changed in place by later migrations);
-- stops with an error if the text it looks for isn't there. Safe to re-run.
do $$
declare d text;
begin
  d := pg_get_functiondef('fulfillment_orders(int)'::regprocedure);
  if position('''inv_manifest''' in d) > 0 then raise notice '156 already applied'; return; end if;
  if position('o.stop_id is not null and o.shipped_date >= current_date - p_days' in d) = 0
     or position('''shipped_date'', o.shipped_date,' in d) = 0 then
    raise exception 'fulfillment_orders is not what 156 expects; nothing changed';
  end if;
  d := replace(d, 'o.stop_id is not null and o.shipped_date >= current_date - p_days',
                  'coalesce(o.shipped_date, o.order_date) >= current_date - p_days');
  d := replace(d, '''shipped_date'', o.shipped_date,',
                  '''shipped_date'', o.shipped_date, '
               || '''inv'', (select i.inv_number from invoices i where i.order_id = o.id and i.status <> ''void'' order by i.id limit 1), '
               || '''inv_manifest'', (select i.manifest from invoices i where i.order_id = o.id and i.status <> ''void'' and i.manifest is not null order by i.id limit 1),');
  execute d;
end $$;
select 'ok' as fulfillment_history;
