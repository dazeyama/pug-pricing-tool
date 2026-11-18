CREATE OR REPLACE FUNCTION public.tcg_group_load(p_group jsonb, p_products jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  g integer := (p_group ->> 'groupId')::integer;
  n integer;
begin
  if g is null or nullif(btrim(p_group ->> 'name'), '') is null then raise exception 'bad_group'; end if;
  if jsonb_typeof(p_products) is distinct from 'array' or jsonb_array_length(p_products) > 20000 then
    raise exception 'bad_batch';
  end if;
  -- checked_at is left alone: only a finished pass sets it (tcg_catalog_finish).
  insert into tcg_groups (group_id, name, abbreviation, is_supplemental, published_on, modified_on, fetched_at)
  values (g, p_group ->> 'name', nullif(p_group ->> 'abbreviation', ''), (p_group ->> 'isSupplemental')::boolean,
          (p_group ->> 'publishedOn')::timestamp, p_group ->> 'modifiedOn', now())
  on conflict (group_id) do update set
    name = excluded.name, abbreviation = excluded.abbreviation, is_supplemental = excluded.is_supplemental,
    published_on = excluded.published_on, modified_on = excluded.modified_on, fetched_at = excluded.fetched_at;
  delete from tcg_products where group_id = g;
  -- A product TCGplayer moved here from another group is taken over (its id is its key).
  insert into tcg_products (product_id, group_id, name, number)
  select distinct on (r.product_id) r.product_id, g, r.name, nullif(btrim(r.number), '')
    from jsonb_to_recordset(p_products) as r(product_id integer, name text, number text)
   where r.product_id is not null and r.name is not null
   order by r.product_id
  on conflict (product_id) do update set group_id = excluded.group_id, name = excluded.name, number = excluded.number;
  select count(*) into n from tcg_products where group_id = g;
  update tcg_groups set products = n where group_id = g;
  return n;
end;
$function$;

-- Granted: {postgres=X/postgres,service_role=X/postgres}
