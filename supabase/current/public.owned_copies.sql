CREATE OR REPLACE FUNCTION public.owned_copies(p_product_id text, p_base_keys text[], p_name_key text, p_scryfall_id text, p_finish text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with f as (
    select id, uploaded_at from master_inventory_files where is_current limit 1
  ),
  cc as (
    select count(*) as products, count(p.total_qty) as counted, sum(greatest(p.total_qty, 0)) as qty
      from cc_products p join f on p.file_id = f.id
     where p.base_key = any(coalesce(p_base_keys, '{}'))
       and p.category not like 'Art Series%'
  ),
  ours as (
    select l.scryfall_id, l.finish, l.quantity
      from buy_lines l
      join buys b on b.id = l.buy_id
      left join f on true
     where l.game = 'mtg'
       and l.name_key = p_name_key
       and l.bulk_kind is null
       and l.struck_at is null
       and ((b.kind = 'walk_in' and b.status = 'confirmed')
            or (b.kind = 'collection' and b.status in ('paid', 'completed')))
       and not exists (select 1 from buy_lines c where c.source_line_id = l.id)
       and ((l.cc_status is null and l.completed_at is null and b.status <> 'completed')
            or (l.cc_status = 'exported' and l.cc_exported_at > f.uploaded_at))
  )
  select jsonb_build_object(
    'cc_printing', (select case when p.total_qty is not null then greatest(p.total_qty, 0) end from cc_products p join f on p.file_id = f.id where p.product_id = p_product_id),
    'cc_card', (select case when not exists (select 1 from f) or (cc.products > 0 and cc.counted = 0) then null
                            else coalesce(cc.qty, 0) end from cc),
    'ours_printing', (select coalesce(sum(o.quantity), 0) from ours o
                       where o.scryfall_id = p_scryfall_id and o.finish = p_finish),
    'ours_card', (select coalesce(sum(o.quantity), 0) from ours o),
    'inventory_at', (select f.uploaded_at from f))
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
