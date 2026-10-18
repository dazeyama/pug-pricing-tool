CREATE OR REPLACE FUNCTION public.global_search(p_name text, p_number text, p_size integer, p_set text, p_all boolean DEFAULT false, p_struck boolean DEFAULT false)
 RETURNS TABLE(line_id uuid, buy_id uuid, kind text, status text, customer_name text, paid_method text, confirmed_at timestamp with time zone, confirmed_by uuid, created_at timestamp with time zone, buy_number integer, game text, lang text, name text, name_en text, set_code text, collector_number text, finish text, first_edition boolean, treatments jsonb, condition text, quantity integer, image_url text, completed boolean, collection_kind text, bulk_kind text, struck_at timestamp with time zone, struck_by uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with q as (
    select '%' || replace(replace(replace(lower(btrim(coalesce(p_name, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           btrim(coalesce(p_name, '')) = '' as any_name
  ),
  hits as (
    select l.id as line_id, l.buy_id, b.kind, b.status, b.customer_name, b.paid_method,
           b.confirmed_at, b.confirmed_by, b.created_at, l.game, l.lang, l.name, l.name_en, l.set_code,
           l.collector_number, l.finish, l.first_edition, l.treatments, l.condition, l.quantity, l.image_url,
           -- A struck card is never completed itself: in a walk-in buy it reads as its game
           -- does, Completed once no live card of that game is left to export (0067).
           case when l.struck_at is null or b.kind <> 'walk_in' then l.completed_at is not null
                else not exists (select 1 from buy_lines y
                                  where y.buy_id = l.buy_id and y.game = l.game and y.completed_at is null
                                    and y.bulk_kind is null and y.struck_at is null)
           end as completed,
           case when b.kind = 'collection' then
             case when b.system_key is not null then 'system' when b.project then 'project' else 'collection' end
           end as collection_kind,
           l.bulk_kind, l.struck_at, l.struck_by,
           coalesce(b.confirmed_at, b.created_at) as newest, l.position
      from buy_lines l
      join buys b on b.id = l.buy_id
      cross join q
     where ((b.kind = 'walk_in' and b.status = 'confirmed' and (p_all or l.completed_at is null))
         or (b.kind = 'collection'
             and (b.status = 'paid' or (p_all and b.status in ('processing', 'priced', 'completed', 'rejected')))))
       and (l.bulk_kind is null or l.bulk_kind like '%placeholder')   -- placeholders by their name
       and (l.struck_at is null or p_struck)   -- struck: moved elsewhere; Show all finds it, marked (0067)
       and (q.any_name or l.name_key like q.pat or lower(coalesce(l.name_en, '')) like q.pat)
       and (p_number is null or norm_number(l.collector_number) = norm_number(p_number))
       and (p_size is null or l.printed_size = p_size)
       and (p_set is null or lower(l.set_code) = lower(btrim(p_set)))
     order by newest desc, l.buy_id, l.position
     limit 200
  )
  select h.line_id, h.buy_id, h.kind, h.status, h.customer_name, h.paid_method,
         h.confirmed_at, h.confirmed_by, h.created_at,
         case when h.kind = 'walk_in' then (select buy_number(x) from buys x where x.id = h.buy_id) end,
         h.game, h.lang, h.name, h.name_en, h.set_code, h.collector_number, h.finish,
         h.first_edition, h.treatments, h.condition, h.quantity, h.image_url, h.completed,
         h.collection_kind, h.bulk_kind, h.struck_at, h.struck_by
    from hits h
   order by h.newest desc, h.buy_id, h.position
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
