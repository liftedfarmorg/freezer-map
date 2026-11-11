-- RUN 11/11 by Claude (Msg C7-UNDO-3). W2 / W2-1 were put in GVR Staging by hand when C7 was undone, not received off a
-- load. The staging trigger marks anything that comes in from no spot as "received"; clear it so they show no chip.
begin;
update pallets set staged_reason = null, updated_at = now() where id in (680, 2147) and code in ('W2', 'W2-1') and staged_reason = 'received';
select p.code, s.code spot, p.staged_reason, p.staged_at from pallets p join slots s on s.id = p.slot_id where p.id in (680, 2147) order by p.id;
commit;
