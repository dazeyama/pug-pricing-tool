CREATE OR REPLACE FUNCTION public.backup_export()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select jsonb_build_object(
    'format', 'pug-pricing-backup',
    'version', 1,
    'exported_at', now(),
    'tables', jsonb_build_object(
      'staff_users', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from staff_users t), '[]'),
      'devices',     coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from devices t), '[]'),
      'buys',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from buys t), '[]'),
      'buy_lines',   coalesce((select jsonb_agg(to_jsonb(t) order by t.buy_id, t.position, t.id) from buy_lines t), '[]'),
      'events',      coalesce((select jsonb_agg(to_jsonb(t) - 'search_text' - 'search_digits' order by t.seq) from events t), '[]'),
      'settings',    coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from settings t), '[]'),
      -- The matches staff taught (decision 348).
      'cc_set_map',       coalesce((select jsonb_agg(to_jsonb(t) order by t.scryfall_set, t.promo_kind) from cc_set_map t), '[]'),
      'cc_product_links', coalesce((select jsonb_agg(to_jsonb(t) order by t.scryfall_id, t.finish) from cc_product_links t), '[]'),
      'import_links',     coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from import_links t), '[]')))
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
