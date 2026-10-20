CREATE OR REPLACE FUNCTION internal.request_begin(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  v internal.done_requests;
begin
  if p_request is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('pug.request'), hashtext(p_request::text));
  select * into v from internal.done_requests where id = p_request;
  return case when v.id is null then null else jsonb_build_object('result', v.result) end;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
