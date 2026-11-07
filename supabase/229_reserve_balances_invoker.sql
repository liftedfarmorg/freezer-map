-- 229: FIX (run live Nov 6). 227 re-created reserve_balances without (security_invoker = true), so the view ran
-- with its owner's rights, skipped the row-level security on reserves, and every customer in the portal saw all
-- customers' reserves (e.g. "69,000 lbs remaining"). Put the setting back. 227 is corrected too, so a re-run
-- keeps it. Any future "create or replace view reserve_balances" must say with (security_invoker = true).
alter view reserve_balances set (security_invoker = true);
