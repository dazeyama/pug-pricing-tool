CREATE OR REPLACE FUNCTION public.stale_file_load(p_filename text, p_days integer, p_rows jsonb, p_user uuid, p_min_price numeric DEFAULT 35)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  f stale_files;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  -- A user, always (decision 412): the upload is in the Changelog under their name.
  if p_user is null then raise exception 'no_user'; end if;
  if p_days is null or p_days not between 1 and 3650 then raise exception 'bad_days'; end if;
  if p_min_price is null or p_min_price not between 0 and 9999 then raise exception 'bad_min_price'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 20000 then
    raise exception 'bad_batch';
  end if;
  perform pg_advisory_xact_lock(hashtext('stale_files'));
  -- `where true`: the API may refuse a delete with no where (pg-safeupdate).
  delete from stale_products where true;
  insert into stale_products (product_id, product_name, total_qty, sell_price)
  select distinct on (btrim(r.product_id)) btrim(r.product_id), r.product_name, r.total_qty, r.sell_price
    from jsonb_to_recordset(p_rows) as r(product_id text, product_name text, total_qty integer, sell_price numeric)
   where nullif(btrim(r.product_id), '') is not null and r.product_name is not null
   order by btrim(r.product_id);
  delete from stale_files where true;
  insert into stale_files (original_filename, days, min_price, products, in_stock, uploaded_by)
  values (coalesce(nullif(btrim(p_filename), ''), 'stale cards file'), p_days, p_min_price,
          (select count(*) from stale_products), (select count(*) from stale_products where total_qty > 0), p_user)
  returning * into f;
  perform internal.settings_event(p_user, null, 'stale_file_uploaded', 'Stale cards file', '[]'::jsonb,
    format('Stale cards file uploaded: %s, %s products, %s in stock, no sale in %s days, %s and up.',
           f.original_filename, f.products, f.in_stock, f.days, money_text(f.min_price)));
  return jsonb_build_object('uploaded_at', f.uploaded_at, 'products', f.products, 'in_stock', f.in_stock);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
