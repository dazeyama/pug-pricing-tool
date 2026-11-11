CREATE OR REPLACE FUNCTION public.stale_cards()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', s.product_id, 'product_name', s.product_name, 'category', p.category,
           'total_qty', s.total_qty, 'sell_price', s.sell_price)
         order by s.product_name, p.category, s.product_id), '[]'::jsonb)
    from stale_products s
   cross join stale_files sf
    join cc_products p on p.file_id = cc_current_file() and p.product_id = s.product_id
   where s.total_qty > 0
     and not exists (select 1 from buy_lines l
                      where l.cc_product_id = s.product_id
                        and l.cc_exported_at >= sf.uploaded_at - make_interval(days => sf.days))
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
