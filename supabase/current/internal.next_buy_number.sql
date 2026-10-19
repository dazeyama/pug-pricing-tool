CREATE OR REPLACE FUNCTION internal.next_buy_number()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  -- One confirm at a time takes a number: held till its save ends (decision 349).
  perform pg_advisory_xact_lock(hashtext('pug.buys.number'));
  return greatest(coalesce((select max(number) from buys), 0),
                  (select case when is_called then last_value else last_value - 1 end from buys_number_seq)) + 1;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
