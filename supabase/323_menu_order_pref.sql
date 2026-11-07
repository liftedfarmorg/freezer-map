-- 323: each person's own module menu order (Aziz 11/7, Msg #320-323). Drag screens in the computer sidebar; Dashboard stays
-- first; the 3 under it are the phone bar (Home + 3). Saved in app_users.prefs as menu_order = { module: [screen keys] }.
-- Only adds 'menu_order' to the settings set_my_prefs accepts (patched by text; stops if the live function isn't what it expects).
-- RUN LIVE 11/7 by Claude in the SQL Editor (Aziz OK, Msg 322). Safe to re-run.
begin;
do $$
declare d text;
  a text := 'if k not in (''theme'',''start_module'',''start_site'',''notify'',''lang'') then';
  b text := 'if k not in (''theme'',''start_module'',''start_site'',''notify'',''lang'',''menu_order'') then';
begin
  d := pg_get_functiondef('set_my_prefs(jsonb)'::regprocedure);
  if position('menu_order' in d) > 0 then raise notice 'set_my_prefs already takes menu_order'; return; end if;
  if position(a in d) = 0 then raise exception 'set_my_prefs is not what 323 expects; nothing changed'; end if;
  execute replace(d, a, b);
end $$;
commit;
