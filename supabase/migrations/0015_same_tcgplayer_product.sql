-- One TCGplayer product is one card, however it was found (owner, 2026-11-10; decision 578): "When any two
-- products have the same tcgplayer ID they should collapse together." On Buy 82 the same Mr. Mime (Jungle, holo,
-- HP, $13.00) went on twice and stayed two lines: one picked through TCGdex (tcgdex_id base2-6, number "6"), one
-- from a JustTCG find (no TCGdex id, number "06"), the same TCGplayer product. The merge rule wanted the TCGdex ids
-- equal, and one against none is different.
--
-- Now two lines with the same TCGplayer product and the same name are the same card, whatever their set and
-- number say, when one of them has no Scryfall or TCGdex id to tell them apart. Two cards each with its own id,
-- and the ids differ, stay two: TCGdex links some different cards to one product (the Sun & Moon Trainer Kit's
-- Great Ball and Lightning Energy, the price audit's "one product for two different cards"; `printings.js`
-- WRONG_PRODUCTS corrects only some), and so may Scryfall for two arts. The name, compared as the app folds it
-- (`name_key`), keeps a wrongly linked card apart from a find of the product's own card. What keeps two copies
-- apart otherwise still does: the game and language, the finish, 1st edition, the treatments (a stamp, a Cosmos
-- Holo: a version found both ways can name them differently, so it still goes on as two lines), the condition, the
-- price and where it came from, the bulk kind. The callers still add their own: a card on its own rate joins only
-- a line at that rate (decision 448), and an exported line takes no new copies (decision 345). Without a TCGplayer
-- product the rule is as it was (decision 352 for a card with neither id).
--
-- Every list that merges by it changes alike: a walk-in's (draft_add_line, draft_update_line) and a collection's
-- or project's (collection_add_line, collection_update_line), ADD CARD, a phone's scan and SAVE EDIT's fold (which
-- keeps the earlier line's details, as before). A strike or restore finds its twin by internal.same_line,
-- unchanged. Lines already on a list stay as they are.

create or replace function internal.same_card(l buy_lines, r buy_lines)
 returns boolean
 language sql
 immutable
 set search_path to 'public', 'internal'
as $function$
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
