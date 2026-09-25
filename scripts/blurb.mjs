// Put a week's blurb on the site:  npm run blurb -- 3 blurb.txt   (or pipe it in:  pbpaste | npm run blurb -- 3)
// Paste the blurb as-is. Receipts already on a game stay put; the scout fills in any game that has none.
// Running it again with an edited blurb replaces the recap.
import { readFileSync, writeFileSync } from "node:fs";
import { parseBlurb } from "../lib/blurb.ts";
import { firstNames, nicknames } from "../lib/managers.ts";
import { scout } from "./scout-lib.mjs";

const week = Number(process.argv[2]);
if (!week) throw new Error("Usage: npm run blurb -- <week> [file]   (reads the blurb from stdin without a file)");
const file = new URL(`../lib/weeks/${week}.json`, import.meta.url);
const snap = JSON.parse(readFileSync(file, "utf8"));
const text = readFileSync(process.argv[3] ?? 0, "utf8");

const teams = Object.entries(snap.teams).map(([id, t]) => ({ id: Number(id), names: [firstNames[id], ...(nicknames[id] ?? []), t.name, t.handle].filter(Boolean) }));
const parsed = parseBlurb(text, teams, snap.finals);
if (parsed.problems.length) {
  console.error(`The blurb wasn't added:\n- ${parsed.problems.join("\n- ")}`);
  process.exit(1);
}

const kept = new Map((snap.recap?.featured ?? []).map(f => [f.matchup, f.receipts]));
const scouted = parsed.games.every(g => kept.has(g.matchup)) ? null : await scout(week);
snap.recap = {
  headline: parsed.headline ?? `Week ${week} recap`,
  featured: parsed.games.map(g => ({ ...g, receipts: kept.get(g.matchup) ?? scouted.ranked.find(r => r.matchup === g.matchup).receipts })),
  meme: parsed.meme,
  ...(parsed.cover && { cover: "meme" }),
};
writeFileSync(file, JSON.stringify(snap, null, 2) + "\n");

const name = id => firstNames[id] ?? snap.teams[id].name;
console.log(`Week ${week} recap is in. "${snap.recap.headline}"`);
for (const g of parsed.games) {
  const f = snap.finals.find(x => x.matchup === g.matchup);
  console.log(`- ${name(f.winner)} def. ${name(f.loser)}: ${g.hook}`);
}
if (parsed.meme) console.log(`- Meme on ${name(parsed.meme.rosterId)}'s game${parsed.cover ? ", and on the cover" : ""}`);
