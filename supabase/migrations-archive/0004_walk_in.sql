-- Phase 6: walk-in buys (spec 6.1, 6.2, 8.8–8.10).
--   * custom Cash / Credit rates for one buy (spec 8.9.1);
--   * two more price sources (spec 8.7, owner 2026-09-29): 'cardmarket'
--     (Use Cardmarket, and Japanese cards' automatic fallback) and
--     'justtcg_fallback' (JustTCG's own NM × a Master Fallback Percentage);
--   * the draft write functions and confirm_buy, which writes its changelog
--     entry in the same transaction (spec 6.2).
-- 0001–0003 are applied; this file only adds.

alter table public.buys
  add column custom_cash_pct   numeric(5,2) check (custom_cash_pct between 0 and 100),
  add column custom_credit_pct numeric(5,2) check (custom_credit_pct between 0 and 100);

alter table public.buy_lines drop constraint buy_lines_price_source_check;
alter table public.buy_lines add constraint buy_lines_price_source_check check (price_source in
  ('justtcg', 'justtcg_fallback', 'scryfall_fallback', 'tcgdex_fallback', 'cardmarket', 'manual'));

-- ---------------------------------------------------------------------------
-- round_down_price: the store's rounding (spec 7.8), the same as the app's
-- roundDownPrice: always down; under $1 to the cent, $1–$10 to the quarter,
-- $10–$100 to the dollar, $100–$1,000 to the $5, $1,000 and up to the $10.
-- ---------------------------------------------------------------------------
create or replace function public.round_down_price(p numeric) returns numeric
language sql immutable
as $$
  select (floor(c / s) * s) / 100
  from (select floor(round(p * 100, 6)) as c) x,
       lateral (select case when x.c >= 100000 then 1000 when x.c >= 10000 then 500
                            when x.c >= 1000 then 100 when x.c >= 100 then 25 else 1 end as s) y
$$;

-- ---------------------------------------------------------------------------
-- draft_for_device: this computer's draft, created if it has none. Two tabs
-- on one computer share it (spec 8.12); the partial unique index makes the
-- second insert a no-op.
-- ---------------------------------------------------------------------------
create or replace function public.draft_for_device(p_device uuid, p_user uuid) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_buy uuid;
begin
  select id into v_buy from buys
   where draft_device_id = p_device and status = 'draft'
   for update;
  if v_buy is null then
    insert into buys (kind, status, draft_device_id, created_by, last_edited_by)
    values ('walk_in', 'draft', p_device, p_user, p_user)
    on conflict (draft_device_id) where status = 'draft' do nothing
    returning id into v_buy;
    if v_buy is null then
      select id into v_buy from buys
       where draft_device_id = p_device and status = 'draft'
       for update;
    end if;
  end if;
  return v_buy;
end;
$$;

-- ---------------------------------------------------------------------------
-- draft_add_line: add a line to this computer's draft, or merge it into an
-- identical one (spec 6.1: game, lang, printing, finish, 1st Edition,
-- treatments, condition, unit price and price source all match), which then
-- keeps its place in the list. Returns the line's id. Drafts aren't logged.
-- ---------------------------------------------------------------------------
create or replace function public.draft_add_line(p_device uuid, p_line jsonb, p_user uuid, p_merge boolean default true)
returns uuid
language plpgsql
set search_path = public
as $$
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
     limit 1;
  end if;

  if v_line is not null then
    update buy_lines set quantity = quantity + r.quantity where id = v_line;
  else
    insert into buy_lines (
      buy_id, position, game, lang, name, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url)
    values (
      v_buy,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = v_buy),
      r.game, r.lang, r.name, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  return v_line;
end;
$$;

-- ---------------------------------------------------------------------------
-- draft_remove_line: take p_qty copies off a draft line; the line goes when
-- none are left (spec 8.9: removal is permanent). Not logged.
-- ---------------------------------------------------------------------------
create or replace function public.draft_remove_line(p_line_id uuid, p_qty integer, p_user uuid) returns void
language plpgsql
set search_path = public
as $$
declare
  v_buy uuid;
  v_qty integer;
begin
  select l.buy_id, l.quantity into v_buy, v_qty
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    return;   -- already gone (another tab removed it)
  end if;
  if p_qty >= v_qty then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - greatest(p_qty, 1) where id = p_line_id;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
end;
$$;

-- ---------------------------------------------------------------------------
-- draft_cancel: discard a draft and its lines (and any custom rates). Not
-- logged: drafts aren't part of the record (spec 8.10).
-- ---------------------------------------------------------------------------
create or replace function public.draft_cancel(p_buy_id uuid) returns void
language sql
set search_path = public
as $$
  delete from buys where id = p_buy_id and status = 'draft';
$$;

-- ---------------------------------------------------------------------------
-- draft_set_custom_rates: this computer's draft's custom Cash / Credit %
-- (null = the Master Buy Percentage). Creates the draft if there's none, so a
-- rate can be set before the first card (spec 8.9.1). Not logged.
-- ---------------------------------------------------------------------------
create or replace function public.draft_set_custom_rates(p_device uuid, p_cash numeric, p_credit numeric, p_user uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_buy uuid;
begin
  v_buy := draft_for_device(p_device, p_user);
  update buys
     set custom_cash_pct = p_cash, custom_credit_pct = p_credit,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_buy;
  return v_buy;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_buy: draft → confirmed, stamping who and when and snapshotting the
-- rates (the custom rate where set, else the master rate the screen showed),
-- and writes the `buy_confirmed` changelog entry in the same transaction
-- (spec 6.2, 12.3). Refused with 'stale_version' if the draft changed since
-- the screen read it, and with 'empty_buy' if it has no lines.
--
-- "Buy N" (spec 10.2) is numbered among the day's confirmed buys (store time)
-- that have cards of the buy's first game, Magic before Pokémon, which is
-- also the day page its changelog entry links to.
--
-- p_line_texts: { line id: the line as the buy list shows it } from the
-- app's line formatter (lineFormat.js), for the changelog's card rows.
-- Returns { number, games, target_name }.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_buy(
  p_buy_id           uuid,
  p_user             uuid,
  p_customer_name    text,
  p_notes            text,
  p_cash_pct         numeric,
  p_credit_pct       numeric,
  p_expected_version integer,
  p_line_texts       jsonb default '{}'
) returns jsonb
language plpgsql
set search_path = public
as $$
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
  v_lines    jsonb;
  v_user     staff_users;
begin
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
         customer_name = v_customer, notes = coalesce(btrim(p_notes), ''),
         cash_pct = v_cash, credit_pct = v_credit,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id;

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

  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, totals, lines, summary)
  values (p_user, v_user.name, v_user.color, b.draft_device_id, 'buy', 'buy_confirmed',
          p_buy_id, v_target, v_games, v_count,
          jsonb_build_object('market', v_market,
                             'cash', round_down_price(v_market * v_cash / 100),
                             'credit', round_down_price(v_market * v_credit / 100),
                             'cash_pct', v_cash, 'credit_pct', v_credit),
          coalesce(v_lines, '[]'::jsonb),
          format('%s card%s bought%s.', v_count, case when v_count = 1 then '' else 's' end,
                 case when v_customer is null then '' else ' from ' || v_customer end));

  return jsonb_build_object('number', v_number, 'games', to_jsonb(v_games), 'target_name', v_target);
end;
$$;

-- ---------------------------------------------------------------------------
-- The store (authenticated) may call these; signed-out visitors may not.
-- ---------------------------------------------------------------------------
revoke execute on function public.round_down_price(numeric) from public, anon;
revoke execute on function public.draft_for_device(uuid, uuid) from public, anon;
revoke execute on function public.draft_add_line(uuid, jsonb, uuid, boolean) from public, anon;
revoke execute on function public.draft_remove_line(uuid, integer, uuid) from public, anon;
revoke execute on function public.draft_cancel(uuid) from public, anon;
revoke execute on function public.draft_set_custom_rates(uuid, numeric, numeric, uuid) from public, anon;
revoke execute on function public.confirm_buy(uuid, uuid, text, text, numeric, numeric, integer, jsonb) from public, anon;

grant execute on function public.round_down_price(numeric) to authenticated;
grant execute on function public.draft_for_device(uuid, uuid) to authenticated;
grant execute on function public.draft_add_line(uuid, jsonb, uuid, boolean) to authenticated;
grant execute on function public.draft_remove_line(uuid, integer, uuid) to authenticated;
grant execute on function public.draft_cancel(uuid) to authenticated;
grant execute on function public.draft_set_custom_rates(uuid, numeric, numeric, uuid) to authenticated;
grant execute on function public.confirm_buy(uuid, uuid, text, text, numeric, numeric, integer, jsonb) to authenticated;
