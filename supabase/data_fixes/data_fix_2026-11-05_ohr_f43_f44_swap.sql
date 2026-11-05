-- Swap everything in OHR freezer 43 with freezer 44 (Msg F43-44, 11/5). Crew put 43's pallets on the map in 44 and vice versa.
-- RUN LIVE by Claude via Management API (as Aziz). App only: no METRC to-dos (freezer slots aren't METRC locations).
-- Before: 43 = P733-P750 (18), 44 = P783-P800 (18). Same slot letter swaps (43A <-> 44A ... 43R <-> 44R).
-- Uses apply_moves (checks every pallet first, then moves; one batch, one 'move' event per pallet).
begin;
select set_config('request.jwt.claims',
  '{"email":"aziz@lifted-organics.com","role":"authenticated","amr":[{"method":"oauth"}]}', true);
select apply_moves((
  select jsonb_agg(jsonb_build_object('pallet_id', p.id, 'from_slot', s.id, 'to_slot', t.id, 'kind', 'move'))
  from pallets p
  join slots s on s.id = p.slot_id
  join freezers f on f.id = s.freezer_id and f.site = 'OHR' and f.number in (43, 44)
  join freezers tf on tf.site = 'OHR' and tf.number = case f.number when 43 then 44 else 43 end
  join slots t on t.freezer_id = tf.id and substr(t.code, 3) = substr(s.code, 3)
  where p.status = 'in_freezer'
), 'Swap F43/F44: crew mapped 43 into 44 and vice versa');
commit;

-- Check
select f.number, string_agg(s.code || '=' || p.code, ' ' order by s.code)
from pallets p join slots s on s.id = p.slot_id join freezers f on f.id = s.freezer_id
where f.site = 'OHR' and f.number in (43, 44) group by f.number;
