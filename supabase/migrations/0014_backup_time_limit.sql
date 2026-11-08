-- F2, the backup's 8 s statement limit (decision 577; decision 430 reopened it).
--
-- The signed-in role stops a statement after 8 s (statement_timeout=8s on `authenticated`), and Download backup's
-- one call to backup_export took 2.3 to 9 s on dev: the store hit it at work. The fix keeps the one call, so the
-- file is still one read at one instant (decision 430: a paged read could leave cards out of it in silence).
--
-- 1. backup_export builds its file as json, not jsonb: the same rows, in the same order, with the same values
--    (checked on dev against the old one, table by table), in 0.5 to 0.7 s instead of 2.4 to 5.7 s. Nesting
--    megabytes of jsonb in jsonb_build_object was the cost; json is put together as text. Only the events still go
--    through jsonb, to leave out the Changelog's search copies. Its return type changes, so it's dropped and made
--    again (its grants go with the drop and are given back below).
-- 2. backup_export and restore_backup each carry their own limit of 60 s (`set statement_timeout`), which the API
--    applies to that call alone (checked on dev: a function with its own limit ran past its role's). 60 s is under
--    the 100 s the API waits for an answer and the app's 120 s for these two calls (timedFetch.js LONG_CALLS).
--    Every other call keeps the role's 8 s.

drop function public.backup_export();

create function public.backup_export()
returns json
language sql
stable
set search_path = public, internal
set statement_timeout = '60s'
as $$
  select json_build_object(
    'format', 'pug-pricing-backup',
    'version', 1,
    'exported_at', now(),
    'tables', json_build_object(
      'staff_users', coalesce((select json_agg(t order by t.created_at, t.id) from staff_users t), '[]'),
      'devices',     coalesce((select json_agg(t order by t.id) from devices t), '[]'),
      'buys',        coalesce((select json_agg(t order by t.created_at, t.id) from buys t), '[]'),
      'buy_lines',   coalesce((select json_agg(t order by t.buy_id, t.position, t.id) from buy_lines t), '[]'),
      'events',      coalesce((select json_agg(to_jsonb(t) - 'search_text' - 'search_digits' order by t.seq)
                                 from events t), '[]'),
      'settings',    coalesce((select json_agg(t order by t.key) from settings t), '[]'),
      -- The matches staff taught (decision 348).
      'cc_set_map',       coalesce((select json_agg(t order by t.scryfall_set, t.promo_kind) from cc_set_map t), '[]'),
      'cc_product_links', coalesce((select json_agg(t order by t.scryfall_id, t.finish) from cc_product_links t), '[]'),
      'import_links',     coalesce((select json_agg(t order by t.key) from import_links t), '[]')))
$$;

revoke execute on function public.backup_export() from public, anon;
grant execute on function public.backup_export() to authenticated, service_role;

alter function public.restore_backup(jsonb, text, uuid, uuid, text) set statement_timeout = '60s';
