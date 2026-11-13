-- 352_feedback_stale_7_days.sql  (Msg FB-14, 11/12)
-- Aziz: In progress reports go back to Approved after 7 days with nothing happening (was 3, SQL 351).
-- Only the setting changes; feedback_stale_sweep reads it each run. Safe to run more than once.
insert into app_settings values ('feedback.stale_days', '7')
on conflict (key) do update set value = '7';
