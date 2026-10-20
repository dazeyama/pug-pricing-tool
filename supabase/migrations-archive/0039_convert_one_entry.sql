-- Convert to project logs one Changelog entry, on the new project: every
-- card added to it (owner, 2026-10-02), filed under Collections, instead of
-- 0036's two (the buy's cards removed, and "Collection created").

create or replace function public.buy_to_project(
  p_buy_id           uuid,
  p_name             text,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer default null,
  p_line_texts       jsonb default '{}'
) returns uuid
language plpgsql
set search_path = public
as $$
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
    coalesce(v_count, 0), 0, collection_totals(p, coalesce(v_market, 0)),
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '+')), '[]'::jsonb) from jsonb_array_elements(v_lines) x),
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name)),
    sentence(format('Project started from %s: %s', v_target, v_name)));

  delete from buys where id = b.id;
  return p.id;
end;
$$;
revoke execute on function public.buy_to_project(uuid, text, uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.buy_to_project(uuid, text, uuid, uuid, integer, jsonb) to authenticated;
