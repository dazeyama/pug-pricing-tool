CREATE OR REPLACE FUNCTION internal.buy_target_name(p_buy_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with b as (
    select id, confirmed_at, (confirmed_at at time zone 'America/Los_Angeles')::date as day,
           case when exists (select 1 from buy_lines l where l.buy_id = buys.id and l.game = 'mtg')
                then 'mtg' else 'pokemon' end as game
      from buys where id = p_buy_id
  )
  select format('Buy %s · %s',
           (select count(*) from buys x
             where x.kind = 'walk_in' and x.status = 'confirmed'
               and (x.confirmed_at at time zone 'America/Los_Angeles')::date = b.day
               and (x.confirmed_at, x.id) <= (b.confirmed_at, b.id)
               and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = b.game)),
           to_char(b.day, 'Dy Mon FMDD, YYYY'))
    from b
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
