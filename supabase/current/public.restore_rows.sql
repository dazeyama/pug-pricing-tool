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
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER'
     -- Only the backup's own columns: one added since takes its default (decision 348).
     and exists (select 1 from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r where r ? column_name);
  if v_cols is null then
    return 0;   -- no rows
  end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) %s',
                 p_table, v_cols, v_cols, p_table, p_conflict)
    using coalesce(p_rows, '[]'::jsonb);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Granted: {postgres=X/postgres,service_role=X/postgres}
