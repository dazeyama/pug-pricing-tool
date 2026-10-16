CREATE OR REPLACE FUNCTION public.cant_upload_note()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select 'Cards that couldn''t be matched to a Crystal Commerce product during an export. Pull them out of the '
      || 'upload batch. They stay here until they''re exported from here or deleted.';
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
