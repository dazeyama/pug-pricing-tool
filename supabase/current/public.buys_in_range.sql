CREATE OR REPLACE FUNCTION public.buys_in_range(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(id uuid, confirmed_at timestamp with time zone, confirmed_by uuid, games text[], completed_games text[], exported_games text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select b.id, b.confirmed_at, b.confirmed_by,
         array(select distinct l.game from buy_lines l where l.buy_id = b.id order by 1),
         array(select l.game from buy_lines l where l.buy_id = b.id
                group by l.game having bool_and(l.completed_at is not null or l.bulk_kind is not null or l.struck_at is not null) order by 1),
         array(select distinct l.game from buy_lines l where l.buy_id = b.id and l.cc_status is not null order by 1)
    from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and b.confirmed_at >= p_from and b.confirmed_at < p_to
   order by b.confirmed_at, b.id
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
