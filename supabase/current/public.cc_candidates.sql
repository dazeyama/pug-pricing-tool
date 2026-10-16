CREATE OR REPLACE FUNCTION public.cc_candidates(p_wants jsonb)
 RETURNS TABLE(key text, product_id text, cc_id text, product_name text, category text, base_key text, bracket text, foil_kind text, variants text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select w.key, p.product_id, p.cc_id, p.product_name, p.category, p.base_key, p.bracket, p.foil_kind, p.variants
    from jsonb_to_recordset(p_wants) as w(key text, category text, base_keys text[])
    join cc_products p
      on p.file_id = cc_current_file()
     and p.base_key = any(w.base_keys)
     and (w.category is null or p.category = w.category)
   order by w.key, p.category, p.product_name
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
