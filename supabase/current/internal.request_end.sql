CREATE OR REPLACE FUNCTION internal.request_end(p_request uuid, p_result text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
begin
  if p_request is null then
    return;
  end if;
  insert into internal.done_requests (id, result) values (p_request, p_result) on conflict (id) do nothing;
  delete from internal.done_requests where done_at < now() - interval '1 day';
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
