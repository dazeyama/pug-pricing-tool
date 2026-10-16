CREATE OR REPLACE FUNCTION internal.collection_event(b buys, p_user uuid, p_device uuid, p_action text, p_games text[], p_added integer, p_removed integer, p_totals jsonb, p_lines jsonb, p_fields jsonb, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, removed, totals, lines, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'collection', p_action,
          b.id, b.customer_name, coalesce(p_games, '{}'), coalesce(p_added, 0), coalesce(p_removed, 0),
          p_totals, coalesce(p_lines, '[]'::jsonb), coalesce(p_fields, '[]'::jsonb), coalesce(p_summary, ''));
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
