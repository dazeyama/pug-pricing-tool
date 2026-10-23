CREATE OR REPLACE FUNCTION public.owned_copies(p_product_id text, p_base_keys text[], p_name_key text, p_scryfall_id text, p_finish text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with f as (
    select id, uploaded_at from master_inventory_files where is_current limit 1
  ),
  -- The card's products: those of its names, and the printing's own even when staff linked it at export to one
  -- filed under another name (its count is the printing's, so it's the card's too).
  card_products as (
    select p.product_id, p.category, p.product_name, p.total_qty
      from cc_products p join f on p.file_id = f.id
     where p.product_id = p_product_id
        or (p.base_key = any(coalesce(p_base_keys, '{}')) and p.category not like 'Art Series%')
  ),
  cc as (
    select count(*) as products, count(p.total_qty) as counted, sum(greatest(p.total_qty, 0)) as qty
      from card_products p
  ),
  ours as (
    select l.scryfall_id, l.finish, l.quantity, upper(l.set_code) as set_code, l.set_name, l.collector_number
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
    -- Which printings those are (the owner: "it has to show specifically, which printings we own"), most first:
    'cc_list', (select coalesce(jsonb_agg(jsonb_build_object(
                         'product_id', p.product_id, 'category', p.category, 'name', p.product_name, 'qty', p.total_qty,
                         'this', p.product_id is not distinct from p_product_id)
                       order by p.total_qty desc, p.category, p.product_name, p.product_id), '[]'::jsonb)
                  from card_products p
                 where p.total_qty > 0),
    'ours_list', (select coalesce(jsonb_agg(jsonb_build_object(
                           'scryfall_id', x.scryfall_id, 'set_code', x.set_code, 'set_name', x.set_name,
                           'number', x.collector_number, 'finish', x.finish, 'qty', x.qty,
                           'this', coalesce(x.scryfall_id = p_scryfall_id and x.finish = p_finish, false))
                         -- Collector numbers as numbers: 9 before 10.
                         order by x.qty desc, x.set_code, nullif(substring(x.collector_number from '^[0-9]+'), '')::int,
                                  x.collector_number, x.finish, x.scryfall_id), '[]'::jsonb)
                    from (select o.scryfall_id, o.set_code, max(o.set_name) as set_name, o.collector_number, o.finish,
                                 sum(o.quantity) as qty
                            from ours o
                           group by o.scryfall_id, o.set_code, o.collector_number, o.finish) x),
    'inventory_at', (select f.uploaded_at from f))
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
