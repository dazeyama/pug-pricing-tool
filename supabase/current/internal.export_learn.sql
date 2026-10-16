CREATE OR REPLACE FUNCTION internal.export_learn(p_matches jsonb, p_set_maps jsonb, p_file uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  insert into cc_product_links (scryfall_id, finish, product_id, product_name, category, source, linked_at, linked_by)
  select distinct on (l.scryfall_id, l.finish)
         l.scryfall_id, l.finish, p.product_id, p.product_name, p.category, e ->> 'link', now(), p_user
    from jsonb_array_elements(p_matches) e
    join buy_lines l on l.id = (e ->> 'line_id')::uuid
    join cc_products p on p.file_id = p_file and p.product_id = e ->> 'product_id'
   where e ->> 'link' in ('staff', 'auto')
     and l.scryfall_id is not null and l.finish in ('nonfoil', 'foil', 'etched')
   order by l.scryfall_id, l.finish, (e ->> 'link') = 'staff' desc
  on conflict (scryfall_id, finish) do update set
    product_id = excluded.product_id, product_name = excluded.product_name, category = excluded.category,
    source = excluded.source, linked_at = excluded.linked_at, linked_by = excluded.linked_by;
  insert into cc_set_map (scryfall_set, promo_kind, category, source, updated_at, updated_by)
  select distinct on (lower(s ->> 'scryfall_set'), coalesce(s ->> 'promo_kind', ''))
         lower(s ->> 'scryfall_set'), coalesce(s ->> 'promo_kind', ''), s ->> 'category', 'staff', now(), p_user
    from jsonb_array_elements(coalesce(p_set_maps, '[]'::jsonb)) s
   where coalesce(s ->> 'scryfall_set', '') <> ''
     and coalesce(s ->> 'promo_kind', '') in ('', 'prerelease', 'promopack')
     and exists (select 1 from cc_products p where p.file_id = p_file and p.category = s ->> 'category')
  on conflict (scryfall_set, promo_kind) do update set
    category = excluded.category, source = 'staff', updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
