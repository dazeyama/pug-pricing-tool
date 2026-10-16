CREATE OR REPLACE FUNCTION public.cc_products_by_id(p_ids text[])
 RETURNS TABLE(product_id text, cc_id text, product_name text, category text, base_key text, bracket text, foil_kind text, variants text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select product_id, cc_id, product_name, category, base_key, bracket, foil_kind, variants
    from cc_products
   where file_id = cc_current_file() and product_id = any(p_ids)
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
