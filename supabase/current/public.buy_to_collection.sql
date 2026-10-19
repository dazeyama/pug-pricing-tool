CREATE OR REPLACE FUNCTION public.buy_to_collection(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  p        buys;
  v_name   text;
  v_target text;
  v_games  text[];
  v_lines  jsonb;
  v_struck jsonb;
  v_gone   integer;
  v_keep   boolean;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  v_name := btrim(regexp_replace(coalesce(b.customer_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  if not exists (select 1 from buy_lines where buy_id = b.id and completed_at is null and struck_at is null) then
    raise exception 'buy_completed';
  end if;
  v_keep := exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null);
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g)
    into v_games
    from (select distinct game as g from buy_lines where buy_id = b.id and completed_at is null and struck_at is null) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null and completed_at is null;
  -- Struck cards stay out of the collection, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null and completed_at is null;

  -- The buy's customer, phone, notes, payment and rates; its user as the maker.
  insert into buys (kind, status, project, customer_name, phone, id_last4, notes, paid_at,
                    cash_pct, credit_pct, custom_cash_pct, custom_credit_pct,
                    paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', false, v_name, b.phone, '1312', coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          b.cash_pct, b.credit_pct, b.custom_cash_pct, b.custom_credit_pct,
          b.paid_price, b.paid_method, coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;

  -- The cards keep the rates CONFIRM BUY saved on them.
  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null and completed_at is null;

  perform collection_event(p, p_user, p_device, 'buy_converted_collection', coalesce(v_games, '{}'),
    (internal.line_counts(array(select l from buy_lines l where l.buy_id = p.id))).cards, 0,
    internal.lines_totals(p, array(select l from buy_lines l where l.buy_id = p.id)),
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '+')), '[]'::jsonb) from jsonb_array_elements(v_lines) x)
      || coalesce(v_struck, '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name),
                      jsonb_build_object('field', 'last 4 ID', 'before', null, 'after', '1312')),
    sentence(format('Collection started from %s: %s', v_target, v_name)
             || case when v_gone > 0
                     then '; ' || internal.lines_count_text(array(select l from buy_lines l
                                                                  where l.buy_id = b.id and l.struck_at is not null and l.completed_at is null),
                                                            'struck') || case when v_keep then ' stay on the buy' else ' left out' end
                     else '' end
             || case when v_keep then '; its Completed cards stay on the buy' else '' end));

  if v_keep then
    update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;
  else
    delete from buys where id = b.id;
  end if;
  return p.id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
