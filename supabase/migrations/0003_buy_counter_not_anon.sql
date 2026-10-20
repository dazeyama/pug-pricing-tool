-- The buy number counter isn't open to the signed-out role (decision 379). 0071 made
-- buys_number_seq under Supabase's default privileges for `public`, which grant select,
-- update and usage on a new sequence to anon as well as to the app's roles. Nothing
-- exposes it to anon (no function runs signed out), but the grant has no reason to exist;
-- events_seq_seq never had it. Seen in the squash's baseline read (2026-10-19).
revoke all on sequence public.buys_number_seq from anon;
