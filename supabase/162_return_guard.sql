-- 162: returns, part 4.
--  * A return line can never take in more than its lbs (two packages for one line, e.g. the parent package we shipped from
--    and the customer's repackaged one, no longer double count): the receive is refused with a message.
--  * "Already received in METRC" only offers packages actually received on Inbound (last 120 days). Packages we shipped from
--    that are still on hand here (the rest of a split package) are no longer listed or pre-ticked.
-- Run after 161. Safe to re-run.
begin;

create or replace function _return_line_guard() returns trigger
language plpgsql as $$
begin
  if new.received_lbs > new.lbs + 0.001 then
    raise exception '% would take in % lbs but only % lbs are on the return line. Untick the extra package or check the lbs.', new.strain, new.received_lbs, new.lbs;
  end if;
  return new;
end $$;
drop trigger if exists return_line_guard on return_lines;
create trigger return_line_guard before update of received_lbs on return_lines for each row execute function _return_line_guard();

create or replace function return_candidates(p_return int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.ours desc, x.received_on desc nulls last, x.code), '[]') from (
    select p.id, p.code, p.strain, p.status, p.package_tag as tag, p.current_weight as lbs_now, p.received_site as site,
           e.lbs as received_lbs, (e.at at time zone 'America/Los_Angeles')::date as received_on, e.details ->> 'manifest' as manifest, e.details ->> 'from' as from_name,
           exists (select 1 from return_lines l where l.return_id = p_return and upper(p.package_tag) = any(l.tags)) as ours,
           (select l.id from return_lines l where l.return_id = p_return
             order by (upper(p.package_tag) = any(l.tags)) desc, (canonical_strain(p.strain) is not distinct from canonical_strain(l.strain)) desc, l.id limit 1) as line_id
      from pallets p
      join lateral (select ev.lbs, ev.at, ev.details from events ev where ev.pallet_id = p.id and ev.type = 'inbound_received' order by ev.at desc limit 1) e on true
     where p.kind = 'package' and p.return_line_id is null and not exists (select 1 from return_packages rp where rp.pallet_id = p.id)
       and e.at > now() - interval '120 days'
       and (is_sales() or has_module('accounting'))) x
$$;

commit;
