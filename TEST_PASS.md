# TEST_PASS.md — smoke test for FABLE_REPORT Phase 6

A focused smoke test of everything Phase 6 touched, run **together, in the
app's preview browser, right after Phase 6 is implemented**: Claude drives,
the owner watches and signs in. This is an exception the owner asked for
(2026-10-16) to the usual "owner is QA, no browser checks by Claude".

Phase 6 changes structure, not features: every check below asks "does it
still do exactly what it did?". Each section names the commit it tests, so a
finding points at one commit to fix or revert.

- **Build under test:** the Phase 6 commits on top of `55bab42` (listed per
  section). Settings footer: 0.9.9.8-day1.
- **Where:** the local dev server, http://localhost:5180 (`npm run dev --
  --port 5180`, started by the preview as `.claude/launch.json` "pug-dev").
  It uses the **dev** database, which is **also the live store's** until
  launch. **Never prod.**
- **Who:** the owner signs in (Claude never types the store password).
  Claude drives the rest and records what it sees.

## Ground rules

- **Test data is named `SMOKE P6 …`** (customers, collections, projects),
  with 555 phone numbers (`(555) 010-0601`), so it's easy to find and delete
  at the end. **Never change a real customer's buy or collection.**
- **No EXPORT is saved.** Export dialogs are opened, checked and cancelled.
  COMPLETE and EXPORT on a day are never confirmed: they'd mark real buys.
- **Watch JustTCG's budget:** note Settings → JustTCG usage at the start
  and end; this run should take well under 60 requests.
- **Settings values are put back.** Where a check changes a percentage or a
  value, the original is noted first and typed back after.
- **Findings** go in the table at the bottom: steps, what happened, what
  should have, the commit, and a priority (P1 breaks something staff rely
  on; P2 wrong or misleading with a workaround; P3 cosmetic).
- **Nothing is fixed during the run.** Fixes come after, from the findings.

---

## 0. Setup

- [ ] Claude adds `.claude/launch.json` ("pug-dev": `npm run dev -- --port 5180 --strictPort`, port 5180) and starts the preview.
- [ ] The owner signs in. The computer has a name; a user is picked (add `SMOKE P6 Ash` if needed).
- [ ] The console shows no errors on load (Claude reads it).
- [ ] Note JustTCG usage: ________ and Settings values that sections change: Cash % ____, Credit % ____.

<!-- Sections are added below as each Phase 6 commit lands. -->

## 1. A collection's "why not" tooltips (B8, CollectionPage)

Every reason is the same words in the same order as before (checked
string by string when it was written); this checks they still show at
the right moments. Hover each button and read its tooltip.

- [ ] **Make `SMOKE P6 Collection`** (Collections → + Price Collection, phone `(555) 010-0601`). Empty and Processing:
  - [ ] REPRICE? reads **No cards to reprice**.
  - [ ] EXPORT ▾ → Print?'s tooltip: **Mark it Paid/Ours first**.
- [ ] Add one Magic card (Lightning Bolt 117/331 2X2). REPRICE? is usable (its tooltip is the plain "Bring every card's buy price up to today's prices").
- [ ] **No user picked** (pick none in the header): REPRICE? reads **Pick a user first**; the status buttons too. Pick the user again.
- [ ] **Hold a CSV over it** (any small CSV from the scratchpad): the drop overlay says **It already has cards: a file only goes into an empty collection or project.** Drop nothing.
- [ ] **Mark as Priced** (offer $1 cash), then **Mark as Paid/Ours** ($1 cash):
  - [ ] Searching to add a card: blocked with **Paid/Ours: unlock it to edit**; × still strikes (that's Paid/Ours).
  - [ ] Print? is usable now.
- [ ] Unlock it → back to Priced → **Reject**: Print?'s tooltip **Rejected: there is nothing to print**; editing says **Rejected: reopen it to edit**. Reopen it.
- [ ] **Can't upload cards** (Collections → System): the search field reads **Cards arrive here from exports: they can't be added by hand**; holding a CSV over it says **Can't upload cards only takes cards from exports.**
- [ ] **A project:** + Start Project `SMOKE P6 Project`, empty: ⋯ → Convert to buy… reads **No cards to convert**. Add a card: it's usable (open it, then Cancel).
- [ ] Delete collection… and Delete project… open their dialogs (Cancel both for now; section 9 cleans up).
- Not testable from one browser: "View only: … is editing", the delete/convert takeover wording, and "No connection" (two computers, or offline). Their words are the same strings as before.
