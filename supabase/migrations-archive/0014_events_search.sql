-- Phase 9: the Changelog's text filter (spec 12.4) runs in Postgres, so the
-- log never has to be loaded whole. Two columns Postgres keeps up to date
-- from each entry (the log is append-only, so they never change):
--   search_text    the names, summary, card rows and field rows, lower case,
--                  common accents folded ("Pokémon" → "pokemon");
--   search_digits  the digits of the summary and field rows, so a phone
--                  number typed any way ("5552013344") finds "(555) 201-3344".

alter table public.events
  add column search_text text generated always as (
    translate(lower(coalesce(target_name, '') || ' ' || coalesce(summary, '') || ' '
                    || lines::text || ' ' || fields::text),
              'áàâäãåéèêëíìîïóòôöõúùûüñçœæ', 'aaaaaaeeeeiiiiooooouuuuncoa')
  ) stored,
  add column search_digits text generated always as (
    regexp_replace(coalesce(summary, '') || ' ' || fields::text, '[^0-9]', '', 'g')
  ) stored;

create index events_search_text_trgm on public.events using gin (search_text extensions.gin_trgm_ops);
create index events_action_seq on public.events (action, seq desc);
