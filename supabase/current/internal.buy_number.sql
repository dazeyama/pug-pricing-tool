CREATE OR REPLACE FUNCTION internal.buy_number(p_buy buys)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with b as (
    select p_buy.id, p_buy.confirmed_at, (p_buy.confirmed_at at time zone 'America/Los_Angeles')::date as day,
           case when exists (select 1 from buy_lines l where l.buy_id = p_buy.id and l.game = 'mtg')
                then 'mtg' else 'pokemon' end as game
  )
  select coalesce(p_buy.number, (select count(*) from buys x
             where x.kind = 'walk_in' and x.status = 'confirmed'
               and (x.confirmed_at at time zone 'America/Los_Angeles')::date = b.day
               and (x.confirmed_at, x.id) <= (b.confirmed_at, b.id)
               and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = b.game)))
    from b
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
