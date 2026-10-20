-- Phase 8: confirmed walk-in buys on the Calendar and day pages (spec 10).
-- Cards can be removed from a confirmed buy, and a buy can be deleted; both
-- are logged in the same transaction. Removing a buy's last card is refused
-- (last_card): the day page deletes the buy instead (owner, 2026-09-29).
--
-- Error codes: buy_gone, line_gone, stale_version, last_card, no_user.

-- ---------------------------------------------------------------------------
-- A confirmed buy's name as the changelog shows it, as things stand:
-- "Buy N · Tue Sep 29, 2026", N among that day's confirmed buys (store
-- time) with cards of its first game, Magic before Pokémon (spec 6.2).
-- ---------------------------------------------------------------------------
create or replace function public.buy_target_name(p_buy_id uuid) returns text
language sql stable
set search_path = public
as $$
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
$$;

-- A confirmed buy's changelog entry; the user's name and colour are frozen.
create or replace function public.buy_event(
  b         buys,
  p_user    uuid,
  p_device  uuid,
  p_action  text,
  p_target  text,
  p_games   text[],
  p_removed integer,
  p_market  numeric,
  p_lines   jsonb,
  p_summary text
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, removed, totals, lines, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', p_action, b.id, p_target,
          coalesce(p_games, '{}'), coalesce(p_removed, 0),
          jsonb_build_object('market', p_market,
                             'cash', round_down_price(p_market * b.cash_pct / 100)::numeric(12,2),
                             'credit', round_down_price(p_market * b.credit_pct / 100)::numeric(12,2),
                             'cash_pct', b.cash_pct, 'credit_pct', b.credit_pct),
          coalesce(p_lines, '[]'::jsonb), coalesce(p_summary, ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- buy_remove_line: take p_qty copies off a confirmed buy's line (day page,
-- spec 10.2). p_text is the removed copies' line text for the entry.
-- ---------------------------------------------------------------------------
create or replace function public.buy_remove_line(
  p_line_id          uuid,
  p_qty              integer,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer,
  p_text             text
) returns void
language plpgsql
set search_path = public
as $$
declare
  b        buys;
  v_old    buy_lines;
  v_n      integer;
  v_target text;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'walk_in' and x.status = 'confirmed';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  select * into b from buys where id = v_old.buy_id for update;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  if v_n >= v_old.quantity
     and not exists (select 1 from buy_lines where buy_id = b.id and id <> p_line_id) then
    raise exception 'last_card';
  end if;

  -- Named as it stood before the change.
  v_target := buy_target_name(b.id);

  if v_n >= v_old.quantity then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - v_n where id = p_line_id;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_cards_removed', v_target, array[v_old.game], v_n,
    v_old.unit_price * v_n,
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name))),
    sentence(format('%s card%s removed from a confirmed buy', v_n, case when v_n = 1 then '' else 's' end)));
end;
$$;

-- ---------------------------------------------------------------------------
-- buy_delete: a confirmed buy and every card in it, both games (spec 10.2).
-- p_line_texts maps each line ID to its buy-list text for the entry.
-- ---------------------------------------------------------------------------
create or replace function public.buy_delete(
  p_buy_id           uuid,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer,
  p_line_texts       jsonb default '{}'
) returns void
language plpgsql
set search_path = public
as $$
declare
  b        buys;
  v_target text;
  v_games  text[];
  v_count  integer;
  v_market numeric;
  v_lines  jsonb;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = b.id group by game) t;
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_deleted', v_target, coalesce(v_games, '{}'),
    coalesce(v_count, 0), coalesce(v_market, 0), coalesce(v_lines, '[]'::jsonb),
    sentence(format('Buy deleted with %s card%s', coalesce(v_count, 0),
                    case when coalesce(v_count, 0) = 1 then '' else 's' end)));

  delete from buys where id = b.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- buys_in_range: the Calendar's month (spec 10.1): each confirmed walk-in
-- buy between two instants, with who confirmed it and its games.
-- ---------------------------------------------------------------------------
create or replace function public.buys_in_range(p_from timestamptz, p_to timestamptz)
returns table (id uuid, confirmed_at timestamptz, confirmed_by uuid, games text[])
language sql stable
set search_path = public
as $$
  select b.id, b.confirmed_at, b.confirmed_by,
         array(select distinct l.game from buy_lines l where l.buy_id = b.id order by 1)
    from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and b.confirmed_at >= p_from and b.confirmed_at < p_to
   order by b.confirmed_at, b.id
$$;

revoke execute on function
  public.buy_target_name(uuid),
  public.buy_event(buys, uuid, uuid, text, text, text[], integer, numeric, jsonb, text),
  public.buy_remove_line(uuid, integer, uuid, uuid, integer, text),
  public.buy_delete(uuid, uuid, uuid, integer, jsonb),
  public.buys_in_range(timestamptz, timestamptz)
from public, anon;
grant execute on function
  public.buy_target_name(uuid),
  public.buy_event(buys, uuid, uuid, text, text, text[], integer, numeric, jsonb, text),
  public.buy_remove_line(uuid, integer, uuid, uuid, integer, text),
  public.buy_delete(uuid, uuid, uuid, integer, jsonb),
  public.buys_in_range(timestamptz, timestamptz)
to authenticated;
