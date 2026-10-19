# Where things become Completed on their own — the map

The owner (2026-10-17, from the team): *"Let's do an audit of the areas in which buttons 'auto
complete' different cards, buys and collections. I don't think that behavior is clear and I want
to standardize or remove it."* This is the map of every place a card, a buy or a collection is
marked **Completed** (or taken back out of it), what each one touches, and what it leaves alone.
Nothing here is changed yet: mark what you want different in the last column.

**Completed means** (spec 8.10, 9.1): a walk-in buy's cards of one game are Completed when each
has `completed_at` set; the buy itself stays `confirmed`, and its Magic side and Pokémon side are
Completed separately. A collection or project is Completed as a whole (`buys.status =
'completed'`). Completed cards are locked, left out of the header search (unless Show all), out
of the day's export and out of the printouts.

## 1. Walk-in buys (the Calendar's day pages)

| Button | Where | What becomes Completed | What it leaves alone | Undo | Code |
|---|---|---|---|---|---|
| **EXPORT ▾ → Export csv** (Magic day) | A Magic day page, once the day is over | Every Magic card of every buy on that day that isn't Completed yet (bulk and struck cards aside): matched ones exported, unmatched ones copied to Can't upload cards — **both** marked Completed | The buys' Pokémon cards; buys already Completed; today (can't be exported) | ⋯ next to EXPORT → Mark Paid/Ours again (the whole day) | `export_lines` (day) |
| **EXPORT ▾ → Complete day…** (Pokémon day) | A Pokémon day page, once the day is over | Every Pokémon card of every buy that day, with today's Sell Prices stamped; nothing is exported | The buys' Magic cards | Same ⋯ → Mark Paid/Ours again | `day_complete` |
| **Buy ⋯ → Export single buy…** | A buy on a Magic day page, any day (today too) | That buy's Magic cards (exported or Can't upload) | Its Pokémon cards; the rest of the day | Buy ⋯ → Mark Paid/Ours again | `export_lines` (buy) |
| **Buy ⋯ → Mark as completed** | A buy, either game's side | That buy's cards of that game, **without exporting** (no Sell Prices, no file) | The other game's side | Buy ⋯ → Mark Paid/Ours again | `buy_mark_completed` |
| **Buy ⋯ → Mark Paid/Ours again** | A Completed side of a buy | Nothing; it **un**completes: export stamps and Sell Prices cleared, its copies taken back out of Can't upload cards | — | — | `buy_unexport`, `buy_mark_completed(false)` |
| **Striking cards (×)** | A Paid/Ours buy's list | Nothing is marked, but a game's side **reads as Completed once no live card of that game is left** (all struck): the panel shows Completed, the search shows the struck cards as Completed | — | Right-click → Restore a card | `walkInStatus` (app), `global_search` |
| **CONFIRM BUY** | The Price tab | Nothing: the buy becomes Paid/Ours | — | — | `confirm_buy` |
| **Convert to project** | Buy ⋯ | Nothing: the buy becomes a Paid/Ours project. Refused once any card is Completed | — | Convert to buy… (from the project) | `buy_to_project` |
| **Convert to buy…** | A project's ⋯ | Nothing: a new Paid/Ours buy on today's page. Refused once any card is Completed | — | — | `project_to_buy` |
| **Print buy / Print stickers / Print MTG? / Print PKM?** | Day page, buy ⋯, BUY COMPLETE | Nothing, ever | — | — | printouts |
| **Edit in project view → SAVE BUY** | Buy ⋯ | Nothing | — | — | `buy_save_edits` |

Note the one asymmetry: a **Magic** day finishes by **exporting** (file + Completed), a **Pokémon**
day by **completing** (Sell Prices + Completed, no file, Pokémon can't go to Crystal Commerce yet).
A Pokémon buy's **Mark as completed** and **Complete day…** are the same action at two sizes, but
only Complete day… stamps Sell Prices.

## 2. Collections and projects (the Collections tab)

| Button | Where | What becomes Completed | What it leaves alone | Undo | Code |
|---|---|---|---|---|---|
| **EXPORT ▾ → Export csv** | A Paid/Ours collection or project | **The whole collection**, whatever it holds: its Magic cards are exported (or sent to Can't upload cards), and it's marked Completed **even when it has no Magic cards** ("Marked Completed: no Magic cards to export") | Its Pokémon cards stay unexported (but locked with the collection) | Status menu → Reopen / Unlock (clears the export stamps, takes its copies back) | `export_lines` (collection) |
| **EXPORT in any other status** (Processing, Priced, Rejected) | Same button | Nothing: the file only, nothing saved, cards not marked | Everything | — | app (`fileOnly`) |
| **Status menu** (Processing / Priced / Paid/Ours / Rejected) | A collection | **Can't set Completed by hand** (decision 182): Completed comes only from EXPORT | — | Reopen from Completed to Paid/Ours undoes the export | `collection_set_status` |
| **REPRICE?** | A collection | Nothing | — | — | `collection_reprice` |
| **Striking (×)** | A Paid/Ours collection | Nothing: a struck card is kept crossed out; the collection's status doesn't move | — | Restore | `collection_strike_line` |
| **Delete** | A collection | Nothing (it's gone) | — | — | `collection_delete` |

## 3. Can't upload cards (the system collection)

| Button | What becomes Completed | Notes | Code |
|---|---|---|---|
| **EXPORT** there | Nothing new: the copies that now match are exported and **leave** the collection; their originals (in their buys or collections, already Completed) get the export stamps. Copies that still don't match stay | Always Paid/Ours; never Completed itself | `export_lines` (cant_upload) |
| **Mark Paid/Ours again** on the source buy or day | Its copies are taken back out of Can't upload cards | — | `cant_upload_return` |

## 4. Things that look like completion but aren't

| Where | What happens | Why it reads as "auto" |
|---|---|---|
| **Pokémon COMPLETE's Sell Prices** | Complete day… works out today's Sell Prices for the cards it completes (green on the day page) | The number appears without an export |
| **The export's Can't upload copies** | An unmatched card is Completed in its buy **and** copied to Can't upload cards in one go | The card shows Completed although nothing of it was uploaded |
| **A day's EXPORT after Export single buy** | The day's EXPORT skips a buy already Completed on its own; its chip shows Exported | Two exports, one day: two Custom SKUs on one day page |
| **The buy panel's status** | Shows Completed per game from its cards, not from a status the buy has | A buy with all its Magic struck says Completed on the Magic side |
| **Cards Completed by hand** (Mark as completed) | Left out of printouts ("they weren't exported and won't be") and of the day's EXPORT | A card can be Completed yet never exported |

## 5. Questions to chart (your call)

- Should a **Pokémon day** complete by itself when its last buy is marked, or stay as now (Complete day… only)?
- Should **Export single buy** complete the buy's **Pokémon** side too, or only the Magic side it exports (as now)?
- Should a collection's **EXPORT with no Magic cards** still mark it Completed, or refuse ("nothing to export")?
- Should **all-struck** read as Completed, or as Paid/Ours with no cards left?
- Should **Mark as completed** exist at all for Magic (it skips the export), or only for Pokémon?
- Should a buy be allowed to **Convert to project** after one game's side is Completed (today: refused as soon as any card is)?

## 6. The chart (owner, 2026-10-18) and what changed

| Question | Answer | Change |
|---|---|---|
| A day completing itself when its last buy is marked | "if everything is completed, complete the whole day; same for Magic, if everything has been exported or completed, mark the day exported" | Already so: a day's chip and the calendar derive from the buys' cards (`buys_in_range`, `walkInStatus`), so a day whose buys are all done one by one reads Completed / Exported. No change. |
| Export single buy completing the Pokémon side | "no, it's correct as-is" | None. |
| EXPORT on a collection with no Magic cards | "we're going to change this behavior later" | Closed (owner, 2026-10-19: "Mark this closed"): it stays as it is, "nothing to export". |
| All-struck reading as Completed | "100% struck is completed" | Already so. No change. |
| Mark as completed for Magic | "Yes, but when it's done, strike all the cards" | `buy_mark_completed` strikes the Magic cards it completes; Mark Paid/Ours again restores them (decision 295). |
| Convert to project after a card is Completed | "Completed/struck cards just get skipped, right?" | It refused before; now the live cards move and the buy stays with its Completed cards (decision 296). |
| **Collections** | "collections should never 'auto complete' themselves and instead should be moved to completed manually always" | EXPORT no longer sets Completed; the status menu and a "Mark as Completed →" step do, from Paid/Ours; leaving Completed no longer undoes the export (decision 294). |

From this round: **Undo export…** on a collection's ⋯ takes the export's stamps off and brings its Can't-upload copies back (decision 298; Reopen used to do it). The no-Magic-cards export: closed as it is (owner, 2026-10-19). Nothing on this page is open.
