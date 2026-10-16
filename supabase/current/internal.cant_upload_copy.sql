CREATE OR REPLACE FUNCTION internal.cant_upload_copy(p_lines uuid[], p_notes jsonb, p_from text, p_user uuid, p_device uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_sys   uuid := cant_upload_ensure();
  b       buys;
  v_pos   integer;
  v_cards integer;
  v_lines jsonb;
begin
  if coalesce(array_length(p_lines, 1), 0) = 0 then return 0; end if;
  select * into b from buys where id = v_sys for update;
  select coalesce(max(position), 0) into v_pos from buy_lines where buy_id = v_sys;
  insert into buy_lines (buy_id, position, game, lang, name, name_key, set_code, set_name, source_set_id,
                         collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
                         quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
                         scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id,
                         image_url, name_en, source_line_id, source_note)
  select v_sys, v_pos + row_number() over (order by k.ord), l.game, l.lang, l.name, l.name_key, l.set_code,
         l.set_name, l.source_set_id, l.collector_number, l.printed_size, l.rarity, l.finish, l.first_edition,
         l.treatments, l.condition, l.quantity, l.unit_price, l.market_price, l.price_source, l.price_snapshot,
         l.priced_at, l.scryfall_id, l.oracle_id, l.tcgdex_id, l.tcgplayer_id, l.justtcg_card_id,
         l.justtcg_variant_id, l.image_url, l.name_en, l.id, p_notes ->> l.id::text
    from unnest(p_lines) with ordinality as k(id, ord)
    join buy_lines l on l.id = k.id;
  select sum(l.quantity),
         jsonb_agg(jsonb_build_object('sign', '+', 'qty', l.quantity, 'game', l.game, 'unit_price', l.unit_price,
                                      'text', export_line_text(l)) order by l.position)
    into v_cards, v_lines
    from buy_lines l where l.id = any(p_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_sys returning * into b;
  perform collection_event(b, p_user, p_device, 'cant_upload_added', array['mtg'], v_cards, 0, null, v_lines, '[]',
    format('%s card%s from %s couldn''t be matched to Crystal Commerce.', v_cards,
           case when v_cards = 1 then '' else 's' end, p_from));
  return v_cards;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
