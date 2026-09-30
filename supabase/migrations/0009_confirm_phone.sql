-- An optional phone number when confirming a walk-in buy (owner,
-- 2026-09-29), like a collection's: stored as 10 digits on the buy
-- (buys.phone), shown formatted in the entry's summary so it can be found
-- later. confirm_buy gains p_phone; the old signature goes so there's one.

drop function public.confirm_buy(uuid, uuid, text, text, numeric, numeric, integer, jsonb);

create function public.confirm_buy(
  p_buy_id           uuid,
  p_user             uuid,
  p_customer_name    text,
  p_notes            text,
  p_cash_pct         numeric,
  p_credit_pct       numeric,
  p_expected_version integer,
  p_line_texts       jsonb default '{}',
  p_phone            text default null
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
  v_phone    text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_from     text;
  v_lines    jsonb;
  v_user     staff_users;
begin
  -- 10 digits; a leading 1 (the country code) is dropped (spec 9.3).
  if v_phone ~ '^1[0-9]{10}$' then
    v_phone := substr(v_phone, 2);
  end if;
  if v_phone is not null and v_phone !~ '^[0-9]{10}$' then
    raise exception 'bad_phone';
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

  -- "5 cards bought from Alex M., (555) 123-4567." — name, phone, both or neither.
  v_from := concat_ws(', ', v_customer, format_phone(v_phone));

  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, totals, lines, summary)
  values (p_user, v_user.name, v_user.color, b.draft_device_id, 'buy', 'buy_confirmed',
          p_buy_id, v_target, v_games, v_count,
          jsonb_build_object('market', v_market,
                             'cash', round_down_price(v_market * v_cash / 100),
                             'credit', round_down_price(v_market * v_credit / 100),
                             'cash_pct', v_cash, 'credit_pct', v_credit),
          coalesce(v_lines, '[]'::jsonb),
          sentence(format('%s card%s bought%s', v_count, case when v_count = 1 then '' else 's' end,
                          case when v_from = '' then '' else ' from ' || v_from end)));

  return jsonb_build_object('number', v_number, 'games', to_jsonb(v_games), 'target_name', v_target);
end;
$$;

revoke execute on function public.confirm_buy(uuid, uuid, text, text, numeric, numeric, integer, jsonb, text)
  from public, anon;
grant execute on function public.confirm_buy(uuid, uuid, text, text, numeric, numeric, integer, jsonb, text)
  to authenticated;
