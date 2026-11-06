-- 225: METRC checks rejected packages against the driver's list (change-order plan E, Msg #270).
-- Plan: change-order-walkthrough-250.md situations 8, 14; decisions in change-order-decisions-251.md (late rejection:
-- not an outcome change; the customer sends a return manifest and it's flagged for a back-end fix).
-- After every METRC pull (nightly, and Compliance > METRC > Pull) the app compares, for each delivery stop recorded in
-- the last 45 days, what METRC says happened to each package with what the driver recorded:
--  * Rejected in METRC, but the driver recorded it as delivered (a late rejection): alert to Distribution Admins (Rama)
--    and an Accounting flag: back-end fix (return manifest / credit memo).
--  * The driver says rejected, but the customer accepted it in METRC: alert to Rama (have them reject it or send a
--    return manifest).
--  * Not delivered at the stop, but the customer received the manifest in METRC: alert to Rama.
-- Packages METRC still shows as just shipped are left alone until they're accepted or rejected. Each finding alerts once.
-- Alerts use the METRC follow-ups type (Admin > Settings > Alerts to add people). Safe to re-run.
begin;

create or replace function metrc_stop_check() returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0; late text; acc text; got text; key text;
begin
  for s in select st.id, st.seq, st.manifest, st.outcome, st.outcome_reason, l.id as load_id, l.code as load, c.name as customer,
                  nullif(regexp_replace(st.manifest, '\D', '', 'g'), '')::bigint as mid
             from load_stops st join loads l on l.id = st.load_id join customers c on c.id = st.customer_id
            where st.outcome is not null and st.outcome <> 'dropped_off' and nullif(trim(coalesce(st.manifest, '')), '') is not null
              and st.outcome_at > now() - interval '45 days' and c.kind = 'external' and st.manifest_voided_at is null loop
    continue when s.mid is null or not exists (select 1 from metrc_transfer_packages tp where tp.delivery_id = s.mid);
    with drv as (   -- what the driver said came back rejected
      select upper(p.package_tag) as label from stop_returns r join pallets p on p.id = r.pallet_id
       where r.stop_id = s.id and r.kind = 'rejected' and r.cancelled_at is null and p.package_tag is not null),
    mt as (
      select upper(tp.label) as label, lower(coalesce(tp.state, '')) as st from metrc_transfer_packages tp where tp.delivery_id = s.mid)
    select string_agg(mt.label, ', ' order by mt.label) filter (where (mt.st like 'reject%' or mt.st like 'return%') and s.outcome in ('delivered', 'partly_rejected')
                                                                 and not exists (select 1 from drv where drv.label = mt.label)),
           string_agg(mt.label, ', ' order by mt.label) filter (where mt.st like 'accept%' and exists (select 1 from drv where drv.label = mt.label)),
           string_agg(mt.label, ', ' order by mt.label) filter (where mt.st like 'accept%' and s.outcome = 'not_delivered')
      into late, acc, got from mt;
    if late is not null then
      key := 'late:' || md5(late);
      if not exists (select 1 from app_alerts a where a.kind = 'stop_metrc' and a.ref ->> 'stop_id' = s.id::text and a.ref ->> 'check' = key) then
        perform _alert('distribution', true, 'stop_metrc', 'METRC: ' || s.customer || ' rejected packages the driver marked delivered (manifest ' || s.manifest || ')',
          s.load || ' stop ' || s.seq || ': ' || late || ' rejected in METRC. They need to come back on a return manifest; flagged for a back-end fix.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        perform _alert('accounting', false, 'acct_flag', 'Late rejection: ' || s.customer || ', manifest ' || s.manifest,
          'METRC shows ' || late || ' rejected after the driver recorded the stop as delivered (' || s.load || ' stop ' || s.seq || '). Its invoice may need a credit memo once the return manifest is in.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        n := n + 1;
      end if;
    end if;
    if acc is not null then
      key := 'acc:' || md5(acc);
      if not exists (select 1 from app_alerts a where a.kind = 'stop_metrc' and a.ref ->> 'stop_id' = s.id::text and a.ref ->> 'check' = key) then
        perform _alert('distribution', true, 'stop_metrc', 'METRC: ' || s.customer || ' accepted packages the driver says were rejected (manifest ' || s.manifest || ')',
          s.load || ' stop ' || s.seq || ': ' || acc || ' accepted in METRC. Have them reject it in METRC or send a return manifest.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        n := n + 1;
      end if;
    end if;
    if got is not null then
      key := 'got:' || md5(got);
      if not exists (select 1 from app_alerts a where a.kind = 'stop_metrc' and a.ref ->> 'stop_id' = s.id::text and a.ref ->> 'check' = key) then
        perform _alert('distribution', true, 'stop_metrc', 'METRC: ' || s.customer || ' received manifest ' || s.manifest || ', but the stop is Not delivered',
          s.load || ' stop ' || s.seq || ': ' || got || ' accepted in METRC. The manifest can''t be voided now. Sort it out in METRC (return manifest), and check the stop outcome.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke all on function metrc_stop_check() from public, anon, authenticated;
grant execute on function metrc_stop_check() to service_role;

commit;
