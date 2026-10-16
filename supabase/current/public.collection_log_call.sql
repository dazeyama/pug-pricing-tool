CREATE OR REPLACE FUNCTION public.collection_log_call(p_buy_id uuid, p_user uuid, p_device uuid, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b buys;
begin
  if p_user is null then raise exception 'no_user'; end if;
  select * into b from buys where id = p_buy_id and kind = 'collection';
  if b.id is null then raise exception 'collection_gone'; end if;
  perform internal.collection_event(b, p_user, p_device, 'collection_called', '{}', 0, 0, null, '[]', '[]', p_summary);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
