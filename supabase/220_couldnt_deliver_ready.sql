-- 220: "Couldn't deliver" works like "Customer rescheduled" once the product is back (Msg #261, per the #239 plan):
-- the order goes back to Ready with the same pallets (and a GVR pallet re-staged at OHR keeps its order).
-- Only "Customer cancelled" and "Fully rejected" cancel the order. Safe to re-run.
do $$
declare d text;
begin
  select pg_get_functiondef('receive_returns(bigint[],text)'::regprocedure) into d;
  d := replace(d, 'case when r.outcome_reason = ''rescheduled'' then g.order_id end',
                  'case when r.outcome_reason in (''rescheduled'', ''couldnt_deliver'') then g.order_id end');
  d := replace(d, 's.outcome = ''not_delivered'' and s.outcome_reason = ''rescheduled'')',
                  's.outcome = ''not_delivered'' and s.outcome_reason in (''rescheduled'', ''couldnt_deliver''))');
  d := replace(d, '''why'', ''rescheduled, received back''', '''why'', ''not delivered (rescheduled / couldn''''t deliver), received back''');
  execute d;
end $$;
