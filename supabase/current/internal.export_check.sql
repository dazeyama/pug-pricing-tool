CREATE OR REPLACE FUNCTION internal.export_check(p_lines uuid[], p_matches jsonb, p_cant uuid[], p_file uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_given uuid[];
begin
  select array_agg(x) into v_given from (
    select (e ->> 'line_id')::uuid as x from jsonb_array_elements(p_matches) e
    union all
    select unnest(p_cant)) s;
  if p_lines is null or v_given is null
     or array_length(v_given, 1) <> (select count(distinct x) from unnest(v_given) x)
     or not (v_given @> p_lines and p_lines @> v_given) then
    raise exception 'stale_version';
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) e
              where not exists (select 1 from cc_products p
                                 where p.file_id = p_file and p.product_id = e ->> 'product_id')) then
    raise exception 'stale_inventory';
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) e
              where (e ->> 'sell_price') is null or (e ->> 'sell_price')::numeric < 0.40) then
    raise exception 'bad_price';
  end if;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
