-- Projects don't strike (owner, 2026-10-16): a project's × removes a card at
-- once, like Can't upload cards'. Convert to project leaves a buy's struck
-- cards out (they were moved elsewhere), listed crossed out in its Changelog
-- entry so the record stays.

CREATE OR REPLACE FUNCTION public.collection_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b     buys;
  v_old buy_lines;
  v_n   integer;
  v_id  uuid;
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
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.system_key is not null then
    raise exception 'system_collection';
  end if;
  if b.project then
    raise exception 'project_no_strike';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  if b.status <> 'paid' then
    raise exception 'strike_paid_only';
  end if;
  if v_old.completed_at is not null then
    raise exception 'line_completed';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  v_id := internal.strike_line(v_old.id, v_n, p_user);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  v_old.quantity := v_n;   -- the copies struck, at the card's rate
  perform collection_event(b, p_user, p_device, 'collection_cards_struck', array[v_old.game], 0, 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'struck', true, 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(format('%s card%s struck: kept on the list, crossed out, and never exported', v_n,
                          case when v_n = 1 then '' else 's' end)));
  return v_id;
end;
$function$
;
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
  v_struck jsonb;
  v_gone   integer;
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
    from (select game as g, sum(quantity) filter (where struck_at is null) as q,
                 sum(unit_price * quantity) filter (where struck_at is null) as m
            from buy_lines where buy_id = b.id group by game) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null;
  -- Struck cards stay out of the project, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null;

  -- The buy's phone, and its user as the project's maker: the Cash buys file
  -- names who bought it (owner, 2026-10-02).
  insert into buys (kind, status, project, customer_name, phone, notes, paid_at,
                    cash_pct, credit_pct, paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, b.phone, coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          null, null, b.paid_price, b.paid_method, coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;

  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null;
  -- Projects are the store's own cards: no rates (owner, 2026-10-15).
  update buy_lines set custom_cash_pct = null, custom_credit_pct = null, cash_pct = null, credit_pct = null where buy_id = p.id;

  -- One entry: the cards added to the new project (owner, 2026-10-02).
  perform collection_event(p, p_user, p_device, 'buy_converted', coalesce(v_games, '{}'),
    coalesce(v_count, 0), 0, internal.lines_totals(p, array(select l from buy_lines l where l.buy_id = p.id)),
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '+')), '[]'::jsonb) from jsonb_array_elements(v_lines) x)
      || coalesce(v_struck, '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name)),
    sentence(format('Project started from %s: %s', v_target, v_name)
             || case when v_gone > 0 then format('; %s struck card%s left out', v_gone,
                                                  case when v_gone = 1 then '' else 's' end) else '' end));

  delete from buys where id = b.id;
  return p.id;
end;
$function$
;