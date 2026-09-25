// Freeze a finished week after Monday night: node scripts/snapshot.mjs 3
// Writes lib/weeks/<week>.json from Sleeper (+ FantasyCalc for the dynasty table), keeps any recap already written there,
// and registers a new week in lib/weeks/index.ts.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { feeds, teamName } from "../lib/sleeper.ts";
import { dynastyRankings } from "../lib/dynasty.ts";

const week = Number(process.argv[2]);
if (!week) throw new Error("Usage: node scripts/snapshot.mjs <week>");
const file = new URL(`../lib/weeks/${week}.json`, import.meta.url);
const round = n => Math.round(n * 100) / 100;

const [state, league, rosters, users] = await Promise.all([feeds.state(), feeds.league(), feeds.rosters(), feeds.users()]);
if (week > league.settings.last_scored_leg) throw new Error(`Week ${week} isn't final in Sleeper yet (last scored: ${league.settings.last_scored_leg}).`);
const weeks = await Promise.all(Array.from({ length: week }, (_, i) => feeds.matchups(i + 1)));

// Standings after this week, rebuilt from every result so far.
const table = new Map(rosters.map(r => [r.roster_id, { rosterId: r.roster_id, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }]));
for (const games of weeks) for (const m of games) {
  const opp = games.find(o => o.matchup_id === m.matchup_id && o.roster_id !== m.roster_id);
  const t = table.get(m.roster_id);
  t.pf += m.points;
  if (!opp) continue;
  t.pa += opp.points;
  if (m.points > opp.points) t.wins++; else if (m.points < opp.points) t.losses++; else t.ties++;
}
const standings = [...table.values()]
  .sort((a, b) => b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pf - a.pf)
  .map(t => ({ ...t, pf: round(t.pf), pa: round(t.pa) }));

const finals = [...new Set(weeks[week - 1].map(m => m.matchup_id))].sort((a, b) => a - b).map(id => {
  const [a, b] = weeks[week - 1].filter(m => m.matchup_id === id).sort((x, y) => y.points - x.points);
  return { matchup: id, winner: a.roster_id, loser: b.roster_id, winnerPoints: a.points, loserPoints: b.points };
});

// Each team's top-scoring starter this week, for the scout's notes.
const names = new Map((await feeds.projections(league.season, week)).map(p => [p.player_id, p.player ? `${p.player.first_name} ${p.player.last_name}` : p.player_id]));
const mvp = Object.fromEntries(weeks[week - 1].map(m => {
  const pts = m.players_points ?? {};
  const id = m.starters.filter(s => s !== "0").sort((x, y) => (pts[y] ?? 0) - (pts[x] ?? 0))[0];
  return [m.roster_id, { name: names.get(id) ?? id, points: pts[id] ?? 0 }];
}));

// Values are only "as of now", so only the latest finished week gets a dynasty table.
const latest = week === league.settings.last_scored_leg;
const [values, traded, projections] = latest
  ? await Promise.all([feeds.values(), feeds.tradedPicks(), feeds.projections(league.season, state.week)])
  : [];
const dynasty = latest
  ? dynastyRankings({ rosters, values, traded, projections, season: league.season, rounds: league.settings.draft_rounds, played: week, weeks: league.settings.playoff_week_start - 1 })
  : null;

const byOwner = new Map(users.map(u => [u.user_id, u]));
const teams = Object.fromEntries(rosters.map(r => {
  const u = byOwner.get(r.owner_id);
  return [r.roster_id, { name: teamName(u), handle: u?.display_name ?? "" }];
}));

const previous = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const snapshot = { week, season: league.season, capturedAt: new Date().toISOString(), teams, finals, standings, dynasty, mvp, recap: previous.recap ?? null };
writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
const index = new URL("../lib/weeks/index.ts", import.meta.url);
const src = readFileSync(index, "utf8");
if (!src.includes(`"./${week}.json"`)) writeFileSync(index, src
  .replace(/((?:import w\d+ from "\.\/\d+\.json";\n)+)/, `$1import w${week} from "./${week}.json";\n`)
  .replace(/export const weeks = \[([^\]]*)\]/, `export const weeks = [$1, w${week}]`));
console.log(`Wrote lib/weeks/${week}.json — ${finals.length} finals, dynasty ${dynasty ? "captured" : "skipped"}, recap ${snapshot.recap ? "kept" : "empty"}.`);
