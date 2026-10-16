CREATE OR REPLACE FUNCTION public.cc_products_search(p_text text, p_limit integer DEFAULT 30)
 RETURNS TABLE(product_id text, cc_id text, product_name text, category text, base_key text, bracket text, foil_kind text, variants text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with q as (
    select '%' || replace(replace(replace(lower(btrim(coalesce(p_text, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select p.product_id, p.cc_id, p.product_name, p.category, p.base_key, p.bracket, p.foil_kind, p.variants
    from cc_products p, q
   where p.file_id = cc_current_file()
     and length(btrim(coalesce(p_text, ''))) >= 2
     and (p.base_key like q.pat or lower(p.product_name) like q.pat)
   order by length(p.product_name), p.product_name
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
