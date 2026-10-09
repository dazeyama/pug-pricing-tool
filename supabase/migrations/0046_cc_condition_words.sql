-- CC's condition words (owner, 2026-10-09): Crystal Commerce matches the
-- Condition column exactly against the store's inventory, which says
-- "Lightly Played", "Moderately Played", "Heavily Played", not the help
-- page's "Light Play"… (spec 3.1): CC's admin found the non-Near Mint rows of
-- a test upload didn't update. New exports stamp the inventory's words, and
-- the stamps already made change too, so a Completed day or collection
-- downloads its file again with them.

create or replace function public.cc_condition_word(p_condition text) returns text
language sql immutable
set search_path = public, internal
as $$
  select case p_condition
    when 'NM' then 'Near Mint' when 'LP' then 'Lightly Played' when 'MP' then 'Moderately Played'
    when 'HP' then 'Heavily Played' when 'DMG' then 'Damaged' end;
$$;

update public.buy_lines
   set cc_condition = case cc_condition
         when 'Light Play' then 'Lightly Played'
         when 'Moderate Play' then 'Moderately Played'
         when 'Heavy Play' then 'Heavily Played' end
 where cc_condition in ('Light Play', 'Moderate Play', 'Heavy Play');
