CREATE OR REPLACE FUNCTION internal.settings_event(p_user uuid, p_device uuid, p_action text, p_target text, p_fields jsonb, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'app', p_action,
    p_target_name => p_target, p_fields => coalesce(p_fields, '[]'::jsonb), p_summary => coalesce(p_summary, ''));
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
