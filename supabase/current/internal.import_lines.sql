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

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
