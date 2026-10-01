-- The header search shows Paid/Ours only by default (owner, 2026-09-30):
-- walk-in cards not yet exported, and Paid/Ours collections. Its "Show all"
-- toggle (p_all) adds every other status: Processing, Priced and Completed
-- collections, and exported (Completed) walk-in cards. Drafts never show.
-- Each line also says whether it's an exported walk-in card (completed).
-- A new parameter and column, so the function is dropped and made again.

drop function public.global_search(text, text, integer, text);

create function public.global_search(
  p_name   text,
  p_number text,
  p_size   integer,
  p_set    text,
  p_all    boolean default false
) returns table (
  line_id          uuid,
  buy_id           uuid,
  kind             text,
  status           text,
  customer_name    text,
  paid_method      text,
  confirmed_at     timestamptz,
  confirmed_by     uuid,
  created_at       timestamptz,
  buy_number       integer,
  game             text,
  lang             text,
  name             text,
  name_en          text,
  set_code         text,
  collector_number text,
  finish           text,
  first_edition    boolean,
  treatments       jsonb,
  condition        text,
  quantity         integer,
  image_url        text,
  completed        boolean
)
language sql stable
set search_path = public
as $$
  with q as (
    select '%' || replace(replace(replace(lower(btrim(coalesce(p_name, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           btrim(coalesce(p_name, '')) = '' as any_name
  ),
  hits as (
    select l.id as line_id, l.buy_id, b.kind, b.status, b.customer_name, b.paid_method,
           b.confirmed_at, b.confirmed_by, b.created_at, l.game, l.lang, l.name, l.name_en, l.set_code,
           l.collector_number, l.finish, l.first_edition, l.treatments, l.condition, l.quantity, l.image_url,
           l.completed_at is not null as completed,
           coalesce(b.confirmed_at, b.created_at) as newest, l.position
      from buy_lines l
      join buys b on b.id = l.buy_id
      cross join q
     where ((b.kind = 'walk_in' and b.status = 'confirmed' and (p_all or l.completed_at is null))
         or (b.kind = 'collection'
             and (b.status = 'paid' or (p_all and b.status in ('processing', 'priced', 'completed')))))
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
         h.first_edition, h.treatments, h.condition, h.quantity, h.image_url, h.completed
    from hits h
   order by h.newest desc, h.buy_id, h.position
$$;

revoke execute on function public.global_search(text, text, integer, text, boolean) from public, anon;
grant execute on function public.global_search(text, text, integer, text, boolean) to authenticated;
