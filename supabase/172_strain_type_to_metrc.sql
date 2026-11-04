-- RUN LIVE 11/3 by Claude in the SQL Editor.
-- 172: changing a strain's type (Indica ... Sativa) also updates the strain in METRC (Aziz 11/3).
-- set_strain_type (171) now queues "Update strain in METRC" on every license where METRC has the strain (from metrc_strains).
-- New to-do kind strain_update, mode APPROVE to start: T3's strain update hasn't been used yet, so the first ones wait in
-- Compliance > METRC > To do for someone to tap Send. Switch it to Auto in Compliance > Settings once one has gone through.
-- Safe to re-run.
begin;

insert into metrc_push_kinds (kind, label, phase, sort, ready, mode) values
  ('strain_update', 'Strain type change: update the strain in METRC', 0, 7, true, 'approve')
on conflict (kind) do update set label = excluded.label, ready = true;

create or replace function set_strain_type(p_strain int, p_type text) returns void
language plpgsql security definer set search_path = public as $$
declare ind numeric; s strains; r record; was text;
begin
  perform no_view_as();
  if not (is_any_admin() or is_owner()) then raise exception 'Only an Admin can change the strain type'; end if;
  ind := case p_type when 'Indica' then 100 when 'Indica Hybrid' then 75 when 'Hybrid' then 50 when 'Sativa Hybrid' then 25 when 'Sativa' then 0 end;
  if p_type is not null and ind is null then raise exception 'Pick Indica, Indica Hybrid, Hybrid, Sativa Hybrid or Sativa'; end if;
  select strain_type into was from strains where id = p_strain;
  update strains set strain_type = p_type,
         metrc_indica = coalesce(ind, metrc_indica), metrc_sativa = coalesce(100 - ind, metrc_sativa), updated_at = now()
   where id = p_strain returning * into s;
  insert into events (user_email, type, note, details)
  values (current_email(), 'strain_type', s.name, jsonb_build_object('type', p_type, 'was', was, 'indica', ind));
  if ind is null or p_type is not distinct from was then return; end if;
  -- METRC: one update per license that has the strain (replaces an older one still waiting)
  for r in select x.license, x.name from metrc_strains x
            where not x.archived and lower(x.name) = lower(metrc_strain_on(s.id, x.license)) loop
    update comp_metrc_actions set status = 'skipped', note = 'Replaced by a newer type change', done_at = now()
     where kind = 'strain_update' and status in ('todo', 'error') and license = r.license and (details ->> 'strain_id')::int = s.id;
    insert into comp_metrc_actions (license, action, summary, details, kind)
    values (r.license, 'Update strain in METRC', 'Strain ' || r.name || ': ' || p_type || ' (' || ind || '/' || (100 - ind) || ' indica/sativa)',
            jsonb_build_object('type', 'strain_update', 'strain_id', s.id, 'strain', s.name, 'name', r.name, 'kind', p_type,
                               'indica', ind, 'sativa', 100 - ind, 'testing', s.metrc_testing, 'thc', s.metrc_thc, 'cbd', s.metrc_cbd),
            'strain_update');
  end loop;
end $$;
revoke all on function set_strain_type(int, text) from public, anon;
grant execute on function set_strain_type(int, text) to authenticated;

commit;
