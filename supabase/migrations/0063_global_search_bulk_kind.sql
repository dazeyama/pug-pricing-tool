-- The header search says which lines are placeholders (FABLE_REPORT A1).
-- global_search returned no bulk_kind, so the app guessed a placeholder from
-- its set code (BULK). Now it's one more column at the end, bulk_kind (only
-- placeholders: other bulk is never found). Nothing else changes. A function's
-- result can't change in place, so it's dropped and made again, with its
-- grants as they were: the signed-in app and the server, nobody else.

drop function public.global_search(text, text, integer, text, boolean);

CREATE OR REPLACE FUNCTION public.global_search(p_name text, p_number text, p_size integer, p_set text, p_all boolean DEFAULT false)
 RETURNS TABLE(line_id uuid, buy_id uuid, kind text, status text, customer_name text, paid_method text, confirmed_at timestamp with time zone, confirmed_by uuid, created_at timestamp with time zone, buy_number integer, game text, lang text, name text, name_en text, set_code text, collector_number text, finish text, first_edition boolean, treatments jsonb, condition text, quantity integer, image_url text, completed boolean, collection_kind text, bulk_kind text)
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
           l.completed_at is not null as completed,
           case when b.kind = 'collection' then
             case when b.system_key is not null then 'system' when b.project then 'project' else 'collection' end
           end as collection_kind,
           l.bulk_kind,
           coalesce(b.confirmed_at, b.created_at) as newest, l.position
      from buy_lines l
      join buys b on b.id = l.buy_id
      cross join q
     where ((b.kind = 'walk_in' and b.status = 'confirmed' and (p_all or l.completed_at is null))
         or (b.kind = 'collection'
             and (b.status = 'paid' or (p_all and b.status in ('processing', 'priced', 'completed', 'rejected')))))
       and (l.bulk_kind is null or l.bulk_kind like '%placeholder')   -- placeholders by their name
       and l.struck_at is null   -- struck: moved elsewhere
       and (q.any_name or l.name_key like q.pat or lower(coalesce(l.name_en, '')) like q.pat)
       and (p_number is null or norm_number(l.collector_number) = norm_number(p_number))
       and (p_size is null or l.printed_size = p_size)
       and (p_set is null or lower(l.set_code) = lower(btrim(p_set)))
     order by newest desc, l.buy_id, l.position
     limit 200
  )
  select h.line_id, h.buy_id, h.kind, h.status, h.customer_name, h.paid_method,
         h.confirmed_at, h.confirmed_by, h.created_at,
         case when h.kind = 'walk_in' then (
           select count(*)::integer from buys x
            where x.kind = 'walk_in' and x.status = 'confirmed'
              and (x.confirmed_at at time zone 'America/Los_Angeles')::date
                = (h.confirmed_at at time zone 'America/Los_Angeles')::date
              and (x.confirmed_at, x.id) <= (h.confirmed_at, h.buy_id)
              and exists (select 1 from buy_lines y where y.buy_id = x.id and y.game = h.game))
         end,
         h.game, h.lang, h.name, h.name_en, h.set_code, h.collector_number, h.finish,
         h.first_edition, h.treatments, h.condition, h.quantity, h.image_url, h.completed,
         h.collection_kind, h.bulk_kind
    from hits h
   order by h.newest desc, h.buy_id, h.position
$function$;

revoke execute on function public.global_search(text, text, integer, text, boolean) from public, anon;
grant execute on function public.global_search(text, text, integer, text, boolean) to authenticated, service_role;
