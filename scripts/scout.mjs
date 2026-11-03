// Tuesday scout: which of the week's games will the group chat care about most, and what's the story in each?
//   node scripts/scout.mjs 8
// Prints the report the Tuesday issue carries (Markdown), and seeds lib/weeks/<week>.json with the top three games
// (receipts only — the hook and story come from your blurb). Never prints a "---" line: readers.mjs inserts above it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { scout } from "./scout-lib.mjs";
import { loadSeason } from "./deep-notes.mjs";
import { weekReport } from "../lib/deep-notes.ts";
import { feeds, teamName } from "../lib/sleeper.ts";
import { firstNames } from "../lib/managers.ts";

const COMMISH = 1;
const week = Number(process.argv[2]);
if (!week) throw new Error("Usage: node scripts/scout.mjs <week>");
const f2 = n => n.toFixed(2);

const [{ ranked }, season, values, users, rosters] = await Promise.all([scout(week), loadSeason(week), feeds.values().catch(() => []), feeds.users(), feeds.rosters()]);
const top100 = new Set(values.filter(v => v.overallRank <= 100).map(v => v.player.sleeperId));
const report = weekReport(season, { top100, commissioner: COMMISH });
const owner = new Map(users.map(u => [u.user_id, u]));
const label = id => `${teamName(owner.get(rosters.find(r => r.roster_id === id)?.owner_id))}${firstNames[id] ? ` (${firstNames[id]})` : ""}`;

const out = ["**Around the league**", ...report.around.map(line => `- ${line}`)];
for (const [i, g] of report.games.entries()) {
  out.push("", `**${i + 1}. ${label(g.winner)} ${f2(g.winnerPoints)} ${g.tied ? "tied" : "def."} ${label(g.loser)} ${f2(g.loserPoints)}**`);
  if (g.tags.length) out.push(`_${g.tags.join(" · ")}_`);
  out.push(...g.angles.map(a => `- ${a}`), `- Receipts. ${g.receipts.join(". ")}.`);
}
console.log(out.join("\n"));

const file = new URL(`../lib/weeks/${week}.json`, import.meta.url);
if (existsSync(file)) {
  const snap = JSON.parse(readFileSync(file, "utf8"));
  if (!snap.recap) {
    const receipts = m => ranked.find(r => r.matchup === m)?.receipts ?? [];
    snap.recap = { headline: `Week ${week} recap`, featured: report.games.slice(0, 3).map(g => ({ matchup: g.matchup, hook: "", body: "", receipts: receipts(g.matchup) })), meme: null };
    writeFileSync(file, JSON.stringify(snap, null, 2) + "\n");
    console.error(`Seeded lib/weeks/${week}.json with the top three.`);
  }
}
