-- 341_feedback.sql  (Msg FB-5, 11/11)
-- Feedback & Bugs: staff and drivers report bugs, ideas and questions from any screen; Aziz (triagers) approves,
-- declines or rewrites them in Admin > Feedback & Bugs; Claude works the Approved queue when asked.
-- Plan: claude/feedback-bugs-plan-FB-3.md
--
-- Who sees what:
--   * everyone: only their own reports (driver logins too)
--   * module Admins: their module's reports (driver portal reports -> Distribution Admins), can comment
--   * triagers (app_users.feedback_triage, Aziz for now): everything; the only ones who change status
-- Notifications: new report -> push to triagers; Needs info (a question) and Ready to test -> the reporter.
-- Also imports all 21 rows of "Lifted Ops Platform Feedback_Oct 2026 - LIVE.xlsx": FB number = sheet row number.
-- Safe to run more than once.

begin;

-- =====================================================================================================
-- 1. who triages
-- =====================================================================================================
alter table app_users add column if not exists feedback_triage boolean not null default false;
update app_users set feedback_triage = true where email = 'aziz@lifted-organics.com';

insert into app_settings values ('feedback.on', 'true') on conflict (key) do nothing;

-- =====================================================================================================
-- 2. tables
-- =====================================================================================================
create table if not exists feedback (
  id             bigint generated always as identity primary key,
  ref            text generated always as ('FB-' || lpad(id::text, 4, '0')) stored,
  type           text not null default 'bug' check (type in ('bug', 'idea', 'question')),
  status         text not null default 'new'
                   check (status in ('new', 'needs_info', 'approved', 'in_progress', 'ready_to_test', 'done', 'declined', 'duplicate')),
  severity       text check (severity in ('blocking', 'slowing', 'nice')),          -- reporter: how bad
  priority       text check (priority in ('high', 'medium', 'low')),                -- triager
  module         text check (module in ('distribution', 'sales', 'cultivation', 'nursery', 'processing', 'accounting',
                                        'compliance', 'admin', 'driver')),
  screen         text,                    -- e.g. Map, Orders, Harvest
  section        text,                    -- tab / settings section
  record_type    text,                    -- pallet, order, harvest, batch, run, load ...
  record_id      text,
  record_label   text,
  title          text,                    -- short name; triager can edit
  what_trying    text,                    -- "What were you trying to do?"
  details        text not null,           -- "What happened?" (bug) / "What would help?" (idea, question)
  edited_spec    text,                    -- triager's rewrite; the reporter's words stay as they were
  decision_note  text,                    -- why declined / approved notes
  duplicate_of   bigint references feedback(id),
  reporter_email text,
  reporter_name  text,
  context        jsonb not null default '{}',   -- device, version, view as, recent errors ...
  app_version    text,
  source         text not null default 'app' check (source in ('app', 'sheet')),
  source_ref     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  approved_at    timestamptz,
  approved_by    text,
  ready_at       timestamptz,
  done_at        timestamptz,
  commit_ref     text,                    -- Claude: the commit that fixed it
  claude_notes   text                     -- Claude: what changed, how to test
);
create index if not exists feedback_status_idx   on feedback (status);
create index if not exists feedback_reporter_idx on feedback (reporter_email);
create index if not exists feedback_module_idx   on feedback (module);

create table if not exists feedback_comments (
  id           bigint generated always as identity primary key,
  feedback_id  bigint not null references feedback(id) on delete cascade,
  author_email text,
  author_name  text,
  body         text not null,
  internal     boolean not null default false,   -- triager-only note
  created_at   timestamptz not null default now()
);
create index if not exists feedback_comments_fb_idx on feedback_comments (feedback_id);

create table if not exists feedback_events (
  id          bigint generated always as identity primary key,
  feedback_id bigint not null references feedback(id) on delete cascade,
  actor_email text,
  from_status text,
  to_status   text,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists feedback_events_fb_idx on feedback_events (feedback_id);

create table if not exists feedback_files (
  id          bigint generated always as identity primary key,
  feedback_id bigint not null references feedback(id) on delete cascade,
  file_path   text not null unique,      -- path in the feedback bucket: fb/<id>/<name>
  kind        text not null default 'photo' check (kind in ('screen', 'paste', 'photo')),
  added_by    text,
  created_at  timestamptz not null default now()
);
create index if not exists feedback_files_fb_idx on feedback_files (feedback_id);

-- =====================================================================================================
-- 3. helpers
-- =====================================================================================================
create or replace function is_feedback_triager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select feedback_triage from app_users where email = jwt_email() and role in ('admin', 'sales', 'crew')), false)
$$;

-- Claude (database / service access, no signed-in user)
create or replace function _fb_is_service() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin')
$$;

-- the module whose Admins see a report (driver portal -> Distribution)
create or replace function _fb_admin_module(p_module text) returns text
language sql immutable as $$ select case when p_module = 'driver' then 'distribution' else p_module end $$;

create or replace function can_see_feedback(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from feedback f where f.id = p_id and (
           is_feedback_triager()
        or f.reporter_email = jwt_email()
        or (f.module is not null and is_mod_admin(_fb_admin_module(f.module)))))
$$;

-- the real person signed in (even while viewing as someone), if they're staff
create or replace function _fb_real_staff() returns app_users
language sql stable security definer set search_path = public as $$
  select * from app_users where email = real_email() and role in ('admin', 'sales', 'crew')
$$;

create or replace function _fb_id_from_path(p_name text) returns bigint
language sql immutable as $$ select case when p_name ~ '^fb/[0-9]+/' then split_part(p_name, '/', 2)::bigint end $$;

-- may this person add pictures to report p_id? (the real person, so it works while viewing as)
create or replace function _fb_can_attach(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from feedback f where f.id = p_id and (f.reporter_email = real_email() or is_feedback_triager()))
$$;

create or replace function _fb_event(p_id bigint, p_from text, p_to text, p_note text) returns void
language sql security definer set search_path = public as $$
  insert into feedback_events (feedback_id, actor_email, from_status, to_status, note)
  values (p_id, coalesce(nullif(real_email(), ''), 'claude'), p_from, p_to, p_note)
$$;

revoke all on function _fb_is_service() from public, anon, authenticated;
revoke all on function _fb_real_staff() from public, anon, authenticated;
revoke all on function _fb_event(bigint, text, text, text) from public, anon, authenticated;

-- =====================================================================================================
-- 4. access (reads straight from the tables; every write goes through the functions below)
-- =====================================================================================================
alter table feedback          enable row level security;
alter table feedback_comments enable row level security;
alter table feedback_events   enable row level security;
alter table feedback_files    enable row level security;

drop policy if exists feedback_read on feedback;
create policy feedback_read on feedback for select to authenticated using (can_see_feedback(id));
drop policy if exists feedback_comments_read on feedback_comments;
create policy feedback_comments_read on feedback_comments for select to authenticated
  using (can_see_feedback(feedback_id) and (not internal or is_feedback_triager()));
drop policy if exists feedback_events_read on feedback_events;
create policy feedback_events_read on feedback_events for select to authenticated using (can_see_feedback(feedback_id));
drop policy if exists feedback_files_read on feedback_files;
create policy feedback_files_read on feedback_files for select to authenticated using (can_see_feedback(feedback_id));

revoke all on feedback, feedback_comments, feedback_events, feedback_files from anon;
grant select on feedback, feedback_comments, feedback_events, feedback_files to authenticated;

-- private bucket for screenshots and photos: fb/<feedback id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 15728640, array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists feedback_files_obj_read on storage.objects;
create policy feedback_files_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and public.can_see_feedback(public._fb_id_from_path(name)));
drop policy if exists feedback_files_obj_add on storage.objects;
create policy feedback_files_obj_add on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and public._fb_can_attach(public._fb_id_from_path(name)));
drop policy if exists feedback_files_obj_delete on storage.objects;
create policy feedback_files_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'feedback' and public.is_feedback_triager() and not public.impersonating());

-- =====================================================================================================
-- 5. reporting (anyone on staff, drivers included; works while viewing as, the real person is the reporter)
-- =====================================================================================================
create or replace function submit_feedback(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users := _fb_real_staff(); f feedback; d text := trim(coalesce(p ->> 'details', ''));
        tri text[]; url text := (select value from app_settings where key = 'app.url');
begin
  if me.email is null then raise exception 'Only staff can send feedback'; end if;
  if coalesce((select value from app_settings where key = 'feedback.on'), 'true') <> 'true' then raise exception 'Feedback & Bugs is turned off'; end if;
  if d = '' then raise exception 'Say what happened (or what would help)'; end if;
  insert into feedback (type, severity, module, screen, section, record_type, record_id, record_label,
                        what_trying, details, reporter_email, reporter_name, context, app_version)
  values (coalesce(nullif(p ->> 'type', ''), 'bug'), nullif(p ->> 'severity', ''), nullif(p ->> 'module', ''),
          nullif(p ->> 'screen', ''), nullif(p ->> 'section', ''), nullif(p ->> 'record_type', ''),
          nullif(p ->> 'record_id', ''), nullif(p ->> 'record_label', ''),
          nullif(trim(coalesce(p ->> 'what_trying', '')), ''), d, me.email,
          coalesce(nullif(trim(me.display_name), ''), split_part(me.email, '@', 1)),
          coalesce(p -> 'context', '{}'::jsonb)
            || case when impersonating() then jsonb_build_object('viewing_as', jwt_email()) else '{}'::jsonb end,
          nullif(p ->> 'app_version', ''))
  returning * into f;
  perform _fb_event(f.id, null, 'new', null);

  select array_agg(email) into tri from app_users where feedback_triage and role in ('admin', 'sales', 'crew');
  if tri is not null then
    perform _notify(tri,
      f.ref || ' ' || case f.type when 'bug' then 'Bug' when 'idea' then 'Idea' else 'Question' end
        || coalesce(' · ' || initcap(f.module), '') || coalesce(' › ' || f.screen, ''),
      f.reporter_name || ': ' || left(f.details, 140),
      coalesce(url, '') || '?fb=' || f.id, 'feedback_new', jsonb_build_object('feedback_id', f.id));
  end if;
  return jsonb_build_object('id', f.id, 'ref', f.ref);
end $$;

-- screenshot / pasted / photo, after it's uploaded to fb/<id>/...
create or replace function add_feedback_file(p_id bigint, p_path text, p_kind text default 'photo') returns jsonb
language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  select * into f from feedback where id = p_id;
  if f.id is null then raise exception 'No such report'; end if;
  if not _fb_can_attach(p_id) then raise exception 'Only the person who sent it can add pictures'; end if;
  if _fb_id_from_path(p_path) is distinct from p_id then raise exception 'Wrong file path'; end if;
  insert into feedback_files (feedback_id, file_path, kind, added_by) values (p_id, p_path, coalesce(nullif(p_kind, ''), 'photo'), real_email())
  on conflict (file_path) do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- the reporter fixes their own words while it's New or Needs info
create or replace function edit_my_feedback(p_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  perform no_view_as();
  select * into f from feedback where id = p_id for update;
  if f.id is null or f.reporter_email is distinct from jwt_email() then raise exception 'You can only change your own reports'; end if;
  if f.status not in ('new', 'needs_info') then raise exception 'It''s already been picked up, add a comment instead'; end if;
  if p ? 'details' and trim(coalesce(p ->> 'details', '')) = '' then raise exception 'Say what happened (or what would help)'; end if;
  update feedback set
    type        = case when p ? 'type' then p ->> 'type' else type end,
    severity    = case when p ? 'severity' then nullif(p ->> 'severity', '') else severity end,
    what_trying = case when p ? 'what_trying' then nullif(trim(p ->> 'what_trying'), '') else what_trying end,
    details     = case when p ? 'details' then trim(p ->> 'details') else details end,
    updated_at  = now()
   where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- comments: reporter, module Admins, triagers. A reporter's answer moves Needs info back to New.
create or replace function comment_feedback(p_id bigint, p_body text, p_internal boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f feedback; me app_users := _fb_real_staff(); b text := trim(coalesce(p_body, ''));
begin
  perform no_view_as();
  if me.email is null or not can_see_feedback(p_id) then raise exception 'You can''t comment on this one'; end if;
  if b = '' then raise exception 'Write something first'; end if;
  if p_internal and not is_feedback_triager() then raise exception 'Only triagers can add internal notes'; end if;
  select * into f from feedback where id = p_id for update;
  insert into feedback_comments (feedback_id, author_email, author_name, body, internal)
  values (p_id, me.email, coalesce(nullif(trim(me.display_name), ''), split_part(me.email, '@', 1)), b, coalesce(p_internal, false));
  if f.status = 'needs_info' and f.reporter_email = me.email then
    update feedback set status = 'new', updated_at = now() where id = p_id;
    perform _fb_event(p_id, 'needs_info', 'new', 'Answered');
  else
    update feedback set updated_at = now() where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- the reporter (or a triager) after Ready to test: works -> Done, still broken -> back to Approved
create or replace function feedback_verdict(p_id bigint, p_works boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  perform no_view_as();
  select * into f from feedback where id = p_id for update;
  if f.id is null or not (f.reporter_email = jwt_email() or is_feedback_triager()) then raise exception 'Only the person who sent it can say'; end if;
  if f.status <> 'ready_to_test' then raise exception 'It isn''t waiting on a test'; end if;
  if not p_works and trim(coalesce(p_note, '')) = '' then raise exception 'Say what''s still wrong'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is not null then perform comment_feedback(p_id, p_note, false); end if;
  if p_works then
    update feedback set status = 'done', done_at = now(), updated_at = now() where id = p_id;
    perform _fb_event(p_id, 'ready_to_test', 'done', 'Works now');
  else
    update feedback set status = 'approved', ready_at = null, updated_at = now() where id = p_id;
    perform _fb_event(p_id, 'ready_to_test', 'approved', 'Still broken');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================================================
-- 6. triage (triagers in the app; Claude through service access)
-- =====================================================================================================
create or replace function triage_feedback(p_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f feedback; st text; old text; url text := (select value from app_settings where key = 'app.url');
begin
  if not (is_feedback_triager() or _fb_is_service()) then raise exception 'Only triagers can do this'; end if;
  if not _fb_is_service() then perform no_view_as(); end if;
  select * into f from feedback where id = p_id for update;
  if f.id is null then raise exception 'No such report'; end if;
  old := f.status;
  st := coalesce(nullif(p ->> 'status', ''), f.status);
  if st = 'needs_info' and old <> 'needs_info' and nullif(trim(coalesce(p ->> 'question', '')), '') is null then raise exception 'Write your question for them'; end if;
  if nullif(trim(coalesce(p ->> 'question', '')), '') is not null then
    insert into feedback_comments (feedback_id, author_email, author_name, body, internal)
    select p_id, a.email, coalesce(nullif(trim(a.display_name), ''), split_part(a.email, '@', 1)), trim(p ->> 'question'), false
      from (select coalesce(nullif(real_email(), ''), 'claude') as email) e left join app_users a on a.email = e.email;
  end if;
  if st = 'declined' and coalesce(nullif(trim(p ->> 'decision_note'), ''), f.decision_note) is null then raise exception 'Say why it''s declined'; end if;
  if st = 'duplicate' and coalesce((p ->> 'duplicate_of')::bigint, f.duplicate_of) is null then raise exception 'Pick the report it duplicates'; end if;
  if (p ->> 'duplicate_of')::bigint = p_id then raise exception 'It can''t duplicate itself'; end if;

  update feedback set
    status        = st,
    priority      = case when p ? 'priority' then nullif(p ->> 'priority', '') else priority end,
    title         = case when p ? 'title' then nullif(trim(p ->> 'title'), '') else title end,
    edited_spec   = case when p ? 'edited_spec' then nullif(trim(p ->> 'edited_spec'), '') else edited_spec end,
    decision_note = case when p ? 'decision_note' then nullif(trim(p ->> 'decision_note'), '') else decision_note end,
    duplicate_of  = case when p ? 'duplicate_of' then (p ->> 'duplicate_of')::bigint else duplicate_of end,
    type          = case when p ? 'type' then p ->> 'type' else type end,
    module        = case when p ? 'module' then nullif(p ->> 'module', '') else module end,
    screen        = case when p ? 'screen' then nullif(p ->> 'screen', '') else screen end,
    commit_ref    = case when p ? 'commit_ref' then nullif(p ->> 'commit_ref', '') else commit_ref end,
    claude_notes  = case when p ? 'claude_notes' then nullif(p ->> 'claude_notes', '') else claude_notes end,
    approved_at   = case when st = 'approved' and f.approved_at is null then now() else approved_at end,
    approved_by   = case when st = 'approved' and f.approved_at is null then coalesce(nullif(real_email(), ''), 'claude') else approved_by end,
    ready_at      = case when st = 'ready_to_test' and f.status <> 'ready_to_test' then now() else ready_at end,
    done_at       = case when st = 'done' and f.status <> 'done' then now() else done_at end,
    updated_at    = now()
   where id = p_id returning * into f;

  if st is distinct from old then perform _fb_event(p_id, old, st, nullif(p ->> 'note', '')); end if;

  -- the reporter hears about it when asked a question (Needs info) and at Ready to test
  if st = 'needs_info' and old <> 'needs_info' and f.reporter_email is not null then
    perform _notify(array[f.reporter_email], f.ref || ': a question for you',
      left(trim(p ->> 'question'), 160) || ' · Open it to answer',
      coalesce(url, '') || '?fb=' || f.id, 'feedback_question', jsonb_build_object('feedback_id', f.id));
  end if;
  if st = 'ready_to_test' and old <> 'ready_to_test' and f.reporter_email is not null then
    perform _notify(array[f.reporter_email], f.ref || ' is ready to test',
      coalesce(f.title, left(f.details, 120)) || ' · Open it and tap Works now or Still broken',
      coalesce(url, '') || '?fb=' || f.id, 'feedback_ready', jsonb_build_object('feedback_id', f.id));
  end if;
  return to_jsonb(f);
end $$;

-- turn someone's triage switch on or off (Owners and triagers)
create or replace function set_feedback_triage(p_email text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  perform no_view_as();
  if not (is_owner() or is_feedback_triager()) then raise exception 'Only Owners and triagers can do this'; end if;
  update app_users set feedback_triage = coalesce(p_on, false), updated_at = now() where email = e and role in ('admin', 'sales', 'crew');
  if not found then raise exception '% isn''t an app user', e; end if;
  insert into events (user_email, type, note, details) values (current_email(), 'feedback_triage', e, jsonb_build_object('email', e, 'on', p_on));
  return jsonb_build_object('email', e, 'on', p_on);
end $$;

-- the brief Claude works from (also the "Copy Claude brief" button)
create or replace function feedback_brief(p_id bigint) returns text
language plpgsql stable security definer set search_path = public as $$
declare f feedback; c record; out text;
begin
  if not (is_feedback_triager() or _fb_is_service()) then raise exception 'Only triagers can do this'; end if;
  select * into f from feedback where id = p_id;
  if f.id is null then raise exception 'No such report'; end if;
  out := '# ' || f.ref || ': ' || coalesce(f.title, left(f.details, 80)) || E'\n\n'
      || '- Type: ' || f.type || ' · Status: ' || f.status || coalesce(' · Priority: ' || f.priority, '') || coalesce(' · How bad: ' || f.severity, '') || E'\n'
      || '- From: ' || coalesce(f.reporter_name, '?') || ' on ' || to_char(f.created_at at time zone 'America/Los_Angeles', 'Mon DD YYYY HH12:MI am') || E'\n'
      || '- Where: ' || coalesce(f.module, '?') || coalesce(' › ' || f.screen, '') || coalesce(' › ' || f.section, '')
      || coalesce(' · ' || f.record_type || ' ' || coalesce(f.record_label, f.record_id), '') || E'\n'
      || coalesce('- App version: ' || f.app_version || E'\n', '')
      || E'\n## Their words\n'
      || coalesce('Trying to: ' || f.what_trying || E'\n\n', '') || f.details || E'\n'
      || coalesce(E'\n## Aziz''s version (build this)\n' || f.edited_spec || E'\n', '')
      || coalesce(E'\n## Decision notes\n' || f.decision_note || E'\n', '');
  for c in select * from feedback_comments where feedback_id = p_id order by id loop
    out := out || case when c.id = (select min(id) from feedback_comments where feedback_id = p_id) then E'\n## Comments\n' else '' end
        || '- ' || coalesce(c.author_name, c.author_email) || case when c.internal then ' (internal)' else '' end || ': ' || c.body || E'\n';
  end loop;
  if (select count(*) from feedback_files where feedback_id = p_id) > 0 then
    out := out || E'\n## Pictures (feedback bucket)\n' || (select string_agg('- ' || kind || ': ' || file_path, E'\n' order by id) from feedback_files where feedback_id = p_id) || E'\n';
  end if;
  out := out || E'\n## Context\n```json\n' || jsonb_pretty(f.context) || E'\n```\n';
  return out;
end $$;

revoke all on function submit_feedback(jsonb), add_feedback_file(bigint, text, text), edit_my_feedback(bigint, jsonb),
  comment_feedback(bigint, text, boolean), feedback_verdict(bigint, boolean, text), triage_feedback(bigint, jsonb),
  set_feedback_triage(text, boolean), feedback_brief(bigint), can_see_feedback(bigint), is_feedback_triager(), _fb_can_attach(bigint) from public, anon;
grant execute on function submit_feedback(jsonb), add_feedback_file(bigint, text, text), edit_my_feedback(bigint, jsonb),
  comment_feedback(bigint, text, boolean), feedback_verdict(bigint, boolean, text), triage_feedback(bigint, jsonb),
  set_feedback_triage(text, boolean), feedback_brief(bigint), can_see_feedback(bigint), is_feedback_triager(), _fb_can_attach(bigint) to authenticated;

-- =====================================================================================================
-- 7. import: all 21 rows of the old feedback sheet; FB number = sheet row number (only if not imported already)
--    Fitted to this feature: New Feature / Change Request / blank = Idea; Bug = Bug. Sheet Priority -> Priority. Menu Item -> screen.
--    Open -> New. In Progress (row 4, waiting on CCI email access) -> Approved. Closed -> Done.
--    Production -> cultivation module. Response (+ Notes) -> decision note.
--    Reporter: Matt and Garrett by the emails Aziz gave; others matched to a login by first name when exactly one matches.
-- =====================================================================================================
insert into feedback (id, type, status, priority, module, screen, title, details, decision_note, reporter_email, reporter_name,
                      context, source, source_ref, created_at, updated_at, approved_at, approved_by, done_at)
overriding system value
select x.row_no, x.type, x.status, x.priority, x.module, x.screen, x.title, x.details, x.decision_note,
       coalesce(x.email, (select min(u.email) from app_users u where u.role in ('admin', 'sales', 'crew')
          and lower(split_part(trim(coalesce(u.display_name, '')), ' ', 1)) = lower(x.who) having count(*) = 1)),
       x.who,
       jsonb_build_object('imported_from', 'Lifted Ops Platform Feedback_Oct 2026 - LIVE.xlsx', 'sheet_row', x.row_no,
                          'sheet_status', x.sheet_status, 'sheet_implemented', x.implemented),
       'sheet', 'sheet row ' || x.row_no,
       (x.on_date::timestamp at time zone 'America/Los_Angeles'), now(),
       case when x.status in ('approved', 'done') then (x.on_date::timestamp at time zone 'America/Los_Angeles') end,
       case when x.status in ('approved', 'done') then 'aziz@lifted-organics.com' end,
       case when x.status = 'done' then (coalesce(x.resp_date, x.on_date)::timestamp at time zone 'America/Los_Angeles') end
from (values
  (1, date '2026-10-23', 'Beth', null, 'idea', 'done', 'medium', 'sales', 'Reserves', 'Back button from a customer in Reserves',
       'When I click on a customer in Reserves it takes me to their info, but there is no "back" button to the reserves home page that shows all customers. I need to refresh my page in order to go back and see all customers. Possible to add a "back" button when in a customers reserves screen?',
       'Back buttons to be implemented on the customer page in reserves, and wherever else this is an issue', 'Closed', 'Yes', date '2026-10-24'),
  (2, date '2026-10-23', 'Matt', 'matt@lifted-organics.com', 'idea', 'done', 'low', 'sales', 'Dashboard', 'Customer statement and balance on their dashboard',
       'Let''s add customer Statement their dashboard',
       'Add customer statement and current balance. Build out customer dashboard on their screen, with information like current balance, lbs left to pick up for month, etc. ', 'Closed', 'Yes', date '2026-10-24'),
  (3, date '2026-10-23', 'Matt', 'matt@lifted-organics.com', 'idea', 'done', 'low', 'sales', 'Reserves', 'Hold product for customers who get a sample',
       'Functionality to auto reserve a certain quantity if a customer receives a sample, so we don''t sell it before they have a chance to decide (maybe a 7-14 day timer)',
       'Sample designation for packages (i.e. a customer designates an order as a sample on their order with a check box, that opens a field for them to place requested MOQ to be put on hold for 10 days.) Reserve should hold for 10 days from shipping of product but should be adjustable in settings (this should be a customer level setting)

Notes: Sales-created orders skip the stock check. Orders made with New order in the app are confirmed the moment they’re created, so you can still enter a sale even if the menu says it’s short. Approving a reserve request isn’t checked against stock. Approving more than what’s open is allowed, and Free just goes negative in By strain like it does today. If you want approvals blocked too, I can add the same check there.', 'Closed', 'Yes', null::date),
  (4, date '2026-10-23', 'Matt', 'matt@lifted-organics.com', 'idea', 'approved', 'medium', 'accounting', null, 'Daily email of fulfilled orders for Accounting',
       'Let''s send an internal email alert at the end of each day with all orders fulfilled, so accounting knows to send invoices',
       'From the old sheet (In Progress): Working with CCI on 10/26 to get all the email and sharepoint permissions granted for non-lifted logins, automatic emails, and file back ups. Will have a list of daily, weekly, monthly reports, as well as ones triggered by events.', 'In Progress', 'No', null::date),
  (5, date '2026-10-23', 'Beth', null, 'idea', 'done', 'low', 'compliance', null, 'Insurance, registrations, equipment records in Compliance',
       'In future versions, it could be helpful to include insurance policies, vehicle registrations and equipment records & inspections in the compliance section',
       'Easy add. Will probably develop into more but we''ll get the basic functionality developed and then let it evolve from there. Vehicle Insurance Policies, Registrations, Maintenance Logging, Inspection Reports, and Incident Reports will be the starting point. Insurance policies and Registrations will have an upload function and camera access to record photos. Maintenance logs, inspection reports, and incident reports will all be filled out in the app and have upload and camera access to record photos.', 'Closed', 'Yes', date '2026-10-24'),
  (6, date '2026-10-24', 'Aziz', null, 'idea', 'new', 'low', 'sales', null, 'Sales catalog redesign (Mike?)',
       'Sales catalog needs a lot of work. Should we get Mike to design a template? Anything else we should get him to design?',
       null, 'Open', 'No', null::date),
  (7, date '2026-10-24', 'Aziz', null, 'idea', 'done', 'medium', 'nursery', 'Logs', 'Leachate % auto-calculates',
       'Leachate Percentage needs to auto-calculate',
       'Closed in the old sheet.', 'Closed', 'Yes', date '2026-10-24'),
  (8, date '2026-10-24', 'Aziz', null, 'idea', 'done', 'low', null, null, 'Strain card from any inventory of that strain',
       'Strain settings card should be accessible from any inventory of that strain.',
       'Closed in the old sheet.', 'Closed', 'Yes', date '2026-10-24'),
  (9, date '2026-10-24', 'Aziz', null, 'idea', 'done', 'medium', 'cultivation', 'Harvest', 'Harvests: show the 7 days after the date picked',
       'Harvests should show harvests scheduled for 7 days after the date selected, not just the date selected.',
       'Closed in the old sheet.', 'Closed', 'Yes', date '2026-10-24'),
  (10, date '2026-10-24', 'Aziz', null, 'idea', 'new', null, 'nursery', 'Logs', 'Leachate % formulas to match real recordkeeping',
       'Leachate Percentages formulas need to be put in line with actual recordkeeping practices',
       null, 'Open', 'No', null::date),
  (11, date '2026-10-25', 'Jordan', null, 'idea', 'new', 'medium', 'cultivation', 'Harvest', 'Harvest module improvements (Jordan''s Word doc)',
       'Harvest Module Improvements - Sent via word doc to Aziz',
       null, 'Open', 'No', null::date),
  (12, date '2026-10-27', 'Rama', null, 'idea', 'new', 'low', 'sales', 'Orders', 'Set one price for a whole order',
       'Set price for whole order ie. add 10 items then mark all cost $X. Found out that customers have set prices but still could be good for new/ non regular customers',
       null, 'Open', 'No', null::date),
  (13, date '2026-10-27', 'Garrett', 'garrett@lifted-organics.com', 'idea', 'new', null, 'cultivation', 'Schedule', 'Schedule broken into days; edit expected date on main screen',
       'Break up the week into individual days w/ details of each day (estimated FF lbs, plants, etc.). Enable ability to edit expected date on the main screen without having to manually enter it into individual strain windows.',
       null, 'Open', 'No', null::date),
  (14, date '2026-10-27', 'Rama', null, 'idea', 'new', 'low', 'sales', 'Orders', 'Discount option on orders',
       'Discount option',
       null, 'Open', 'No', null::date),
  (15, date '2026-10-27', 'Rama', null, 'idea', 'done', 'low', 'distribution', 'Transit', 'Manifest defaults to the driver phone number',
       'Manifest should default to phone number. I think driver phone number',
       'Closed in the old sheet.', 'Closed', 'No', null::date),
  (16, date '2026-10-27', 'Rama', null, 'idea', 'new', 'low', 'distribution', 'Transit', 'Manifest: package tags in ascending order',
       'Manifest should sort package tags into ascending order. Easier to collect correct tags and verify that correct tags are used',
       null, 'Open', 'No', null::date),
  (17, date '2026-11-03', 'Rama', null, 'bug', 'new', 'medium', 'distribution', 'Map', 'Can''t move stacked pallets to other freezers',
       'Cannot move stacked pallets to other freezers. Menu for movement doesn''t come up',
       null, 'Open', 'No', null::date),
  (18, date '2026-11-03', 'Rama', null, 'bug', 'done', 'medium', 'distribution', 'Map', 'Moving part of a stack on tablet: error and signed out',
       'When moving part of stacked pallets in tablet error msg shows and signs out',
       'Closed in the old sheet.', 'Closed', 'No', null::date),
  (19, date '2026-11-06', 'Rama', null, 'idea', 'new', 'medium', 'distribution', 'Fulfillment', 'Lois plans freezer fulfillment (multiple orders)',
       'Have Lois decide a freezer fulfilment plan, possibly for multiple orders. Variables to consider: Multiple strains in one freezer, clearing out smaller pallets, leaving short pallets behind full pallets,',
       null, 'Open', 'No', null::date),
  (20, date '2026-11-06', 'Rama', null, 'idea', 'new', 'low', 'sales', 'Orders', 'Alert when a customer places or changes an order',
       'Email update when a customer places an order or especially if customer changes an order. Currently a customers order reverts to unconfirmed when its changed but how about after its started or has been fulfilled?',
       null, 'Open', 'No', null::date),
  (21, date '2026-11-06', 'Rama', null, 'idea', 'new', 'low', 'distribution', 'Map', 'Map search card: show weight; F# vs spot labels confusing',
       'See notes for photo. Pallet info that comes up from search in map doesn''t show weight. also, in example shown it''s Pallet # Strain Location Freezer# FreezerLocation. Freezer # is F# and is easy to confuse with Freezer spot which is #LocationCode. (Imported: the photo in the sheet''s Notes didn''t come across; ask Rama to attach it.)',
       null, 'Open', 'No', null::date)
) as x(row_no, on_date, who, email, type, status, priority, module, screen, title, details, decision_note, sheet_status, implemented, resp_date)
where not exists (select 1 from feedback where source = 'sheet')
order by x.row_no;

-- app reports start after the imported numbers
select setval(pg_get_serial_sequence('feedback', 'id'), greatest((select coalesce(max(id), 0) from feedback), 1), (select count(*) > 0 from feedback));

insert into feedback_events (feedback_id, actor_email, from_status, to_status, note, created_at)
select f.id, 'import', null, f.status, 'Imported from the old feedback sheet (' || f.source_ref || ')', f.created_at
from feedback f where f.source = 'sheet' and not exists (select 1 from feedback_events e where e.feedback_id = f.id);

commit;

select 'feedback ready' as done,
       (select count(*) from feedback) as reports,
       (select count(*) from feedback where source = 'sheet' and reporter_email is null) as imported_without_login,
       (select string_agg(email, ', ') from app_users where feedback_triage) as triagers,
       (select count(*) from storage.buckets where id = 'feedback') as bucket;
