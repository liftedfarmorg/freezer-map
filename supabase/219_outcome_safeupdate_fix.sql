-- 219: Fix "DELETE requires a WHERE clause" when recording a stop outcome (Msg #260, Lazer Buddha test 11/5).
-- Supabase blocks DELETE / UPDATE without a WHERE (pg-safeupdate) for calls from the app. _stop_outcome (215/218) cleared
-- its scratch table with a bare DELETE and marked every package with a bare UPDATE. Both get "where true".
-- Nothing else changes. Safe to re-run.
do $$
declare d text;
begin
  select pg_get_functiondef('_stop_outcome(int,jsonb,text,text)'::regprocedure) into d;
  d := replace(d, 'delete from _so_leaf;', 'delete from _so_leaf where true;');
  d := replace(d, 'update _so_leaf set back = true, reason = why, note = note_;', 'update _so_leaf set back = true, reason = why, note = note_ where true;');
  execute d;
end $$;
