CREATE OR REPLACE FUNCTION public.cc_products_load(p_file_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from master_inventory_files where id = p_file_id and not is_current) then
    raise exception 'upload_gone';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'bad_batch';
  end if;
  insert into cc_products (file_id, product_id, cc_id, product_name, category, base_key, bracket,
                           foil_kind, variants, catalog_path)
  select p_file_id, r.product_id, r.cc_id, r.product_name, coalesce(r.category, ''), coalesce(r.base_key, ''),
         r.bracket, r.foil_kind, coalesce(r.variants, '{}'), coalesce(r.catalog_path, '')
    from jsonb_to_recordset(p_rows) as r(product_id text, cc_id text, product_name text, category text,
                                         base_key text, bracket text, foil_kind text, variants text[],
                                         catalog_path text)
   where r.product_id is not null and r.product_name is not null
  on conflict (file_id, product_id) do update
     set cc_id = excluded.cc_id, product_name = excluded.product_name, category = excluded.category,
         base_key = excluded.base_key, bracket = excluded.bracket, foil_kind = excluded.foil_kind,
         variants = excluded.variants, catalog_path = excluded.catalog_path;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
