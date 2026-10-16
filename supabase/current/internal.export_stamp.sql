CREATE OR REPLACE FUNCTION internal.export_stamp(p_matches jsonb, p_file uuid, p_sku text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  update buy_lines l set
    cc_status       = 'exported',
    cc_product_id   = p.product_id,
    cc_product_name = p.product_name,
    cc_category     = p.category,
    cc_condition    = cc_condition_word(l.condition),
    cc_sell_price   = round((e ->> 'sell_price')::numeric, 2),
    cc_sell_basis   = e -> 'sell_basis',
    cc_custom_sku   = p_sku,
    cc_exported_at  = now()
  from jsonb_array_elements(p_matches) e
  join cc_products p on p.file_id = p_file and p.product_id = e ->> 'product_id'
  where l.id = (e ->> 'line_id')::uuid;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
