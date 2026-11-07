-- Data fix 11/6 (Msg COMBINE-9, Aziz: "remove the history since it was a mistake").
-- L-1106-1 stop 2 Bavana: M17 went on the Verdacopia/GVR load by mistake; Rama redirected METRC manifest 0011841245 to GVR
-- and it was received there. The Bavana order (SO-26110402) is already off the load and Ready; M17 is in GVR Staging 15.
-- Removes the stop, M17's spot on the truck plan and its coming-back record. Nothing in METRC changes; no invoice exists.
-- METRC to-dos #941 (manifest) and #942 (void, closed) stay as history. Safe to re-run.
begin;
delete from stop_returns where stop_id = 36;
delete from stop_photos where stop_id = 36;
delete from load_items where stop_id = 36;
update orders set stop_id = null where stop_id = 36;
delete from load_stops where id = 36 and load_id = (select id from loads where code = 'L-1106-1');
insert into events (user_email, type, note, details)
values ('aziz@lifted-organics.com', 'stop_removed', 'L-1106-1 stop 2 Bavana removed: put on the load by mistake, M17 went to GVR on 0011841245',
        jsonb_build_object('load', 'L-1106-1', 'stop_id', 36, 'customer', 'Bavana', 'manifest', '0011841245', 'pallet', 'M17'));
commit;
select s.seq, c.name, s.outcome, (select count(*) from load_items i where i.stop_id = s.id) items
  from load_stops s join customers c on c.id = s.customer_id join loads l on l.id = s.load_id where l.code = 'L-1106-1' order by s.seq;
