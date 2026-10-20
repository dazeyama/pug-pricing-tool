CREATE OR REPLACE FUNCTION internal.buy_event(b buys, p_user uuid, p_device uuid, p_action text, p_target text, p_games text[], p_removed integer, p_totals jsonb, p_lines jsonb, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', p_action,
    p_target_id => b.id, p_target_name => p_target, p_games => p_games, p_removed => p_removed,
    p_totals => p_totals, p_lines => p_lines, p_summary => p_summary);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
