-- Japanese prices (2026-10-10): JustTCG's Japanese cards are their own game,
-- `pokemon-japan`; the `prices` function searched `pokemon` with
-- language=Japanese, which now finds no Japanese listings, so every Japanese
-- card looked up by name and number was remembered as "no match" (for 7
-- days). Those answers were wrong: forget them, so the next lookup searches
-- the right game. Japanese cards priced by their TCGplayer product were
-- right and stay.
delete from public.price_map
 where source_key like 'pokemon:ja:%'
   and justtcg_card_id is null;
