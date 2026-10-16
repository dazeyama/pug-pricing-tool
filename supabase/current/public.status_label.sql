CREATE OR REPLACE FUNCTION public.status_label(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case p when 'processing' then 'Processing' when 'priced' then 'Priced'
                when 'paid' then 'Paid/Ours' when 'completed' then 'Completed'
                when 'rejected' then 'Rejected' else p end
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
