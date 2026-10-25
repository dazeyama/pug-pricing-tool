---
name: main
description: Start the PUG Pricing Tool's main session and its four area forks (Buy tab, Records, Export and printouts, Phone scanner). Only when the owner runs /main.
disable-model-invocation: true
---

# Main: the hub session and its four forks

Run only when the owner types `/main` (decision 527). Any other session is a side session and starts none of
this. A fork never runs it.

## 1. The reading

If this session hasn't yet, do CLAUDE.md's Start of a session in full, the new-session part included
(`node scripts/code-map.mjs`, the whole of CODE_MAP.md in two reads, the release skill and the reviewer): the forks
inherit this conversation, so what's read here is theirs. Then tell the owner what's open in NEXT.md.

## 2. The forks

Start the four area sessions below as forks of this one: `start_session`, context "fork", initiation
"user_asked", one each, with the name and brief below. Then stay as the hub: questions across areas, NEXT.md's
Unpushed line, memory notes (decision 517), and the push when the owner asks.

| Session (`name`) | Area |
|---|---|
| Buy tab (`buy`) | search, prices, rates, copies we own, the buy list, CONFIRM BUY: `src/pages/price/`; in `src/lib/`, `prices`, `rates`, `cardSearch`, `scryfall`, `tcgdex`, `justtcgCards`, `owned*`; the `prices` Edge Function |
| Records (`records`) | collections, projects, day pages, Calendar, Changelog, header search, statuses, backups, Settings: `src/pages/collections/`, `src/pages/day/`, `DayPage.jsx`, `CollectionPage.jsx`, `src/pages/settings/`; `changelog.js`, `status.js`, `backup*.js` |
| Export and printouts (`export`) | Crystal Commerce matching, the export dialog, Mass Create, Print MTG / PKM, stickers, Import Collection, the inventory: `src/pages/export/`; `ccMatch.js`, `ccExport.js`, `ccNames.js`, `massCreate.js`, `auditP*.js`, `stickerPdf.js`, `import*.js`, `masterInventory.js` |
| Phone scanner (`scanner`) | `src/scan/` |

Each fork's brief: "You're the <Session> session, forked from the main session, so its reading is yours: skip Start
of a session. Your area: <Area>. Wait for my first task. Work in your area; outside it, follow Outside your area
in CLAUDE.md. Don't start sessions, push, or run the release skill."

How the sessions share the folder, work outside their area and message each other: CLAUDE.md, Working beside the
other sessions, Outside your area and Messages.
