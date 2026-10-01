-- Walk-in buys (owner, 2026-09-30): Paid/Ours once confirmed (the buy's
-- status stays 'confirmed'), Completed once exported, like a collection's last
-- status. EXPORT works on one game's day page, and a buy can hold both games,
-- so a buy is Completed game by game: each of its lines records when it was
-- exported (completed_at). Completed lines are locked (no removing cards or
-- deleting the buy) and left out of the header search, until the day is
-- marked Paid/Ours again.

alter table public.buy_lines
  add column completed_at timestamptz,
  add column completed_by uuid references public.staff_users (id);

-- A day-level changelog entry (a day exported, or put back) names its day.
alter table public.events add column day date;

-- ---------------------------------------------------------------------------
-- day_mark: EXPORT on a day page (p_complete true) marks that game's
-- Paid/Ours cards in the day's confirmed buys Completed; the menu next to
-- EXPORT (p_complete false) puts them back to Paid/Ours. Returns how many
-- buys changed (0 when there was nothing to change: exporting a Completed day
-- again changes nothing). It touches the buys too (version, updated_at), so
-- open day pages and the Calendar reload.
-- ---------------------------------------------------------------------------
create or replace function public.day_mark(
  p_day      date,
  p_game     text,
  p_user     uuid,
  p_device   uuid,
  p_complete boolean
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_user  staff_users;
  v_ids   uuid[];
  v_count integer;
  v_game  text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null or p_day is null then raise exception 'bad_day'; end if;

  select array_agg(distinct b.id) into v_ids
    from buys b join buy_lines l on l.buy_id = b.id
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
     and l.game = p_game
     and (l.completed_at is null) = p_complete;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then return 0; end if;

  if p_complete then
    update buy_lines set completed_at = now(), completed_by = p_user
     where buy_id = any(v_ids) and game = p_game and completed_at is null;
  else
    update buy_lines set completed_at = null, completed_by = null
     where buy_id = any(v_ids) and game = p_game and completed_at is not null;
  end if;
  update buys set version = version + 1, updated_at = now() where id = any(v_ids);

  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy',
          case when p_complete then 'day_exported' else 'day_unexported' end,
          v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY'), array[p_game], p_day,
          jsonb_build_array(jsonb_build_object('field', 'status',
            'before', case when p_complete then 'Paid/Ours' else 'Completed' end,
            'after', case when p_complete then 'Completed' else 'Paid/Ours' end)),
          case when p_complete
               then format('%s %s buy%s exported and marked Completed.', v_count, v_game,
                           case when v_count = 1 then '' else 's' end)
               else format('%s %s buy%s marked Paid/Ours again.', v_count, v_game,
                           case when v_count = 1 then '' else 's' end) end);
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Completed cards can't be removed, nor a buy with any deleted (0013's
-- functions, with that check added).
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
  -- Completed (exported) cards are locked until the day is marked Paid/Ours again.
  if v_old.completed_at is not null then
    raise exception 'buy_completed';
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
  if exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null) then
    raise exception 'buy_completed';
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
-- The Calendar's month also says which games of each buy are Completed.
-- ---------------------------------------------------------------------------
drop function public.buys_in_range(timestamptz, timestamptz);

create function public.buys_in_range(p_from timestamptz, p_to timestamptz)
returns table (id uuid, confirmed_at timestamptz, confirmed_by uuid, games text[], completed_games text[])
language sql stable
set search_path = public
as $$
  select b.id, b.confirmed_at, b.confirmed_by,
         array(select distinct l.game from buy_lines l where l.buy_id = b.id order by 1),
         array(select l.game from buy_lines l where l.buy_id = b.id
                group by l.game having bool_and(l.completed_at is not null) order by 1)
    from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and b.confirmed_at >= p_from and b.confirmed_at < p_to
   order by b.confirmed_at, b.id
$$;

-- ---------------------------------------------------------------------------
-- The header search leaves Completed walk-in cards out, as it does Completed
-- collections (0017's function, with that filter added).
-- ---------------------------------------------------------------------------
drop function public.global_search(text, text, integer, text);

create function public.global_search(
  p_name   text,
  p_number text,
  p_size   integer,
  p_set    text
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
  image_url        text
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
           coalesce(b.confirmed_at, b.created_at) as newest, l.position
      from buy_lines l
      join buys b on b.id = l.buy_id
      cross join q
     where ((b.kind = 'walk_in' and b.status = 'confirmed')
         or (b.kind = 'collection' and b.status in ('processing', 'priced', 'paid')))
       and (q.any_name or l.name_key like q.pat or lower(coalesce(l.name_en, '')) like q.pat)
       and (p_number is null or norm_number(l.collector_number) = norm_number(p_number))
       and (p_size is null or l.printed_size = p_size)
       and (p_set is null or lower(l.set_code) = lower(btrim(p_set)))
       and l.completed_at is null
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
         h.first_edition, h.treatments, h.condition, h.quantity, h.image_url
    from hits h
   order by h.newest desc, h.buy_id, h.position
$$;

revoke execute on function
  public.day_mark(date, text, uuid, uuid, boolean),
  public.buys_in_range(timestamptz, timestamptz),
  public.global_search(text, text, integer, text)
from public, anon;
grant execute on function
  public.day_mark(date, text, uuid, uuid, boolean),
  public.buys_in_range(timestamptz, timestamptz),
  public.global_search(text, text, integer, text)
to authenticated;
