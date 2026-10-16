CREATE OR REPLACE FUNCTION internal.buy_event(b buys, p_user uuid, p_device uuid, p_action text, p_target text, p_games text[], p_removed integer, p_totals jsonb, p_lines jsonb, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, removed, totals, lines, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', p_action, b.id, p_target,
          coalesce(p_games, '{}'), coalesce(p_removed, 0), p_totals,
          coalesce(p_lines, '[]'::jsonb), coalesce(p_summary, ''));
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
