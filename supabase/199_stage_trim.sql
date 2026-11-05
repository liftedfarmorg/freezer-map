-- 199: Stage at OHR also takes trim (Msg R-199, 11/4: "Trim should count"). Patches SQL 197's live functions.
-- stage_at_ohr: frozen, flower and trim can be staged. order_transfer: Send to OHR is blocked for GVR trim too.
-- Stops (nothing changed) if a function isn't what it expects. Run live by Claude 11/4. Safe to re-run.
do $$
declare d text; n int := 0;
begin
  d := pg_get_functiondef('stage_at_ohr(integer, integer, text, date, integer)'::regprocedure);
  if position('''unbucked'', ''trim'')' in d) = 0 then
    if position('in (''fresh_frozen'', ''bucked'', ''unbucked'')' in d) = 0 then raise exception 'stage_at_ohr is not what this expects; nothing changed'; end if;
    d := replace(d, 'in (''fresh_frozen'', ''bucked'', ''unbucked'')', 'in (''fresh_frozen'', ''bucked'', ''unbucked'', ''trim'')');
    d := replace(d, '''not frozen or flower''', '''not frozen, flower or trim''');
    execute d; n := n + 1;
  end if;
  d := pg_get_functiondef('order_transfer(integer, integer, text)'::regprocedure);
  if position('''unbucked'', ''trim'')' in d) = 0 then
    if position('in (''fresh_frozen'', ''bucked'', ''unbucked'')' in d) = 0 then raise exception 'order_transfer is not what this expects; nothing changed'; end if;
    d := replace(d, 'in (''fresh_frozen'', ''bucked'', ''unbucked'')', 'in (''fresh_frozen'', ''bucked'', ''unbucked'', ''trim'')');
    execute d; n := n + 1;
  end if;
  raise notice '% functions updated', n;
end $$;

select position('''trim''' in pg_get_functiondef('stage_at_ohr(integer, integer, text, date, integer)'::regprocedure)) > 0 as stage_takes_trim,
       position('''trim''' in pg_get_functiondef('order_transfer(integer, integer, text)'::regprocedure)) > 0 as send_blocks_trim;
