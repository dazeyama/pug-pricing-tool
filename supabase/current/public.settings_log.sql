CREATE OR REPLACE FUNCTION public.settings_log(p_user uuid, p_device uuid, p_action text, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  if p_user is null or not exists (select 1 from staff_users where id = p_user) then raise exception 'no_user'; end if;
  if p_action is null or p_action not in ('justtcg_key_saved', 'justtcg_key_removed', 'cc_match_forgotten') then
    raise exception 'bad_action';
  end if;
  perform internal.settings_event(p_user, p_device, p_action,
    case when p_action = 'cc_match_forgotten' then 'Crystal Commerce matching' else 'API keys' end,
    '[]'::jsonb, left(coalesce(p_summary, ''), 300));
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
