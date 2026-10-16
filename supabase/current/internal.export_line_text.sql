CREATE OR REPLACE FUNCTION internal.export_line_text(l buy_lines, p_qty integer DEFAULT NULL::integer)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select concat_ws(' ',
    coalesce(p_qty, l.quantity) || ' ' || coalesce(l.name_en, l.name) || ' (' || l.set_code || ') ' || l.collector_number,
    case l.finish when 'foil' then '*F*' when 'etched' then '*E*' end,
    case when l.condition <> 'NM' then '[' || l.condition || ']' end);
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
