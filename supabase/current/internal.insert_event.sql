CREATE OR REPLACE FUNCTION internal.insert_event(p_user uuid, p_user_name text, p_user_color text, p_device uuid, p_kind text, p_action text, p_target_id uuid DEFAULT NULL::uuid, p_target_name text DEFAULT NULL::text, p_games text[] DEFAULT '{}'::text[], p_added integer DEFAULT 0, p_removed integer DEFAULT 0, p_totals jsonb DEFAULT NULL::jsonb, p_lines jsonb DEFAULT '[]'::jsonb, p_fields jsonb DEFAULT '[]'::jsonb, p_summary text DEFAULT ''::text, p_day date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, removed, totals, lines, fields, summary, day)
  values (p_user, p_user_name, p_user_color, p_device, p_kind, p_action,
          p_target_id, p_target_name, coalesce(p_games, '{}'), coalesce(p_added, 0), coalesce(p_removed, 0),
          p_totals, coalesce(p_lines, '[]'::jsonb), coalesce(p_fields, '[]'::jsonb), coalesce(p_summary, ''), p_day);
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
