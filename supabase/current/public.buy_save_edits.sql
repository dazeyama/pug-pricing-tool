CREATE OR REPLACE FUNCTION public.buy_save_edits(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_lines jsonb, p_removed jsonb, p_struck jsonb DEFAULT '[]'::jsonb, p_restored jsonb DEFAULT '[]'::jsonb)
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
  v_struck  integer := 0;
  v_back    integer := 0;
  v_edited_bulk integer := 0;   -- bulk counted apart, in cards (0066)
  v_gone_bulk   integer := 0;
  v_struck_bulk integer := 0;
  v_back_bulk   integer := 0;
  v_n       integer;
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
  p_struck := coalesce(p_struck, '[]'::jsonb);
  p_restored := coalesce(p_restored, '[]'::jsonb);
  if jsonb_array_length(p_lines) + jsonb_array_length(p_removed)
     + jsonb_array_length(p_struck) + jsonb_array_length(p_restored) = 0 then
    return b.version;   -- nothing changed
  end if;

  v_removed := array(select (value ->> 'id')::uuid from jsonb_array_elements(p_removed));
  v_touched := v_removed || array(select (value ->> 'id')::uuid from jsonb_array_elements(p_lines))
    || array(select (value ->> 'id')::uuid from jsonb_array_elements(p_struck))
    || array(select (value ->> 'id')::uuid from jsonb_array_elements(p_restored));
  if exists (select 1 from unnest(v_touched) t(id)
              where not exists (select 1 from buy_lines l where l.id = t.id and l.buy_id = b.id)) then
    raise exception 'line_gone';
  end if;
  if exists (select 1 from buy_lines where id = any(v_touched) and completed_at is not null) then
    raise exception 'buy_completed';
  end if;
  -- A Completed side is locked, all of it (decision 353).
  if exists (select 1 from buy_lines l join buy_lines t on t.buy_id = l.buy_id and t.game = l.game
              where l.id = any(v_touched) and t.completed_at is not null) then
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
    v_gone := v_gone + (internal.line_counts(array[v_old])).cards;
    v_gone_bulk := v_gone_bulk + (internal.line_counts(array[v_old])).bulk;
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
      justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url,
      bulk_kind = r.bulk_kind
    where id = v_old.id;
    v_rows := v_rows
      || jsonb_build_object('sign', '-', 'qty', v_old.quantity, 'game', v_old.game, 'unit_price', v_old.unit_price,
           'text', coalesce(v_item ->> 'old_text', v_old.quantity || ' ' || v_old.name))
      || jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', r.game, 'unit_price', r.unit_price,
           'text', coalesce(v_item ->> 'new_text', r.quantity || ' ' || r.name));
    v_games := v_games || v_old.game || r.game;
    -- A card line counts once; a bulk line as the bulk it now holds.
    if internal.bulk_per(r.bulk_kind) is null then
      v_edited := v_edited + 1;
    else
      v_edited_bulk := v_edited_bulk + (internal.line_counts(array[r])).bulk;
    end if;
  end loop;

  -- Struck lines back, then copies struck (of the lines as edited).
  for v_item in select value from jsonb_array_elements(p_restored) loop
    select * into v_old from buy_lines where id = (v_item ->> 'id')::uuid;
    if v_old.struck_at is null then
      raise exception 'line_not_struck';
    end if;
    perform internal.restore_line(v_old.id);
    v_rows := v_rows || jsonb_build_object('sign', '+', 'restored', true, 'qty', v_old.quantity, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(v_item ->> 'text', v_old.quantity || ' ' || v_old.name));
    v_games := v_games || v_old.game;
    v_back := v_back + (internal.line_counts(array[v_old])).cards;
    v_back_bulk := v_back_bulk + (internal.line_counts(array[v_old])).bulk;
  end loop;
  for v_item in select value from jsonb_array_elements(p_struck) loop
    select * into v_old from buy_lines where id = (v_item ->> 'id')::uuid;
    if v_old.id is null then
      raise exception 'line_gone';
    end if;
    v_n := least(greatest(coalesce((v_item ->> 'qty')::integer, 1), 1), v_old.quantity);
    perform internal.strike_line(v_old.id, v_n, p_user);
    v_rows := v_rows || jsonb_build_object('sign', '-', 'struck', true, 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(v_item ->> 'text', v_n || ' ' || v_old.name));
    v_games := v_games || v_old.game;
    v_struck := v_struck + case when internal.bulk_per(v_old.bulk_kind) is null then v_n else 0 end;
    v_struck_bulk := v_struck_bulk + coalesce(v_n * internal.bulk_per(v_old.bulk_kind), 0);
  end loop;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;
  select coalesce(sum(unit_price * quantity), 0) into v_market from buy_lines where buy_id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_edited', v_target,
    array(select distinct g from unnest(v_games) g order by 1), v_gone,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), v_rows,
    sentence(concat_ws('; ',
      case when v_edited + v_edited_bulk > 0
           then internal.count_text(v_edited, v_edited_bulk) || ' edited' end,
      case when v_gone + v_gone_bulk > 0
           then internal.count_text(v_gone, v_gone_bulk) || ' removed' end,
      case when v_struck + v_struck_bulk > 0
           then internal.count_text(v_struck, v_struck_bulk) || ' struck' end,
      case when v_back + v_back_bulk > 0
           then internal.count_text(v_back, v_back_bulk, 'struck') || ' restored' end)));
  return b.version;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
