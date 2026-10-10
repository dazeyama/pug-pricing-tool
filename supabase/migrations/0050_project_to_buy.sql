-- Convert to buy… (owner, 2026-10-10): a project's ⋯ menu, the way back from
-- Convert to project (0036–0039). Every card, both games, moves to a new
-- walk-in buy on today's day page, confirmed now by the user, as if CONFIRM
-- BUY had just been pressed on the Buy tab: the customer's name and phone and
-- the price paid (Cash or Credit) are required, as confirm_buy requires them.
-- The buy keeps the project's notes (as typed in the dialog) and custom
-- rates, and the project is deleted. Cards keep their prices. A Completed
-- project (exported) can't be converted. One Changelog entry, on the new buy,
-- filed under Buys: its cards, who they were bought from and what was paid.

create function public.project_to_buy(
  p_buy_id           uuid,
  p_user             uuid,
  p_device           uuid,
  p_customer_name    text,
  p_phone            text,
  p_paid_price       numeric,
  p_paid_method      text,
  p_notes            text,
  p_cash_pct         numeric,
  p_credit_pct       numeric,
  p_expected_version integer default null,
  p_line_texts       jsonb default '{}'
) returns jsonb
language plpgsql
set search_path = public, internal
as $$
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
          jsonb_build_object('market', v_market,
                             'cash', round_down_price(v_market * b.cash_pct / 100),
                             'credit', round_down_price(v_market * b.credit_pct / 100),
                             'cash_pct', b.cash_pct, 'credit_pct', b.credit_pct),
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
$$;
revoke execute on function
  public.project_to_buy(uuid, uuid, uuid, text, text, numeric, text, text, numeric, numeric, integer, jsonb)
  from public, anon;
grant execute on function
  public.project_to_buy(uuid, uuid, uuid, text, text, numeric, text, text, numeric, numeric, integer, jsonb)
  to authenticated;
