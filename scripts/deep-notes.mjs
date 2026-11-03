// The season-long scout's notes for a finished week, saved into its snapshot. snapshot.mjs runs this for the
// latest week; to refresh a saved week by hand: node scripts/deep-notes.mjs 8
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deepNotes } from "../lib/deep-notes.ts";
import { score } from "../lib/live.ts";
import { firstNames } from "../lib/managers.ts";
import { feeds, teamName } from "../lib/sleeper.ts";

export async function seasonNotes(week, known = {}) {
  const league = known.league ?? await feeds.league();
  const [rosters, users] = await Promise.all([known.rosters ?? feeds.rosters(), known.users ?? feeds.users()]);
  const weeks = Array.from({ length: week }, (_, i) => i + 1);
  const [matchups, projections, stats, moves, draft] = await Promise.all([
    known.matchups ?? Promise.all(weeks.map(w => feeds.matchups(w))),
    Promise.all(weeks.map(w => feeds.projections(league.season, w))),
    Promise.all(weeks.map(w => feeds.stats(league.season, w))),
    Promise.all(weeks.map(w => feeds.transactions(w))),
    feeds.startupPicks(),
  ]);
  const scoring = league.scoring_settings;
  const players = {};
  const learn = (id, p) => { if (p?.last_name && p.position && !players[id]) players[id] = { name: `${p.first_name} ${p.last_name}`, position: p.position }; };
  for (const lines of [...stats, ...projections]) for (const x of lines) learn(x.player_id, x.player);
  for (const p of draft) learn(p.player_id, p.metadata);
  const owner = new Map(users.map(u => [u.user_id, u]));
  return deepNotes({
    week,
    slots: league.roster_positions,
    scoring,
    teams: Object.fromEntries(rosters.map(r => [r.roster_id, teamName(owner.get(r.owner_id))])),
    first: firstNames,
    matchups: matchups.slice(0, week),
    projected: projections.map(lines => Object.fromEntries(lines.map(p => [p.player_id, Math.max(0, score(p.stats ?? {}, scoring))]))),
    stats: stats.map(lines => Object.fromEntries(lines.map(p => [p.player_id, { points: score(p.stats ?? {}, scoring), played: (p.stats?.gp ?? 0) > 0 }]))),
    players,
    moves,
    draft,
    rosters: Object.fromEntries(rosters.map(r => [r.roster_id, r.players ?? []])),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const week = Number(process.argv[2]);
  if (!week) throw new Error("Usage: node scripts/deep-notes.mjs <week>");
  const file = new URL(`../lib/weeks/${week}.json`, import.meta.url);
  const snapshot = JSON.parse(readFileSync(file, "utf8"));
  snapshot.scout = await seasonNotes(week);
  writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
  const count = Object.values(snapshot.scout).reduce((a, cs) => a + cs.length, 0);
  console.log(`Saved ${count} season-long scout's notes into lib/weeks/${week}.json.`);
}
