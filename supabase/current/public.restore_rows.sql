CREATE OR REPLACE FUNCTION public.restore_rows(p_table text, p_rows jsonb, p_conflict text DEFAULT ''::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_cols text;
  v_count integer;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER';
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) %s',
                 p_table, v_cols, v_cols, p_table, p_conflict)
    using coalesce(p_rows, '[]'::jsonb);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Granted: {postgres=X/postgres,service_role=X/postgres}
