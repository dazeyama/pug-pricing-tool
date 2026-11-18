CREATE OR REPLACE FUNCTION public.tcg_catalog_finish(p_group_ids integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_group_ids is null or cardinality(p_group_ids) = 0 then raise exception 'bad_batch'; end if;
  delete from tcg_groups where group_id <> all (p_group_ids);
  update tcg_groups set checked_at = now() where true;
  -- A product that moved to another group keeps its newest group's count right.
  update tcg_groups t set products = c.n
    from (select g.group_id, count(p.product_id)::integer as n
            from tcg_groups g left join tcg_products p on p.group_id = g.group_id
           group by g.group_id) c
   where c.group_id = t.group_id and t.products is distinct from c.n;
  return jsonb_build_object('checked_at', now(), 'groups', (select count(*) from tcg_groups),
                            'products', (select count(*) from tcg_products));
end;
$function$;

-- Granted: {postgres=X/postgres,service_role=X/postgres}
