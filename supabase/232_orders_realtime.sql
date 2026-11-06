-- 232: Fulfillment updates on its own when an order is confirmed or changed (Aziz 11/6, Msg #282: TSL's SO-26110601 was
-- confirmed in the portal at 11:40 but didn't show for someone who already had Fulfillment open until they refreshed).
-- Adds orders to the live-update feed the app already listens to (pallets, loads, stops). Each person still only gets
-- the rows they're allowed to see. Safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
