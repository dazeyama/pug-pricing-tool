CREATE OR REPLACE FUNCTION internal.collection_event(b buys, p_user uuid, p_device uuid, p_action text, p_games text[], p_added integer, p_removed integer, p_totals jsonb, p_lines jsonb, p_fields jsonb, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'collection', p_action,
    p_target_id => b.id, p_target_name => b.customer_name, p_games => p_games, p_added => p_added,
    p_removed => p_removed, p_totals => p_totals, p_lines => p_lines, p_fields => p_fields, p_summary => p_summary);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
