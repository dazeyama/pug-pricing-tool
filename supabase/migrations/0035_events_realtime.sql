-- The changelog live on every computer (owner, 2026-10-02): events joins the
-- Realtime publication (0002 left it out), so Home's Recent activity and the
-- Changelog update the moment something happens, not only on a reload.
alter publication supabase_realtime add table public.events;
