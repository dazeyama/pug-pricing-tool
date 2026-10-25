-- master_inventory_abort retired (owner, 2026-10-24; decision 515): nothing has called it since decision 414,
-- when an unfinished upload began to be cleared by master_inventory_prune(<its id>), a batch at a time. It was
-- one of the functions that run with the owner's rights, so it goes rather than staying open to the app.
-- Its test-run checks go with it; prune's own checks cover both of its cases (an unfinished upload goes, the
-- current file never does).

drop function public.master_inventory_abort(uuid);
