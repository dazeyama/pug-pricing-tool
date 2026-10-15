-- Individual rates (docs/TEAM_FEEDBACK.md 4, Phase T2; owner, 2026-10-14).
--
-- Each card gets its own Cash and Credit rate, strongest first: its own rate
-- (Set Rate) → the buy's or collection's custom rates (which turn the next
-- step off) → the low-end / high-end rates (strictly under $3 or over $35 by
-- its unit price; Settings → Low-end and high-end rates) → the base rate (the
-- Master Buy Percentages, or the buy's as kept). The app works the same rule
-- out in src/lib/rates.js.
--
-- When a buy is confirmed, a collection marked Paid/Ours or Rejected, or a
-- project converted to a buy, each card's rates are kept on it (cash_pct,
-- credit_pct), so changing the settings later never changes it. Existing
-- confirmed buys and Paid/Ours / Completed / Rejected collections get their
-- buy's rates copied onto their cards here: every past total stays the same.
--
-- Totals (the Changelog's, collection_totals before) are each card's price ×
-- its rate, added up, then rounded down once: with every card on one rate,
-- exactly market × rate as before. buy_event takes the totals instead of a
-- market figure; the functions that log one are re-created here from the
-- live definitions with only that changed (and, where named, the rates kept
-- or cleared).

-- ---------------------------------------------------------------- columns
alter table public.buy_lines
  add column custom_cash_pct numeric(5,2) check (custom_cash_pct between 0 and 100),
  add column custom_credit_pct numeric(5,2) check (custom_credit_pct between 0 and 100),
  add column cash_pct numeric(5,2) check (cash_pct between 0 and 100),
  add column credit_pct numeric(5,2) check (credit_pct between 0 and 100);

comment on column public.buy_lines.custom_cash_pct is 'Set Rate: the card''s own Cash rate, or null';
comment on column public.buy_lines.custom_credit_pct is 'Set Rate: the card''s own Credit rate, or null';
comment on column public.buy_lines.cash_pct is 'The Cash rate kept on the card when its buy was confirmed / Paid/Ours';
comment on column public.buy_lines.credit_pct is 'The Credit rate kept on the card when its buy was confirmed / Paid/Ours';

-- Past buys keep exactly what they had: their buy's rates, on every card.
update public.buy_lines l
   set cash_pct = b.cash_pct, credit_pct = b.credit_pct
  from public.buys b
 where b.id = l.buy_id
   and b.cash_pct is not null and b.credit_pct is not null
   and ((b.kind = 'walk_in' and b.status = 'confirmed')
        or (b.kind = 'collection' and b.status in ('paid', 'completed', 'rejected')));

-- ---------------------------------------------------------------- helpers

-- The low-end and high-end rates (4.2): the saved setting over the shipped
-- defaults, as the app reads it (settings.jsx, rates.js tiersFrom).
create function internal.rate_tiers() returns jsonb
language sql stable
set search_path = public, internal
as $$
  select jsonb_build_object(
           'low', '{"under": 3, "credit": 50, "cash": 25}'::jsonb
                  || coalesce(case when jsonb_typeof(s.v -> 'low') = 'object' then s.v -> 'low' end, '{}'::jsonb),
           'high', '{"over": 35, "credit": 70, "cash": 40}'::jsonb
                  || coalesce(case when jsonb_typeof(s.v -> 'high') = 'object' then s.v -> 'high' end, '{}'::jsonb))
  from (select (select value from settings where key = 'rate_tiers') as v) s
$$;

-- One card's Cash or Credit rate (4.1), as rates.js lineRate works it out:
-- kept on the card → its own → the buy's custom rates (no low/high) → low
-- end / high end (strictly, by its unit price) → the buy's base rate (as
-- kept, else its custom one, else the Master Buy Percentage).
create function internal.line_pct(l buy_lines, b buys, p_side text) returns numeric
language sql stable
set search_path = public, internal
as $$
  select case
           when p_side = 'cash' and l.cash_pct is not null then l.cash_pct
           when p_side = 'credit' and l.credit_pct is not null then l.credit_pct
           when p_side = 'cash' and l.custom_cash_pct is not null then l.custom_cash_pct
           when p_side = 'credit' and l.custom_credit_pct is not null then l.custom_credit_pct
           when b.custom_cash_pct is not null or b.custom_credit_pct is not null then x.base
           when l.unit_price < (x.t -> 'low' ->> 'under')::numeric then (x.t -> 'low' ->> p_side)::numeric
           when l.unit_price > (x.t -> 'high' ->> 'over')::numeric then (x.t -> 'high' ->> p_side)::numeric
           else x.base end
  from (select internal.rate_tiers() as t,
               case p_side when 'cash' then coalesce(b.cash_pct, b.custom_cash_pct, master_pct('cash_pct'))
                           else coalesce(b.credit_pct, b.custom_credit_pct, master_pct('credit_pct')) end as base) x
$$;

-- Market, Cash and Credit for some of a buy's cards (4.4): each card's price
-- × its own rate, added up, then rounded down once. cash_pct / credit_pct are
-- the buy's base rates, as before.
create function internal.lines_totals(b buys, p_lines buy_lines[]) returns jsonb
language sql stable
set search_path = public, internal
as $$
  select jsonb_build_object(
           'market', coalesce(sum(x.m), 0),
           'cash', round_down_price(coalesce(sum(x.m * x.c), 0) / 100)::numeric(12,2),
           'credit', round_down_price(coalesce(sum(x.m * x.cr), 0) / 100)::numeric(12,2),
           'cash_pct', coalesce(b.cash_pct, b.custom_cash_pct, master_pct('cash_pct')),
           'credit_pct', coalesce(b.credit_pct, b.custom_credit_pct, master_pct('credit_pct')))
  from (select l.unit_price * l.quantity as m,
               internal.line_pct(l, b, 'cash') as c,
               internal.line_pct(l, b, 'credit') as cr
          from unnest(coalesce(p_lines, '{}'::buy_lines[])) l) x
$$;

-- Keep each card's rates on it (confirmed, Paid/Ours, Rejected), or clear
-- them (unlocked again), 4.6.
create function internal.fix_line_rates(b buys) returns void
language sql
set search_path = public, internal
as $$
  update buy_lines l
     set cash_pct = internal.line_pct(l, b, 'cash'),
         credit_pct = internal.line_pct(l, b, 'credit')
   where l.buy_id = b.id;
$$;

create function internal.unfix_line_rates(p_buy_id uuid) returns void
language sql
set search_path = public, internal
as $$
  update buy_lines set cash_pct = null, credit_pct = null where buy_id = p_buy_id;
$$;

-- A Set Rate percentage: 0–100, up to 2 decimals, or null (cleared).
create function internal.check_rate(p numeric) returns void
language plpgsql immutable
set search_path = public, internal
as $$
begin
  if p is not null and (p < 0 or p > 100 or p <> round(p, 2)) then
    raise exception 'bad_pct';
  end if;
end;
$$;

-- buy_event with the totals worked out by its caller (internal.lines_totals).
create function internal.buy_event(
  b buys, p_user uuid, p_device uuid, p_action text, p_target text, p_games text[],
  p_removed integer, p_totals jsonb, p_lines jsonb, p_summary text
) returns void
language plpgsql
set search_path = public, internal
as $$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, removed, totals, lines, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', p_action, b.id, p_target,
          coalesce(p_games, '{}'), coalesce(p_removed, 0), p_totals,
          coalesce(p_lines, '[]'::jsonb), coalesce(p_summary, ''));
end;
$$;

revoke execute on function
  internal.rate_tiers(),
  internal.line_pct(buy_lines, buys, text),
  internal.lines_totals(buys, buy_lines[]),
  internal.fix_line_rates(buys),
  internal.unfix_line_rates(uuid),
  internal.check_rate(numeric),
  internal.buy_event(buys, uuid, uuid, text, text, text[], integer, jsonb, jsonb, text)
  from public, anon;
grant execute on function
  internal.rate_tiers(),
  internal.line_pct(buy_lines, buys, text),
  internal.lines_totals(buys, buy_lines[]),
  internal.fix_line_rates(buys),
  internal.unfix_line_rates(uuid),
  internal.check_rate(numeric),
  internal.buy_event(buys, uuid, uuid, text, text, text[], integer, jsonb, jsonb, text)
  to authenticated, service_role;

-- ------------------------------------------------- Set Rate (4.3)

-- A Buy list card's own rates (the walk-in draft): either may be null.
create function public.draft_set_line_rate(
  p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid
) returns void
language plpgsql
set search_path = public, internal
as $$
declare
  v_buy uuid;
begin
  perform internal.check_rate(p_cash);
  perform internal.check_rate(p_credit);
  select l.buy_id into v_buy
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    raise exception 'line_gone';   -- removed, confirmed or cancelled meanwhile
  end if;
  update buy_lines set custom_cash_pct = p_cash, custom_credit_pct = p_credit where id = p_line_id;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
end;
$$;

-- A collection's or project's card's own rates, checked like every change
-- to its cards (lock, version; not Paid/Ours, Completed or Rejected
-- collections, nor a Completed card). Its own rate replaces any kept on it (a
-- project's card that came from a buy). Logged with what each rate was.
create function public.collection_set_line_rate(
  p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid, p_device uuid,
  p_expected_version integer, p_text text
) returns void
language plpgsql
set search_path = public, internal
as $$
declare
  b      buys;
  v_old  buy_lines;
  v_new  buy_lines;
  v_rows jsonb := '[]'::jsonb;
  v_side text;
  v_was  numeric;
  v_now  numeric;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  perform internal.check_rate(p_cash);
  perform internal.check_rate(p_credit);
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, true);
  if v_old.completed_at is not null then
    raise exception 'line_completed';
  end if;
  if v_old.custom_cash_pct is not distinct from p_cash and v_old.custom_credit_pct is not distinct from p_credit then
    return;
  end if;

  update buy_lines
     set custom_cash_pct = p_cash, custom_credit_pct = p_credit, cash_pct = null, credit_pct = null
   where id = p_line_id
  returning * into v_new;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  foreach v_side in array array['credit', 'cash'] loop
    v_was := internal.line_pct(v_old, b, v_side);
    v_now := internal.line_pct(v_new, b, v_side);
    if v_was is distinct from v_now then
      v_rows := v_rows || jsonb_build_object('field', v_side || ' %', 'before', pct_text(v_was),
        'after', pct_text(v_now) || case when (case v_side when 'cash' then p_cash else p_credit end) is null
                                         then ' (own rate cleared)' else '' end);
    end if;
  end loop;

  perform collection_event(b, p_user, p_device, 'collection_line_rate', array[v_old.game], 0, 0, null, '[]',
    v_rows,
    sentence(case when p_cash is null and p_credit is null
                  then format('Own rate cleared: %s', coalesce(p_text, v_old.name))
                  else format('Own rate set: %s', coalesce(p_text, v_old.name)) end));
end;
$$;

revoke execute on function
  public.draft_set_line_rate(uuid, numeric, numeric, uuid),
  public.collection_set_line_rate(uuid, numeric, numeric, uuid, uuid, integer, text)
  from public, anon;
grant execute on function
  public.draft_set_line_rate(uuid, numeric, numeric, uuid),
  public.collection_set_line_rate(uuid, numeric, numeric, uuid, uuid, integer, text)
  to authenticated, service_role;

-- ------------------------------------- functions re-created (live bodies)

-- buy_delete: the deleted buy's totals.
CREATE OR REPLACE FUNCTION public.buy_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
    coalesce(v_count, 0), internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), coalesce(v_lines, '[]'::jsonb),
    sentence(format('Buy deleted with %s card%s', coalesce(v_count, 0),
                    case when coalesce(v_count, 0) = 1 then '' else 's' end)));

  delete from buys where id = b.id;
end;
$function$;

-- buy_mark_completed: that game's cards.
CREATE OR REPLACE FUNCTION public.buy_mark_completed(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_complete boolean, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_count  integer;
  v_cards  integer;
  v_market numeric;
  v_game   text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if v_game is null then
    raise exception 'bad_game';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  if p_complete then
    update buy_lines set completed_at = now(), completed_by = p_user
     where buy_id = b.id and game = p_game and completed_at is null;
  else
    -- COMPLETE's Sell Prices go with it (owner, 2026-10-09).
    update buy_lines set completed_at = null, completed_by = null, cc_sell_price = null, cc_sell_basis = null
     where buy_id = b.id and game = p_game and completed_at is not null and cc_status is null;
  end if;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 0;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  select sum(quantity), sum(unit_price * quantity) into v_cards, v_market
    from buy_lines where buy_id = b.id and game = p_game;
  perform buy_event(b, p_user, p_device,
    case when p_complete then 'buy_completed' else 'buy_uncompleted' end,
    buy_target_name(b.id), array[p_game], 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id and l.game = p_game)), '[]'::jsonb,
    case when p_complete
         then format('%s %s card%s marked Completed without exporting: left out of the search and the day''s export.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end)
         else format('%s %s card%s marked Paid/Ours again.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end) end);
  return v_count;
end;
$function$;

-- buy_remove_line: the copies removed, at the card's rate.
CREATE OR REPLACE FUNCTION public.buy_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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

  v_old.quantity := v_n;   -- the copies removed, at the card's rate (lines_totals)
  perform buy_event(b, p_user, p_device, 'buy_cards_removed', v_target, array[v_old.game], v_n,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name))),
    sentence(format('%s card%s removed from a confirmed buy', v_n, case when v_n = 1 then '' else 's' end)));
end;
$function$;

-- buy_save_edits: the buy's totals after the edit (each card keeps its rates).
CREATE OR REPLACE FUNCTION public.buy_save_edits(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_lines jsonb, p_removed jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b         buys;
  v_target  text;
  v_item    jsonb;
  v_old     buy_lines;
  r         buy_lines;
  v_touched uuid[];
  v_removed uuid[];
  v_rows    jsonb := '[]';
  v_games   text[] := '{}';
  v_edited  integer := 0;
  v_gone    integer := 0;
  v_market  numeric;
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
  p_lines := coalesce(p_lines, '[]'::jsonb);
  p_removed := coalesce(p_removed, '[]'::jsonb);
  if jsonb_array_length(p_lines) + jsonb_array_length(p_removed) = 0 then
    return b.version;   -- nothing changed
  end if;

  v_removed := array(select (value ->> 'id')::uuid from jsonb_array_elements(p_removed));
  v_touched := v_removed || array(select (value ->> 'id')::uuid from jsonb_array_elements(p_lines));
  if exists (select 1 from unnest(v_touched) t(id)
              where not exists (select 1 from buy_lines l where l.id = t.id and l.buy_id = b.id)) then
    raise exception 'line_gone';
  end if;
  if exists (select 1 from buy_lines where id = any(v_touched) and completed_at is not null) then
    raise exception 'buy_completed';
  end if;
  if not exists (select 1 from buy_lines where buy_id = b.id and id <> all(v_removed)) then
    raise exception 'last_card';
  end if;

  -- Named as it stood before the change.
  v_target := buy_target_name(b.id);

  for v_item in select value from jsonb_array_elements(p_removed) loop
    select * into v_old from buy_lines where id = (v_item ->> 'id')::uuid;
    v_rows := v_rows || jsonb_build_object('sign', '-', 'qty', v_old.quantity, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(v_item ->> 'text', v_old.quantity || ' ' || v_old.name));
    v_games := v_games || v_old.game;
    v_gone := v_gone + v_old.quantity;
    delete from buy_lines where id = v_old.id;
  end loop;

  for v_item in select value from jsonb_array_elements(p_lines) loop
    select * into v_old from buy_lines where id = (v_item ->> 'id')::uuid;
    r := jsonb_populate_record(null::buy_lines, v_item -> 'line');
    if r.quantity is null or r.quantity < 1 then
      raise exception 'quantity must be at least 1';
    end if;
    update buy_lines set
      game = r.game, lang = r.lang, name = r.name, name_en = r.name_en, name_key = r.name_key,
      set_code = r.set_code, set_name = r.set_name, source_set_id = r.source_set_id,
      collector_number = r.collector_number, printed_size = r.printed_size, rarity = r.rarity,
      finish = r.finish, first_edition = coalesce(r.first_edition, false),
      treatments = coalesce(r.treatments, '[]'::jsonb), condition = r.condition,
      quantity = r.quantity, unit_price = r.unit_price, market_price = r.market_price,
      price_source = r.price_source, price_snapshot = r.price_snapshot, priced_at = r.priced_at,
      scryfall_id = r.scryfall_id, oracle_id = r.oracle_id, tcgdex_id = r.tcgdex_id,
      tcgplayer_id = r.tcgplayer_id, justtcg_card_id = r.justtcg_card_id,
      justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url
    where id = v_old.id;
    v_rows := v_rows
      || jsonb_build_object('sign', '-', 'qty', v_old.quantity, 'game', v_old.game, 'unit_price', v_old.unit_price,
           'text', coalesce(v_item ->> 'old_text', v_old.quantity || ' ' || v_old.name))
      || jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', r.game, 'unit_price', r.unit_price,
           'text', coalesce(v_item ->> 'new_text', r.quantity || ' ' || r.name));
    v_games := v_games || v_old.game || r.game;
    v_edited := v_edited + 1;
  end loop;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;
  select coalesce(sum(unit_price * quantity), 0) into v_market from buy_lines where buy_id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_edited', v_target,
    array(select distinct g from unnest(v_games) g order by 1), v_gone,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), v_rows,
    sentence(concat_ws('; ',
      case when v_edited > 0
           then format('%s card%s edited', v_edited, case when v_edited = 1 then '' else 's' end) end,
      case when v_gone > 0
           then format('%s card%s removed', v_gone, case when v_gone = 1 then '' else 's' end) end)));
  return b.version;
end;
$function$;

-- buy_set_condition_check: the buy's totals.
CREATE OR REPLACE FUNCTION public.buy_set_condition_check(p_buy_id uuid, p_flag boolean, p_user uuid, p_device uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_flag   boolean := coalesce(p_flag, false);
  v_games  text[];
  v_market numeric;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if b.condition_check = v_flag then
    return v_flag;   -- as it was (a buy never flagged stays without a check): nothing to log
  end if;
  update buys
     set condition_check = v_flag,
         condition_checked_at = case when v_flag then null else now() end,
         condition_checked_by = case when v_flag then null else p_user end,
         updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  select array(select distinct game from buy_lines where buy_id = b.id order by 1),
         coalesce(sum(unit_price * quantity), 0)
    into v_games, v_market
    from buy_lines where buy_id = b.id;
  perform buy_event(b, p_user, p_device,
    case when v_flag then 'buy_flagged' else 'buy_flag_cleared' end,
    buy_target_name(b.id), v_games, 0, internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), '[]'::jsonb,
    case when v_flag then 'Flagged: its cards need their condition checked before export.'
         else 'Condition checked: the flag is off.' end);
  return v_flag;
end;
$function$;

-- buy_unexport: the cards put back.
CREATE OR REPLACE FUNCTION public.buy_unexport(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b          buys;
  v_lines    uuid[];
  v_count    integer;
  v_cards    integer;
  v_market   numeric;
  v_returned integer;
  v_target   text;
  v_game     text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null then raise exception 'bad_game'; end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then raise exception 'buy_gone'; end if;
  if p_expected_version is not null and b.version <> p_expected_version then raise exception 'stale_version'; end if;

  select array_agg(id), count(*) into v_lines, v_count
    from buy_lines where buy_id = b.id and game = p_game and completed_at is not null;
  if v_lines is null then return 0; end if;
  v_target := buy_target_name(b.id);

  update buy_lines set
    completed_at = null, completed_by = null,
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where id = any(v_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id returning * into b;
  v_returned := cant_upload_return(v_lines, v_target, p_user, p_device);

  select coalesce(sum(quantity), 0), coalesce(sum(unit_price * quantity), 0) into v_cards, v_market
    from buy_lines where id = any(v_lines);
  perform buy_event(b, p_user, p_device, 'buy_unexported', v_target, array[p_game], 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.id = any(v_lines))), '[]'::jsonb,
    format('%s %s card%s marked Paid/Ours again%s.', v_cards, v_game, case when v_cards = 1 then '' else 's' end,
           case when v_returned > 0
                then format('; %s card%s taken back out of Can''t upload cards', v_returned,
                            case when v_returned = 1 then '' else 's' end)
                else '' end));
  return v_count;
end;
$function$;

-- export_lines: one buy exported on its own, its exported cards.
CREATE OR REPLACE FUNCTION public.export_lines(p_target jsonb, p_matches jsonb, p_cant uuid[], p_set_maps jsonb, p_user uuid, p_device uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_kind      text := p_target ->> 'kind';
  v_day       date;
  v_game      text;
  v_file      uuid := cc_current_file();
  v_sku       text := cc_custom_sku(now());
  v_from      text;
  v_buys      uuid[];
  v_lines     uuid[];
  v_cards     integer;
  v_cant      integer;
  v_rows      jsonb;
  v_notes     jsonb;
  v_lines_log jsonb;
  v_user      staff_users;
  b           buys;
  v_target    text;
  v_market    numeric;
begin
  if p_user is null then raise exception 'no_user'; end if;
  p_matches := coalesce(p_matches, '[]'::jsonb);
  p_cant := coalesce(p_cant, '{}'::uuid[]);
  if v_kind is null or v_kind not in ('day', 'buy', 'cant_upload', 'collection') then raise exception 'bad_target'; end if;
  -- An inventory with products, when anything is to be matched (a collection
  -- with only Pokémon cards needs none).
  if jsonb_array_length(p_matches) > 0
     and (v_file is null or not exists (select 1 from cc_products where file_id = v_file)) then
    raise exception 'no_inventory';
  end if;

  -- ------------------------------------------------------------- a day page
  if v_kind = 'day' then
    v_day := (p_target ->> 'day')::date;
    v_game := p_target ->> 'game';
    -- Magic only (owner, 2026-09-30; spec 1.3).
    if v_game = 'pokemon' then raise exception 'pokemon_export_unavailable'; end if;
    if v_game is distinct from 'mtg' or v_day is null then raise exception 'bad_day'; end if;
    -- Today can't be exported (owner, 2026-09-30).
    if v_day >= (now() at time zone 'America/Los_Angeles')::date then raise exception 'day_not_over'; end if;
    v_from := 'Magic · ' || to_char(v_day, 'FMMonth FMDD, YYYY');

    -- The day's buys, locked, then those with this game's cards still Paid/Ours.
    perform 1 from buys x
     where x.kind = 'walk_in' and x.status = 'confirmed'
       and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
     for update;
    select array_agg(x.id) into v_buys
      from buys x
     where x.kind = 'walk_in' and x.status = 'confirmed'
       and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
       and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = v_game and l.completed_at is null);
    if v_buys is null then raise exception 'nothing_to_export'; end if;
    -- Nothing changed since the dialog opened.
    if exists (select 1 from buys x where x.id = any(v_buys)
                and (p_target -> 'versions' ->> x.id::text)::integer is distinct from x.version)
       or (select count(*) from jsonb_object_keys(coalesce(p_target -> 'versions', '{}'::jsonb)))
          <> array_length(v_buys, 1) then
      raise exception 'stale_version';
    end if;
    select array_agg(l.id) into v_lines
      from buy_lines l where l.buy_id = any(v_buys) and l.game = v_game and l.completed_at is null;
    perform export_check(v_lines, p_matches, p_cant, v_file);

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set completed_at = now(), completed_by = p_user where id = any(v_lines);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    update buys set version = version + 1, updated_at = now() where id = any(v_buys);

    -- Copies in Can't upload cards (spec 9.2), each saying which buy it's from,
    -- numbered as the day page numbers them.
    select jsonb_object_agg(l.id::text, format('from Buy %s · %s', n.n, to_char(v_day, 'FMMonth FMDD, YYYY')))
      into v_notes
      from buy_lines l
      join (select x.id, row_number() over (order by x.confirmed_at, x.id) as n
              from buys x
             where x.kind = 'walk_in' and x.status = 'confirmed'
               and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
               and exists (select 1 from buy_lines y where y.buy_id = x.id and y.game = v_game)) n
        on n.id = l.buy_id
     where l.id = any(p_cant);
    perform cant_upload_copy(
      (select array_agg(l.id order by l.buy_id, l.position) from buy_lines l where l.id = any(p_cant)),
      v_notes, v_from, p_user, p_device);

    select coalesce(sum(quantity) filter (where cc_status = 'exported'), 0),
           coalesce(sum(quantity) filter (where cc_status = 'cant_upload'), 0)
      into v_cards, v_cant
      from buy_lines where id = any(v_lines);
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'quantity', l.quantity, 'cc_status', l.cc_status,
             'cc_product_name', l.cc_product_name, 'cc_category', l.cc_category,
             'cc_condition', l.cc_condition, 'cc_sell_price', l.cc_sell_price, 'cc_custom_sku', l.cc_custom_sku))
      into v_rows
      from buy_lines l where l.id = any(v_lines);

    select * into v_user from staff_users where id = p_user;
    insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                        target_name, games, day, fields, summary)
    values (p_user, v_user.name, v_user.color, p_device, 'buy', 'day_exported',
            v_from, array[v_game], v_day,
            jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
            format('%s Magic card%s exported (Custom SKU %s)%s.', v_cards,
                   case when v_cards = 1 then '' else 's' end, v_sku,
                   case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                        else '' end));

    return jsonb_build_object('buys', array_length(v_buys, 1), 'cards', v_cards, 'cant', v_cant,
                              'sku', v_sku, 'lines', coalesce(v_rows, '[]'::jsonb));
  end if;

  -- ---------------------------------------------- one walk-in buy (0041)
  -- "Export single buy…" (owner, 2026-10-09): one buy's Magic cards, now,
  -- today's too (a buy is whole once confirmed; the day's EXPORT waits for
  -- the day so no buy misses it). Exported as the day's EXPORT would, then
  -- only this buy is Completed, as Mark as completed leaves it: the rest of
  -- its day stays Paid/Ours, and the day's EXPORT skips it.
  if v_kind = 'buy' then
    v_game := p_target ->> 'game';
    if v_game = 'pokemon' then raise exception 'pokemon_export_unavailable'; end if;
    if v_game is distinct from 'mtg' then raise exception 'bad_target'; end if;
    select * into b from buys
     where id = (p_target ->> 'buy_id')::uuid and kind = 'walk_in' and status = 'confirmed' for update;
    if b.id is null then raise exception 'buy_gone'; end if;
    if (p_target ->> 'version')::integer is distinct from b.version then raise exception 'stale_version'; end if;
    select array_agg(l.id) into v_lines
      from buy_lines l where l.buy_id = b.id and l.game = v_game and l.completed_at is null;
    if v_lines is null then raise exception 'nothing_to_export'; end if;
    v_target := buy_target_name(b.id);
    perform export_check(v_lines, p_matches, p_cant, v_file);

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set completed_at = now(), completed_by = p_user where id = any(v_lines);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = b.id returning * into b;

    select jsonb_object_agg(l.id::text, 'from ' || v_target) into v_notes from buy_lines l where l.id = any(p_cant);
    perform cant_upload_copy(
      (select array_agg(l.id order by l.position) from buy_lines l where l.id = any(p_cant)),
      v_notes, v_target, p_user, p_device);

    select coalesce(sum(quantity) filter (where cc_status = 'exported'), 0),
           coalesce(sum(quantity) filter (where cc_status = 'cant_upload'), 0),
           coalesce(sum(unit_price * quantity), 0)
      into v_cards, v_cant, v_market
      from buy_lines where id = any(v_lines);
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'quantity', l.quantity, 'cc_status', l.cc_status,
             'cc_product_name', l.cc_product_name, 'cc_category', l.cc_category,
             'cc_condition', l.cc_condition, 'cc_sell_price', l.cc_sell_price, 'cc_custom_sku', l.cc_custom_sku))
      into v_rows
      from buy_lines l where l.id = any(v_lines);

    perform buy_event(b, p_user, p_device, 'buy_exported', v_target, array[v_game], 0,
      internal.lines_totals(b, array(select l from buy_lines l where l.id = any(v_lines))), '[]'::jsonb,
      format('%s Magic card%s exported on its own (Custom SKU %s)%s; the buy is Completed.', v_cards,
             case when v_cards = 1 then '' else 's' end, v_sku,
             case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                  else '' end));

    return jsonb_build_object('buys', 1, 'cards', v_cards, 'cant', v_cant,
                              'sku', v_sku, 'lines', coalesce(v_rows, '[]'::jsonb));
  end if;

  -- ------------------------------------------------------- a collection (E5)
  -- Paid/Ours only; its Magic cards exported, its Pokémon cards left as they
  -- are (owner, 2026-09-30); then it's Completed, whatever was exported.
  if v_kind = 'collection' then
    b := collection_for_write((p_target ->> 'buy_id')::uuid, p_device, (p_target ->> 'version')::integer, false);
    if b.system_key is not null then raise exception 'bad_target'; end if;
    if b.status = 'completed' then raise exception 'nothing_to_export'; end if;
    if b.status <> 'paid' then raise exception 'collection_not_paid'; end if;
    v_from := b.customer_name;
    select array_agg(l.id) into v_lines from buy_lines l where l.buy_id = b.id and l.game = 'mtg';
    if v_lines is not null then
      perform export_check(v_lines, p_matches, p_cant, v_file);
    elsif jsonb_array_length(p_matches) > 0 or coalesce(array_length(p_cant, 1), 0) > 0 then
      raise exception 'stale_version';
    end if;

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    select jsonb_object_agg(l.id::text, 'from ' || v_from) into v_notes from buy_lines l where l.id = any(p_cant);
    perform cant_upload_copy(
      (select array_agg(l.id order by l.position) from buy_lines l where l.id = any(p_cant)),
      v_notes, v_from, p_user, p_device);

    select coalesce(sum(quantity) filter (where cc_status = 'exported'), 0),
           coalesce(sum(quantity) filter (where cc_status = 'cant_upload'), 0)
      into v_cards, v_cant
      from buy_lines where id = any(coalesce(v_lines, '{}'::uuid[]));
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'quantity', l.quantity, 'cc_status', l.cc_status,
             'cc_product_name', l.cc_product_name, 'cc_category', l.cc_category,
             'cc_condition', l.cc_condition, 'cc_sell_price', l.cc_sell_price, 'cc_custom_sku', l.cc_custom_sku))
      into v_rows
      from buy_lines l where l.id = any(coalesce(v_lines, '{}'::uuid[]));

    update buys set status = 'completed', completed_at = now(),
                    version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = b.id returning * into b;
    perform collection_event(b, p_user, p_device, 'collection_status_changed', '{}', 0, 0, null, '[]',
      jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
      case when v_lines is null then 'Marked Completed: no Magic cards to export.'
           else format('Exported %s card%s (Custom SKU %s)%s; marked Completed.', v_cards,
                       case when v_cards = 1 then '' else 's' end, v_sku,
                       case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                            else '' end) end);
    return jsonb_build_object('buys', 1, 'cards', v_cards, 'cant', v_cant,
                              'sku', case when v_cards > 0 then v_sku end, 'lines', coalesce(v_rows, '[]'::jsonb));
  end if;

  -- ------------------------------------------------- Can't upload cards (9.3)
  -- Cards that now match are exported and leave the collection, and their
  -- original lines are restamped exported; the rest stay, unchanged.
  b := collection_for_write(cant_upload_ensure(), p_device, (p_target ->> 'version')::integer, false);
  select array_agg(l.id) into v_lines from buy_lines l where l.buy_id = b.id and l.game = 'mtg';
  if v_lines is null then raise exception 'nothing_to_export'; end if;
  perform export_check(v_lines, p_matches, p_cant, v_file);
  if jsonb_array_length(p_matches) = 0 then
    return jsonb_build_object('buys', 0, 'cards', 0,
      'cant', (select coalesce(sum(quantity), 0) from buy_lines where id = any(p_cant)),
      'sku', v_sku, 'lines', '[]'::jsonb);
  end if;

  perform export_stamp(p_matches, v_file, v_sku);
  perform export_learn(p_matches, p_set_maps, v_file, p_user);
  -- The file's rows, and the changelog's lines, before the copies go.
  select coalesce(sum(l.quantity), 0),
         jsonb_agg(jsonb_build_object(
           'id', l.id, 'quantity', l.quantity, 'cc_status', l.cc_status,
           'cc_product_name', l.cc_product_name, 'cc_category', l.cc_category,
           'cc_condition', l.cc_condition, 'cc_sell_price', l.cc_sell_price, 'cc_custom_sku', l.cc_custom_sku)),
         jsonb_agg(jsonb_build_object('sign', '-', 'qty', l.quantity, 'game', l.game, 'unit_price', l.unit_price,
                                      'text', export_line_text(l)) order by l.position)
    into v_cards, v_rows, v_lines_log
    from buy_lines l where l.buy_id = b.id and l.cc_status = 'exported';
  -- The originals (still in their buys or collections) are exported now: the
  -- Can't upload chip goes.
  update buy_lines o set
    cc_status = 'exported', cc_product_id = c.cc_product_id, cc_product_name = c.cc_product_name,
    cc_category = c.cc_category, cc_condition = c.cc_condition, cc_sell_price = c.cc_sell_price,
    cc_sell_basis = c.cc_sell_basis, cc_custom_sku = c.cc_custom_sku, cc_exported_at = c.cc_exported_at
  from buy_lines c
  where c.buy_id = b.id and c.cc_status = 'exported' and o.id = c.source_line_id;
  -- Their buys or collections reload where they're open.
  update buys set version = version + 1, updated_at = now()
   where id in (select o.buy_id from buy_lines o join buy_lines c on o.id = c.source_line_id
                 where c.buy_id = b.id and c.cc_status = 'exported');
  delete from buy_lines where buy_id = b.id and cc_status = 'exported';
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id returning * into b;
  select coalesce(sum(quantity), 0) into v_cant from buy_lines where id = any(p_cant);
  perform collection_event(b, p_user, p_device, 'cant_upload_exported', array['mtg'], 0, v_cards, null, v_lines_log,
    '[]', format('Exported %s card%s (Custom SKU %s)%s.', v_cards, case when v_cards = 1 then '' else 's' end, v_sku,
                 case when v_cant > 0 then format('; %s still can''t upload and stay', v_cant) else '' end));
  return jsonb_build_object('buys', 0, 'cards', v_cards, 'cant', v_cant, 'sku', v_sku,
                            'lines', coalesce(v_rows, '[]'::jsonb));
end;
$function$;

-- confirm_buy: each card's rates kept on it (4.6); the totals from them.
CREATE OR REPLACE FUNCTION public.confirm_buy(p_buy_id uuid, p_user uuid, p_customer_name text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_paid_price numeric, p_paid_method text, p_line_texts jsonb DEFAULT '{}'::jsonb, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b          buys;
  v_cash     numeric;
  v_credit   numeric;
  v_games    text[];
  v_count    integer;
  v_market   numeric;
  v_number   integer;
  v_day      date;
  v_target   text;
  v_customer text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_from     text;
  v_lines    jsonb;
  v_user     staff_users;
begin
  -- Name, phone and the price paid are all required (owner, 2026-09-30).
  if v_customer is null then
    raise exception 'name_needed';
  end if;
  -- 10 digits; a leading 1 (the country code) is dropped (spec 9.3).
  if v_phone ~ '^1[0-9]{10}$' then
    v_phone := substr(v_phone, 2);
  end if;
  if v_phone is null then
    raise exception 'phone_needed';
  end if;
  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'bad_phone';
  end if;
  if p_paid_price is null or p_paid_price < 0 then
    raise exception 'paid_price_needed';
  end if;
  if p_paid_method is null or p_paid_method not in ('cash', 'credit') then
    raise exception 'paid_method_needed';
  end if;

  select * into b from buys where id = p_buy_id for update;
  if b.id is null or b.status <> 'draft' then
    raise exception 'stale_version';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = p_buy_id group by game) t;
  if coalesce(v_count, 0) = 0 then
    raise exception 'empty_buy';
  end if;

  v_cash   := coalesce(b.custom_cash_pct, p_cash_pct);
  v_credit := coalesce(b.custom_credit_pct, p_credit_pct);

  update buys
     set status = 'confirmed', confirmed_at = now(), confirmed_by = p_user,
         customer_name = v_customer, phone = v_phone, notes = coalesce(btrim(p_notes), ''),
         cash_pct = v_cash, credit_pct = v_credit,
         paid_price = p_paid_price, paid_method = p_paid_method, paid_at = now(),
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;
  -- Each card's rates, kept (docs/TEAM_FEEDBACK.md 4.6).
  perform internal.fix_line_rates(b);

  v_day := (now() at time zone 'America/Los_Angeles')::date;
  select count(*) into v_number
    from buys x
   where x.status = 'confirmed'
     and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
     and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = v_games[1]);
  v_target := format('Buy %s · %s', v_number, to_char(v_day, 'Dy Mon FMDD, YYYY'));

  select jsonb_agg(jsonb_build_object(
           'sign', '+', 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = p_buy_id;

  select * into v_user from staff_users where id = p_user;

  -- "5 cards bought from Alex M., (555) 123-4567; paid $120 in cash."
  v_from := concat_ws(', ', v_customer, format_phone(v_phone));

  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, totals, lines, summary)
  values (p_user, v_user.name, v_user.color, b.draft_device_id, 'buy', 'buy_confirmed',
          p_buy_id, v_target, v_games, v_count,
          internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)),
          coalesce(v_lines, '[]'::jsonb),
          sentence(format('%s card%s bought from %s; paid %s in %s', v_count,
                          case when v_count = 1 then '' else 's' end, v_from,
                          money_text(p_paid_price), p_paid_method)));

  return jsonb_build_object('number', v_number, 'games', to_jsonb(v_games), 'target_name', v_target);
end;
$function$;

-- project_to_buy: the new buy's cards keep their rates (4.6).
CREATE OR REPLACE FUNCTION public.project_to_buy(p_buy_id uuid, p_user uuid, p_device uuid, p_customer_name text, p_phone text, p_paid_price numeric, p_paid_method text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer DEFAULT NULL::integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  p          buys;
  b          buys;
  v_lock     collection_locks;
  v_customer text := nullif(btrim(regexp_replace(coalesce(p_customer_name, ''), '\s+', ' ', 'g')), '');
  v_phone    text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_games    text[];
  v_count    integer;
  v_market   numeric;
  v_number   integer;
  v_day      date;
  v_target   text;
  v_lines    jsonb;
  v_user     staff_users;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  -- What CONFIRM BUY asks for (confirm_buy, 0020).
  if v_customer is null then
    raise exception 'name_needed';
  end if;
  if v_phone ~ '^1[0-9]{10}$' then
    v_phone := substr(v_phone, 2);
  end if;
  if v_phone is null then
    raise exception 'phone_needed';
  end if;
  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'bad_phone';
  end if;
  if p_paid_price is null or p_paid_price < 0 then
    raise exception 'paid_price_needed';
  end if;
  if p_paid_method is null or p_paid_method not in ('cash', 'credit') then
    raise exception 'paid_method_needed';
  end if;

  select * into p from buys where id = p_buy_id and kind = 'collection' and project for update;
  if p.id is null then
    raise exception 'collection_gone';
  end if;
  if p.status <> 'paid' or exists (select 1 from buy_lines where buy_id = p.id and completed_at is not null) then
    raise exception 'project_completed';
  end if;
  if p_expected_version is not null and p.version <> p_expected_version then
    raise exception 'stale_version';
  end if;
  select * into v_lock from collection_locks where buy_id = p.id;
  if v_lock.buy_id is not null and v_lock.device_id is distinct from p_device
     and v_lock.heartbeat_at > now() - interval '60 seconds' then
    raise exception 'locked_elsewhere';
  end if;

  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = p.id group by game) t;
  if coalesce(v_count, 0) = 0 then
    raise exception 'empty_buy';
  end if;
  select jsonb_agg(jsonb_build_object(
           'sign', '+', 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = p.id;

  -- The project's custom rates stay custom; otherwise the rates it showed.
  insert into buys (kind, status, customer_name, phone, notes, draft_device_id,
                    confirmed_at, confirmed_by, paid_at, paid_price, paid_method,
                    cash_pct, credit_pct, custom_cash_pct, custom_credit_pct,
                    created_by, last_edited_by)
  values ('walk_in', 'confirmed', v_customer, v_phone, coalesce(btrim(p_notes), ''), p_device,
          now(), p_user, now(), p_paid_price, p_paid_method,
          coalesce(p.custom_cash_pct, p_cash_pct), coalesce(p.custom_credit_pct, p_credit_pct),
          p.custom_cash_pct, p.custom_credit_pct,
          p_user, p_user)
  returning * into b;

  update buy_lines set buy_id = b.id where buy_id = p.id;
  -- Each card's rates, kept (docs/TEAM_FEEDBACK.md 4.6); cards from a buy keep theirs.
  perform internal.fix_line_rates(b);

  -- Its number on today's page, counted as confirm_buy counts it.
  v_day := (now() at time zone 'America/Los_Angeles')::date;
  select count(*) into v_number
    from buys x
   where x.kind = 'walk_in' and x.status = 'confirmed'
     and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
     and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = v_games[1]);
  v_target := format('Buy %s · %s', v_number, to_char(v_day, 'Dy Mon FMDD, YYYY'));

  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, totals, lines, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'project_converted',
          b.id, v_target, v_games, v_count,
          internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)),
          coalesce(v_lines, '[]'::jsonb),
          jsonb_build_array(jsonb_build_object('field', 'name', 'before', p.customer_name, 'after', v_customer)),
          sentence(format('%s card%s from the project %s, bought from %s; paid %s in %s', v_count,
                          case when v_count = 1 then '' else 's' end, p.customer_name,
                          concat_ws(', ', v_customer, format_phone(v_phone)),
                          money_text(p_paid_price), p_paid_method)));

  delete from buys where id = p.id;
  return jsonb_build_object('id', b.id, 'number', v_number, 'games', to_jsonb(v_games),
                            'target_name', v_target, 'day', to_char(v_day, 'YYYY-MM-DD'));
end;
$function$;

-- buy_to_project: the cards carry their rates; the project's totals.
CREATE OR REPLACE FUNCTION public.buy_to_project(p_buy_id uuid, p_name text, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_name   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  b        buys;
  p        buys;
  v_target text;
  v_games  text[];
  v_count  integer;
  v_market numeric;
  v_lines  jsonb;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
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
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id;

  -- The buy's phone, and its user as the project's maker: the Cash buys file
  -- names who bought it (owner, 2026-10-02).
  insert into buys (kind, status, project, customer_name, phone, notes, paid_at,
                    cash_pct, credit_pct, paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, b.phone, coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          b.cash_pct, b.credit_pct, b.paid_price, b.paid_method, coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;

  update buy_lines set buy_id = p.id where buy_id = b.id;

  -- One entry: the cards added to the new project (owner, 2026-10-02).
  perform collection_event(p, p_user, p_device, 'buy_converted', coalesce(v_games, '{}'),
    coalesce(v_count, 0), 0, internal.lines_totals(p, array(select l from buy_lines l where l.buy_id = p.id)),
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '+')), '[]'::jsonb) from jsonb_array_elements(v_lines) x),
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name)),
    sentence(format('Project started from %s: %s', v_target, v_name)));

  delete from buys where id = b.id;
  return p.id;
end;
$function$;

-- collection_add_line: not merged into a card with its own rate; the added copies at the card's rate.
CREATE OR REPLACE FUNCTION public.collection_add_line(p_buy_id uuid, p_line jsonb, p_merge boolean, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b      buys;
  r      buy_lines;
  v_line uuid;
  v_rec  buy_lines;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  if p_merge then
    select id into v_line from buy_lines l
     where l.buy_id = p_buy_id
       and l.game = r.game and l.lang = r.lang
       and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
       and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
       and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
       and l.treatments = coalesce(r.treatments, '[]'::jsonb)
       and l.condition = r.condition
       and l.unit_price = r.unit_price and l.price_source = r.price_source
       and l.custom_cash_pct is null and l.custom_credit_pct is null   -- own rates stay that card's
     limit 1;
  end if;

  if v_line is not null then
    update buy_lines set quantity = quantity + r.quantity where id = v_line;
  else
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url)
    values (
      p_buy_id,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = p_buy_id),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = p_buy_id;

  -- The copies added, at the card's rate (and on the row, for a folded run's totals).
  select * into v_rec from buy_lines where id = v_line;
  v_rec.quantity := r.quantity;
  perform collection_event(b, p_user, p_device, 'collection_cards_added', array[r.game], r.quantity, 0,
    internal.lines_totals(b, array[v_rec]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', r.game,
      'unit_price', r.unit_price, 'text', coalesce(p_text, r.quantity || ' ' || r.name),
      'cash_pct', internal.line_pct(v_rec, b, 'cash'), 'credit_pct', internal.line_pct(v_rec, b, 'credit'))),
    '[]', sentence(format('%s card%s added', r.quantity, case when r.quantity = 1 then '' else 's' end)));
  return v_line;
end;
$function$;

-- collection_remove_line: the copies removed, at the card's rate.
CREATE OR REPLACE FUNCTION public.collection_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b     buys;
  v_old buy_lines;
  v_n   integer;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  -- Paid/Ours may still lose cards (owner, 2026-09-29); Completed may not.
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  if v_n >= v_old.quantity then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - v_n where id = p_line_id;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_old.buy_id;

  v_old.quantity := v_n;   -- the copies removed, at the card's rate (and on the row, for a folded run)
  perform collection_event(b, p_user, p_device, 'collection_cards_removed', array[v_old.game], 0, v_n,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(format('%s card%s removed', v_n, case when v_n = 1 then '' else 's' end)));
end;
$function$;

-- collection_delete: the deleted collection's totals.
CREATE OR REPLACE FUNCTION public.collection_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_typed_name text, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_lock   collection_locks;
  v_games  text[];
  v_count  integer;
  v_market numeric;
  v_lines  jsonb;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  -- Can't upload cards can't be deleted (spec 9.1).
  if exists (select 1 from buys where id = p_buy_id and system_key is not null) then
    raise exception 'system_collection';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'collection' for update;
  if b.id is null then
    raise exception 'collection_gone';
  end if;
  if lower(btrim(coalesce(p_typed_name, ''))) <> lower(btrim(b.customer_name)) then
    raise exception 'name_mismatch';
  end if;
  select * into v_lock from collection_locks where buy_id = p_buy_id;
  if v_lock.buy_id is not null and v_lock.device_id is distinct from p_device
     and v_lock.heartbeat_at > now() - interval '60 seconds' then
    raise exception 'locked_elsewhere';
  end if;

  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = p_buy_id group by game) t;

  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = p_buy_id;

  perform collection_event(b, p_user, p_device, 'collection_deleted', coalesce(v_games, '{}'),
    0, coalesce(v_count, 0), internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), coalesce(v_lines, '[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object('field', 'name', 'before', b.customer_name, 'after', null),
      jsonb_build_object('field', 'phone', 'before', format_phone(b.phone), 'after', null)),
    sentence(format('Collection deleted with %s card%s', coalesce(v_count, 0),
                    case when coalesce(v_count, 0) = 1 then '' else 's' end)));

  delete from buys where id = p_buy_id;
end;
$function$;

-- collection_reprice: REPRICE? works the repriced cards' rates out again (4.6).
CREATE OR REPLACE FUNCTION public.collection_reprice(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_before numeric;
  v_after  numeric;
  v_n      integer;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  if b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  if b.status = 'paid' and b.system_key is null and not b.project then
    raise exception 'collection_paid';
  end if;
  select coalesce(sum(unit_price * quantity), 0) into v_before from buy_lines where buy_id = p_buy_id;

  update buy_lines l set
    unit_price         = (e ->> 'unit_price')::numeric,
    market_price       = (e ->> 'market_price')::numeric,
    price_source       = e ->> 'price_source',
    price_snapshot     = e -> 'price_snapshot',
    priced_at          = coalesce((e ->> 'priced_at')::timestamptz, now()),
    justtcg_card_id    = e ->> 'justtcg_card_id',
    justtcg_variant_id = e ->> 'justtcg_variant_id',
    cash_pct           = null,   -- rates worked out again, with the prices
    credit_pct         = null
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
  where l.id = (e ->> 'line_id')::uuid and l.buy_id = p_buy_id;
  get diagnostics v_n = row_count;

  select coalesce(sum(unit_price * quantity), 0) into v_after from buy_lines where buy_id = p_buy_id;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_repriced', '{}', 0, 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), '[]',
    jsonb_build_array(jsonb_build_object('field', 'market', 'before', money_text(v_before), 'after', money_text(v_after))),
    format('Repriced at today''s prices: %s card line%s, market %s → %s.', v_n,
           case when v_n = 1 then '' else 's' end, money_text(v_before), money_text(v_after)));
  return jsonb_build_object('lines', v_n, 'before', v_before, 'after', v_after);
end;
$function$;

-- collection_set_status: Paid/Ours and Rejected keep each card's rates; unlocking clears them.
CREATE OR REPLACE FUNCTION public.collection_set_status(p_buy_id uuid, p_status text, p_user uuid, p_device uuid, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_offer_cash numeric DEFAULT NULL::numeric, p_offer_credit numeric DEFAULT NULL::numeric, p_paid_price numeric DEFAULT NULL::numeric, p_paid_method text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_was    text;
  v_cash   numeric;
  v_credit numeric;
  v_market numeric;
  v_rows   jsonb;
  v_totals jsonb := null;
  v_summary text;
  v_undo    uuid[];
  v_back    integer := 0;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  -- Can't upload cards is always Paid/Ours (spec 9.1).
  if exists (select 1 from buys where id = p_buy_id and system_key is not null) then
    raise exception 'system_collection';
  end if;
  if p_status not in ('processing', 'priced', 'paid', 'completed', 'rejected') then
    raise exception 'bad_status';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  -- A project is only ever Paid/Ours, or Completed by EXPORT (owner, 2026-10-01).
  if b.project and p_status in ('processing', 'priced', 'rejected') then
    raise exception 'project_status';
  end if;
  v_was := b.status;
  if p_status = v_was then
    return;
  end if;
  -- Rejected (owner, 2026-10-09): only from Processing or Priced, and only
  -- reopened back to where it was, Priced (with its offer) or Processing.
  if p_status = 'rejected' and v_was not in ('processing', 'priced') then
    raise exception 'reject_from';
  end if;
  if v_was = 'rejected' and p_status not in ('processing', 'priced') then
    raise exception 'rejected_reopen';
  end if;
  -- Leaving Completed undoes its export (export spec 9.4): the stamps go, so
  -- the buy prices show again, and its cards come back out of Can't upload
  -- cards.
  if v_was = 'completed' then
    select array_agg(id) into v_undo from buy_lines where buy_id = p_buy_id and cc_status is not null;
    if v_undo is not null then
      update buy_lines set
        cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
        cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
        cc_exported_at = null
      where id = any(v_undo);
      v_back := cant_upload_return(v_undo, b.customer_name, p_user, p_device);
    end if;
  end if;
  v_cash := coalesce(b.custom_cash_pct, p_cash_pct, master_pct('cash_pct'));
  v_credit := coalesce(b.custom_credit_pct, p_credit_pct, master_pct('credit_pct'));
  select coalesce(sum(unit_price * quantity), 0) into v_market from buy_lines where buy_id = p_buy_id;
  v_rows := jsonb_build_array(jsonb_build_object('field', 'status',
    'before', status_label(v_was), 'after', status_label(p_status)));

  if p_status = 'rejected' then
    -- The customer said no: locked, out of search, kept with its prices and
    -- offer until deleted (owner, 2026-10-09).
    -- Its rates are kept as they were, like Paid/Ours, so its totals read
    -- the same later whatever the Master Buy Percentages become.
    update buys
       set status = 'rejected', rejected_at = now(),
           rejected_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           cash_pct = v_cash, credit_pct = v_credit,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    perform internal.fix_line_rates(b);
    if b.rejected_reason is not null then
      v_rows := v_rows || jsonb_build_object('field', 'reason', 'before', null, 'after', b.rejected_reason);
    end if;
    v_totals := internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id));
    v_summary := case when b.rejected_reason is not null
                      then sentence('Rejected: ' || b.rejected_reason)
                      else 'Rejected.' end;

  elsif v_was = 'rejected' then
    -- Reopened: back to Priced (the offer still stands) or Processing.
    if p_status = 'priced' and b.offer_cash is null then
      raise exception 'offer_needed';
    end if;
    update buys
       set status = p_status, rejected_at = null, rejected_reason = null,
           cash_pct = null, credit_pct = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    perform internal.unfix_line_rates(b.id);
    v_summary := sentence('Reopened: back to ' || status_label(p_status));

  elsif p_status = 'priced' and v_was = 'processing' then
    if p_offer_cash is null or p_offer_cash < 0 then
      raise exception 'offer_needed';
    end if;
    update buys
       set status = 'priced', offer_cash = p_offer_cash,
           offer_credit = coalesce(p_offer_credit,
             case when v_cash > 0 then round_down_price(p_offer_cash * v_credit / v_cash) end),
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_rows := v_rows || jsonb_build_object('field', 'offer', 'before', null,
      'after', concat_ws(' / ', money_text(b.offer_cash) || ' cash', money_text(b.offer_credit) || ' credit'));
    v_totals := internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id));
    v_summary := sentence('Marked Priced: offered ' || concat_ws(' / ',
      money_text(b.offer_cash) || ' cash', money_text(b.offer_credit) || ' credit'));

  elsif p_status = 'paid' and v_was = 'completed' then
    -- Reopened: back to Paid/Ours, still locked, with what was paid.
    update buys
       set status = 'paid', completed_at = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := 'Reopened: back to Paid/Ours, still locked.';

  elsif p_status = 'paid' then
    if p_paid_price is null or p_paid_price < 0 then
      raise exception 'paid_price_needed';
    end if;
    if p_paid_method is null or p_paid_method not in ('cash', 'credit') then
      raise exception 'paid_method_needed';
    end if;
    update buys
       set status = 'paid', paid_at = now(), completed_at = null,
           cash_pct = v_cash, credit_pct = v_credit,
           paid_price = p_paid_price, paid_method = p_paid_method,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    perform internal.fix_line_rates(b);
    v_rows := v_rows || jsonb_build_object('field', 'paid', 'before', null,
      'after', money_text(p_paid_price) || ' ' || p_paid_method);
    v_totals := internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id));
    v_summary := format('Marked Paid/Ours: paid %s in %s, locked.', money_text(p_paid_price), p_paid_method);

  elsif p_status = 'completed' then
    -- Only EXPORT marks a collection Completed (owner, 2026-10-01; export_lines).
    raise exception 'complete_by_export';

  else
    -- Back to Priced or Processing: not paid after all. From Processing to
    -- Priced without an offer can't happen (handled above).
    update buys
       set status = p_status, paid_at = null, completed_at = null,
           cash_pct = null, credit_pct = null, paid_price = null, paid_method = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    perform internal.unfix_line_rates(b.id);
    v_summary := case when v_was in ('paid', 'completed')
                      then sentence('Unlocked: back to ' || status_label(p_status))
                      else sentence('Marked ' || status_label(p_status)) end;
  end if;

  if v_undo is not null then
    v_summary := v_summary || ' Its export was undone' || case when v_back > 0
      then format(': %s card%s taken back out of Can''t upload cards.', v_back, case when v_back = 1 then '' else 's' end)
      else '.' end;
  end if;
  perform collection_event(b, p_user, p_device, 'collection_status_changed', '{}', 0, 0, v_totals, '[]',
    v_rows, v_summary);
end;
$function$;

-- import_lines: the imported cards' totals.
CREATE OR REPLACE FUNCTION internal.import_lines(b buys, p_lines jsonb, p_user uuid, p_device uuid, p_file text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  r       buy_lines;
  v_item  jsonb;
  v_pos   integer := 0;
  v_cards integer := 0;
  v_sum   numeric := 0;
  v_rows  jsonb := '[]';
  v_file  text := nullif(btrim(coalesce(p_file, '')), '');
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'nothing_to_import';
  end if;
  if exists (select 1 from buy_lines where buy_id = b.id) then
    raise exception 'not_empty';
  end if;
  for v_item in select value from jsonb_array_elements(p_lines) loop
    r := jsonb_populate_record(null::buy_lines, v_item);
    if r.game is distinct from 'mtg' then
      raise exception 'import_magic_only';
    end if;
    if r.quantity is null or r.quantity < 1 or r.unit_price is null or r.unit_price < 0 then
      raise exception 'bad_import_line';
    end if;
    v_pos := v_pos + 1;
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url)
    values (
      b.id, v_pos, 'mtg', 'en', r.name, null, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, false,
      coalesce(r.treatments, '[]'::jsonb), coalesce(r.condition, 'NM'), r.quantity, r.unit_price, r.market_price,
      'import', r.price_snapshot, coalesce(r.priced_at, now()), r.scryfall_id, r.oracle_id, null,
      r.tcgplayer_id, null, null, r.image_url);
    v_cards := v_cards + r.quantity;
    v_sum := v_sum + r.unit_price * r.quantity;
    v_rows := v_rows || jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', 'mtg',
      'unit_price', r.unit_price, 'text', coalesce(v_item ->> 'text', r.quantity || ' ' || r.name));
  end loop;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  perform collection_event(b, p_user, p_device, 'collection_imported', array['mtg'], v_cards, 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), v_rows,
    case when v_file is not null
         then jsonb_build_array(jsonb_build_object('field', 'file', 'before', null, 'after', v_file))
         else '[]'::jsonb end,
    sentence(format('%s card%s imported%s', v_cards, case when v_cards = 1 then '' else 's' end,
      case when v_file is not null then ' from ' || v_file else '' end)));
  return v_cards;
end;
$function$;

-- draft_add_line: a card with its own rate isn't merged into.
CREATE OR REPLACE FUNCTION public.draft_add_line(p_device uuid, p_line jsonb, p_user uuid, p_merge boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy  uuid;
  v_line uuid;
  r      buy_lines;
begin
  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;
  v_buy := draft_for_device(p_device, p_user);

  if p_merge then
    select id into v_line from buy_lines l
     where l.buy_id = v_buy
       and l.game = r.game and l.lang = r.lang
       and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
       and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
       and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
       and l.treatments = coalesce(r.treatments, '[]'::jsonb)
       and l.condition = r.condition
       and l.unit_price = r.unit_price and l.price_source = r.price_source
       and l.custom_cash_pct is null and l.custom_credit_pct is null   -- own rates stay that card's
     limit 1;
  end if;

  if v_line is not null then
    update buy_lines set quantity = quantity + r.quantity where id = v_line;
  else
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url)
    values (
      v_buy,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = v_buy),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  return v_line;
end;
$function$;

-- draft_update_line: an edited card merges only with one on the same own rates.
CREATE OR REPLACE FUNCTION public.draft_update_line(p_line_id uuid, p_line jsonb, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy   uuid;
  v_pos   integer;
  v_other uuid;
  v_opos  integer;
  r       buy_lines;
begin
  select l.buy_id, l.position into v_buy, v_pos
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    raise exception 'line_gone';   -- removed, confirmed or cancelled meanwhile
  end if;

  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  update buy_lines set
    game = r.game, lang = r.lang, name = r.name, name_en = r.name_en, name_key = r.name_key,
    set_code = r.set_code, set_name = r.set_name, source_set_id = r.source_set_id,
    collector_number = r.collector_number, printed_size = r.printed_size, rarity = r.rarity,
    finish = r.finish, first_edition = coalesce(r.first_edition, false),
    treatments = coalesce(r.treatments, '[]'::jsonb), condition = r.condition,
    quantity = r.quantity, unit_price = r.unit_price, market_price = r.market_price,
    price_source = r.price_source, price_snapshot = r.price_snapshot, priced_at = r.priced_at,
    scryfall_id = r.scryfall_id, oracle_id = r.oracle_id, tcgdex_id = r.tcgdex_id,
    tcgplayer_id = r.tcgplayer_id, justtcg_card_id = r.justtcg_card_id,
    justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url
  where id = p_line_id;

  select l.id, l.position into v_other, v_opos from buy_lines l
   where l.buy_id = v_buy and l.id <> p_line_id
     and l.game = r.game and l.lang = r.lang
     and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
     and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
     and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
     and l.treatments = coalesce(r.treatments, '[]'::jsonb)
     and l.condition = r.condition
     and l.unit_price = r.unit_price and l.price_source = r.price_source
     and l.custom_cash_pct is not distinct from (select x.custom_cash_pct from buy_lines x where x.id = p_line_id)
     and l.custom_credit_pct is not distinct from (select x.custom_credit_pct from buy_lines x where x.id = p_line_id)
   order by l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_pos then
      update buy_lines set quantity = quantity + r.quantity where id = v_other;
      delete from buy_lines where id = p_line_id;
      p_line_id := v_other;
    else
      update buy_lines set quantity = quantity + (select quantity from buy_lines where id = v_other)
       where id = p_line_id;
      delete from buy_lines where id = v_other;
    end if;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  return p_line_id;
end;
$function$;

-- collection_update_line: an edited card merges only with one on the same own rates.
CREATE OR REPLACE FUNCTION public.collection_update_line(p_line_id uuid, p_line jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_old_text text, p_new_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b       buys;
  v_old   buy_lines;
  v_other uuid;
  v_opos  integer;
  r       buy_lines;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, true);

  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  update buy_lines set
    game = r.game, lang = r.lang, name = r.name, name_en = r.name_en, name_key = r.name_key,
    set_code = r.set_code, set_name = r.set_name, source_set_id = r.source_set_id,
    collector_number = r.collector_number, printed_size = r.printed_size, rarity = r.rarity,
    finish = r.finish, first_edition = coalesce(r.first_edition, false),
    treatments = coalesce(r.treatments, '[]'::jsonb), condition = r.condition,
    quantity = r.quantity, unit_price = r.unit_price, market_price = r.market_price,
    price_source = r.price_source, price_snapshot = r.price_snapshot, priced_at = r.priced_at,
    scryfall_id = r.scryfall_id, oracle_id = r.oracle_id, tcgdex_id = r.tcgdex_id,
    tcgplayer_id = r.tcgplayer_id, justtcg_card_id = r.justtcg_card_id,
    justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url
  where id = p_line_id;

  select l.id, l.position into v_other, v_opos from buy_lines l
   where l.buy_id = v_old.buy_id and l.id <> p_line_id
     and l.game = r.game and l.lang = r.lang
     and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
     and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
     and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
     and l.treatments = coalesce(r.treatments, '[]'::jsonb)
     and l.condition = r.condition
     and l.unit_price = r.unit_price and l.price_source = r.price_source
     and l.custom_cash_pct is not distinct from (select x.custom_cash_pct from buy_lines x where x.id = p_line_id)
     and l.custom_credit_pct is not distinct from (select x.custom_credit_pct from buy_lines x where x.id = p_line_id)
   order by l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_old.position then
      update buy_lines set quantity = quantity + r.quantity where id = v_other;
      delete from buy_lines where id = p_line_id;
      p_line_id := v_other;
    else
      update buy_lines set quantity = quantity + (select quantity from buy_lines where id = v_other)
       where id = p_line_id;
      delete from buy_lines where id = v_other;
    end if;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_old.buy_id;

  perform collection_event(b, p_user, p_device, 'collection_line_edited',
    (select array_agg(distinct g order by g) from unnest(array[v_old.game, r.game]) g),
    r.quantity, v_old.quantity, null,
    jsonb_build_array(
      jsonb_build_object('sign', '-', 'qty', v_old.quantity, 'game', v_old.game, 'unit_price', v_old.unit_price,
        'text', coalesce(p_old_text, v_old.quantity || ' ' || v_old.name)),
      jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', r.game, 'unit_price', r.unit_price,
        'text', coalesce(p_new_text, r.quantity || ' ' || r.name))),
    '[]', 'Card edited.');
  return p_line_id;
end;
$function$;

-- ---------------------------------------------------------------- gone
-- Every caller now passes the totals (internal.lines_totals).
drop function internal.buy_event(buys, uuid, uuid, text, text, text[], integer, numeric, jsonb, text);
drop function internal.collection_totals(buys, numeric);
