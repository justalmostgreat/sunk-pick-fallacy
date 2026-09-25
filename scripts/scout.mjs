// Tuesday scout: which of the week's games will the group chat care about most? node scripts/scout.mjs 3
// Prints every game ranked, with reasons, and seeds lib/weeks/<week>.json with the top three
// (receipts only — the hook and story come from your blurb).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { scout } from "./scout-lib.mjs";

const week = Number(process.argv[2]);
if (!week) throw new Error("Usage: node scripts/scout.mjs <week>");
const f2 = n => n.toFixed(2);
const { ranked, label } = await scout(week);

for (const [i, g] of ranked.entries()) {
  console.log(`\n${i + 1}. ${label(g.w.rosterId)} ${f2(g.w.points)} def. ${label(g.l.rosterId)} ${f2(g.l.points)} — interest ${g.s.toFixed(1)}`);
  console.log(`   ${g.why.join(" · ") || "nothing special"}`);
  console.log(`   top: ${g.w.top.name} ${f2(g.w.top.pts)} / ${g.l.top.name} ${f2(g.l.top.pts)} · worst vs projection: ${g.l.miss.name} ${f2(g.l.miss.pts)} (proj ${g.l.miss.proj.toFixed(1)})${g.l.crime ? ` · bench: ${g.l.crime.bench.name} ${f2(g.l.crime.bench.pts)} over ${g.l.crime.starter.name} ${f2(g.l.crime.starter.pts)}` : ""}`);
}

const file = new URL(`../lib/weeks/${week}.json`, import.meta.url);
if (existsSync(file)) {
  const snap = JSON.parse(readFileSync(file, "utf8"));
  if (!snap.recap) {
    snap.recap = { headline: `Week ${week} recap`, featured: ranked.slice(0, 3).map(g => ({ matchup: g.matchup, hook: "", body: "", receipts: g.receipts })), meme: null };
    writeFileSync(file, JSON.stringify(snap, null, 2) + "\n");
    console.log(`\nSeeded lib/weeks/${week}.json with the top three.`);
  }
}
