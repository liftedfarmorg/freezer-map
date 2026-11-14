-- 355 (Msg REQ-ADMIN-1): Sales Admins can approve and decline reserve requests again.
-- 024 made approving a Sales Admin job, but 150 (portal redesign) rewrote decide_reserve_requests and
-- request_decision_notification with the old is_admin() check, which means "has the Admin module".
-- So a Sales Admin without the Admin module (Nikki) saw the buttons but the save was refused.
-- This swaps the check in the live functions to: Sales Admin, or anyone with the Admin module (nobody loses access).
-- Safe to run more than once.

do $$
declare f text; def text;
begin
  foreach f in array array['decide_reserve_requests(jsonb,text)', 'request_decision_notification(integer[])'] loop
    def := pg_get_functiondef(f::regprocedure);
    def := replace(def, 'if not is_admin() then', 'if not (is_sales_admin() or is_admin()) then');
    def := replace(def, 'Only an Admin can approve reserve changes', 'Only a Sales Admin can approve reserve changes');
    execute def;
  end loop;
end $$;

-- check: both lines should say true
select p.proname, pg_get_functiondef(p.oid) like '%is_sales_admin() or is_admin()%' as sales_admin_ok
  from pg_proc p where p.proname in ('decide_reserve_requests', 'request_decision_notification');
