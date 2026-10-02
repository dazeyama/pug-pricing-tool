// Builds src/lib/pokellectorJp.json: card pictures for the oldest Japanese
// sets, which TCGdex and Limitless have none of (owner, 2026-10-01). Their
// addresses on Pokellector's image server carry an ID of Pokellector's own
// ("311/Nidoran.EXP.5.37255"), so they're read once from its set pages here
// and kept in the app; the app itself never asks Pokellector anything but
// the pictures. Re-run only if a set is added:
//   node scripts/pokellector-jp.mjs
//
// Pokellector numbers these sets' cards as TCGdex does (Expansion Pack:
// 1 Bulbasaur … 5 Nidoran ♂, 6 Koffing). The script prints each set's counts
// on both sites, and a few cards side by side, so a set numbered differently
// shows up before it's saved.

import fs from 'node:fs';

// TCGdex set ID → Pokellector's set page.
const SETS = {
  PMCG1: 'Expansion-Pack-Expansion',
  PMCG2: 'Pokemon-Jungle-Expansion',
  PMCG3: 'Mystery-of-the-Fossils-Expansion',
  PMCG4: 'Rocket-Gang-Expansion',
  PMCG5: 'Leaders-Stadium-Expansion',
  PMCG6: 'Challenge-from-the-Darkness-Expansion',
  neo1: 'Gold-Silver-to-a-New-World-Expansion',
  neo2: 'Crossing-the-Ruins-Expansion',
  neo3: 'Awakening-Legends-Expansion',
  neo4: 'Darkness-and-to-Light-Expansion',
};
// TCGdex numbers that differ from the printed order (checked 2026-10-01):
// TCGdex number → Pokellector's. Crossing the Ruins' #057 (TCGdex's extra
// Aerodactyl) has no picture on Pokellector and stays without.
const NUMBER_FIXES = {
  neo4: { 229: 24 },   // Dark Houndoom is #229 in TCGdex, #24 on Pokellector
};
const IMAGE = /data-src="https:\/\/den-cards\.pokellector\.com\/(\d+\/[^"]+?)\.thumb\.png"/g;
const headers = { 'User-Agent': 'Mozilla/5.0 (PUG Pricing Tool; one-off image index)' };

const out = {};
for (const [setId, page] of Object.entries(SETS)) {
  const html = await (await fetch(`https://jp.pokellector.com/${page}/`, { headers })).text();
  const cards = {};
  for (const [, path] of html.matchAll(IMAGE)) {
    // "311/Nidoran.EXP.5.37255": the number is the second-to-last part.
    const number = path.split('.').at(-2);
    if (/^\d+$/.test(number) && !cards[number]) cards[number] = path;
  }
  for (const [ours, theirs] of Object.entries(NUMBER_FIXES[setId] ?? {})) {
    if (cards[theirs]) {
      cards[ours] = cards[theirs];
      delete cards[theirs];
    }
  }
  const dex = await (await fetch(`https://api.tcgdex.net/v2/ja/sets/${setId}`)).json();
  const tcgdex = dex.cards ?? [];
  const count = Object.keys(cards).length;
  console.log(`${setId.padEnd(6)} ${page.padEnd(40)} Pokellector ${String(count).padStart(3)}  TCGdex ${String(tcgdex.length).padStart(3)}`
    + (count === tcgdex.length ? '' : '  <- counts differ'));
  for (const c of [tcgdex[0], tcgdex[Math.floor(tcgdex.length / 2)], tcgdex.at(-1)].filter(Boolean)) {
    const n = String(Number(c.localId));
    console.log(`         #${c.localId} ${c.name}  ↔  ${cards[n]?.split('/')[1] ?? '(none)'}`);
  }
  out[setId] = cards;
}
fs.writeFileSync(new URL('../src/lib/pokellectorJp.json', import.meta.url), `${JSON.stringify(out)}\n`);
console.log('Wrote src/lib/pokellectorJp.json');
