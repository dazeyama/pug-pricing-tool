CREATE OR REPLACE FUNCTION internal.same_card(l buy_lines, r buy_lines)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select l.game = r.game and l.lang = r.lang
     and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
     and l.treatments = coalesce(r.treatments, '[]'::jsonb)
     and l.condition = r.condition
     and l.unit_price = r.unit_price and l.price_source = r.price_source
     and l.bulk_kind is not distinct from r.bulk_kind   -- bulk merges with the same item only
     and (
       -- The same TCGplayer product and name: the same card, however it was found (decision 578), unless each has
       -- its own Scryfall or TCGdex id and they differ (a product linked to two cards).
       (nullif(l.tcgplayer_id, '') is not null and l.tcgplayer_id = r.tcgplayer_id
        and coalesce(l.name_key, lower(l.name)) = coalesce(r.name_key, lower(r.name))
        and (l.scryfall_id is null or r.scryfall_id is null or l.scryfall_id = r.scryfall_id)
        and (l.tcgdex_id is null or r.tcgdex_id is null or l.tcgdex_id = r.tcgdex_id))
       or (l.name = r.name                              -- a placeholder: the same name typed (owner, 2026-10-16)
           and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
           and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
           -- With neither id (a TCGplayer-only Pokémon card), the same set, number and products (decision 352).
           and (l.scryfall_id is not null or l.tcgdex_id is not null
                or (coalesce(l.set_code, '') = coalesce(r.set_code, '')
                    and coalesce(l.collector_number, '') = coalesce(r.collector_number, '')
                    and coalesce(l.tcgplayer_id, '') = coalesce(r.tcgplayer_id, '')
                    and coalesce(l.justtcg_card_id, '') = coalesce(r.justtcg_card_id, '')))))
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
