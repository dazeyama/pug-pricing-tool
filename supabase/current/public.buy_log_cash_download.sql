CREATE OR REPLACE FUNCTION public.buy_log_cash_download(p_month date, p_user uuid, p_device uuid, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user staff_users;
  v_month date := date_trunc('month', p_month)::date;
begin
  if p_user is null then raise exception 'no_user'; end if;
  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', 'cash_buys_downloaded',
    p_target_name => 'Cash buys · ' || to_char(v_month, 'FMMonth YYYY'), p_day => v_month, p_summary => p_summary);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
