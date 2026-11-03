import type { DynastyRow } from "./dynasty";
import type { LiveRow } from "./live";
import type { Snapshot } from "./weeks";

export type Note = { kind: string; text: string };
type Game = { week: number; points: number; opp: number; oppPoints: number; won: boolean; margin: number };

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const k = (n: number) => `${(n / 1000).toFixed(1)}k`;
const ord = (n: number) => n + (["th", "st", "nd", "rd"][n % 10 > 3 || Math.floor((n % 100) / 10) === 1 ? 0 : n % 10] ?? "th");

// How often each kind of note comes up, relative to the others (1 = full rate): the commissioner's ratings.
// Unlisted kinds get 0.5. The original notes are demoted because they stay true for weeks, which made the page feel stale.
const WEIGHT: Record<string, number> = {
  swap: 1, "got away": 1, multiverse: 1, projected: 1, trade: 1, draft: 1, projection: 1, heartbreak: 1, cursed: 1, lore: 1,
  "costly call": 0.75, perfect: 0.75, steady: 0.75, rooms: 0.75, "bench team": 0.75, units: 0.75,
  star: 0.5, ghost: 0.5,
  rematch: 1, "this week": 0.75, injury: 0.75, streak: 0.75, luck: 0.75,
  high: 0.5, low: 0.5, trend: 0.5, margin: 0.5, mvp: 0.5, average: 0.5, schedule: 0.5, opponent: 0.5,
  age: 0.25, picks: 0.25, value: 0.25,
};

// mulberry32: a tiny seeded PRNG, so one seed always gives the same set of notes.
function rng(seed: number) {
  let a = Math.floor(seed * 2 ** 32) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

type Facts = {
  weeks: Snapshot[]; // finished weeks, oldest first
  dynasty: DynastyRow[];
  first: Partial<Record<number, string>>; // roster id → first name
  live?: LiveRow[]; // this week, while it's being played
};

// Everything notable and true about each team right now, scored by how interesting it is.
export function noteCandidates(input: Facts): Map<number, (Note & { score: number })[]> {
  const { weeks, dynasty, first, live } = input;
  const latest = weeks.at(-1);
  const who = (id: number) => first[id] ?? latest?.teams[id]?.name ?? "them";
  const ids = dynasty.map(d => d.rosterId);
  const games = new Map<number, Game[]>(ids.map(id => [id, []]));
  const allPlay = new Map(ids.map(id => [id, { w: 0, l: 0 }]));
  let high = { id: 0, points: -Infinity, week: 0 }, low = { id: 0, points: Infinity, week: 0 };

  for (const wk of weeks) {
    const scores: [number, number][] = [];
    for (const f of wk.finals) for (const [me, pts, opp, oppPts] of [[f.winner, f.winnerPoints, f.loser, f.loserPoints], [f.loser, f.loserPoints, f.winner, f.winnerPoints]]) {
      games.get(me)?.push({ week: wk.week, points: pts, opp, oppPoints: oppPts, won: pts > oppPts, margin: Math.abs(pts - oppPts) });
      scores.push([me, pts]);
      if (pts > high.points) high = { id: me, points: pts, week: wk.week };
      if (pts < low.points) low = { id: me, points: pts, week: wk.week };
    }
    for (const [id, pts] of scores) {
      const ap = allPlay.get(id);
      if (ap) for (const [, other] of scores) { if (other < pts) ap.w++; else if (other > pts) ap.l++; }
    }
  }

  const avg = (id: number) => { const g = games.get(id)!; return g.length ? g.reduce((s, x) => s + x.points, 0) / g.length : 0; };
  const against = (id: number) => games.get(id)!.reduce((s, x) => s + x.oppPoints, 0);
  const byAvg = [...ids].sort((a, b) => avg(b) - avg(a));
  const byAgainst = [...ids].sort((a, b) => against(b) - against(a));
  const byAge = dynasty.filter(d => d.age).sort((a, b) => a.age! - b.age!);
  const byPicks = [...dynasty].sort((a, b) => b.picks - a.picks);
  const byValue = [...dynasty].sort((a, b) => b.total - a.total);

  const candidates = (id: number) => {
    const out: (Note & { score: number })[] = [];
    const add = (kind: string, score: number, text: string) => out.push({ kind, score, text });
    const g = games.get(id)!, last = g.at(-1), prev = g.at(-2);
    const d = dynasty.find(x => x.rosterId === id)!;

    if (last) {
      let run = 0;
      for (let i = g.length - 1; i >= 0 && g[i].won === last.won; i--) run++;
      if (run >= 2) add("streak", 2 + run, last.won ? `Won ${run} straight.` : `Lost ${run} straight.`);

      const r = byAvg.indexOf(id) + 1;
      if (r === 1) add("average", 3, `Averaging ${f1(avg(id))} a week, best in the league.`);
      else if (r === ids.length) add("average", 3, `Averaging ${f1(avg(id))} a week, worst in the league.`);
      else if (r >= ids.length - 2) add("average", 1.5, `Averaging ${f1(avg(id))} a week, ${ord(r)} of ${ids.length}.`);

      const ap = allPlay.get(id)!, wins = g.filter(x => x.won).length, losses = g.length - wins;
      const luck = ap.w / Math.max(1, ap.w + ap.l) - wins / g.length;
      if (luck >= 0.25) add("luck", 3 + luck * 4, `${ap.w}–${ap.l} against the whole league, ${wins}–${losses} in real life. Unlucky.`);
      if (luck <= -0.25) add("luck", 3 - luck * 4, `${wins}–${losses}, but ${ap.w}–${ap.l} against the whole league. Lucky.`);

      if (byAgainst[0] === id) add("schedule", 2.5, `Has faced ${f2(against(id))} points, the most in the league. The schedule hates ${who(id)}.`);
      if (byAgainst.at(-1) === id) add("schedule", 2, `Has faced the fewest points in the league (${f2(against(id))}). Soft schedule.`);
      if (high.id === id) add("high", 3, `${f2(high.points)} in Week ${high.week}, the best score of the season.`);
      if (low.id === id) add("low", 2.5, `${f2(low.points)} in Week ${low.week}, the worst score of the season.`);

      if (prev) {
        const delta = last.points - prev.points;
        if (Math.abs(delta) >= 25) add("trend", 1.5 + Math.abs(delta) / 25, delta > 0 ? `Up ${f1(delta)} points from Week ${prev.week}.` : `Down ${f1(-delta)} points from Week ${prev.week}.`);
      }
      if (last.margin <= 6) add("margin", 2.5, last.won ? `Won by ${f2(last.margin)} in Week ${last.week}. Living dangerously.` : `Lost by ${f2(last.margin)} in Week ${last.week}. So close.`);
      if (last.margin >= 35) add("margin", 2.5, last.won ? `Won by ${f2(last.margin)} in Week ${last.week}. A beating.` : `Lost by ${f2(last.margin)} in Week ${last.week}. Ugly.`);

      const tops = weeks.flatMap(w => (w.mvp?.[id] ? [w.mvp[id]] : []));
      if (tops.length >= 2 && tops.every(m => m.name === tops[0].name)) add("mvp", 2.5, `${tops[0].name} has been the top scorer every week, ${f2(tops.reduce((s, m) => s + m.points, 0))} total.`);
      else if (tops.length >= 2 && new Set(tops.map(m => m.name)).size === tops.length) add("mvp", 1, `A different top scorer every week: ${tops.map(m => `${m.name} ${f2(m.points)}`).join(", ")}.`);
    }

    if (byAge[0]?.rosterId === id) add("age", 1.5, `Youngest core in the league, ${f1(d.age!)} on average.`);
    if (byAge.at(-1)?.rosterId === id) add("age", 1.5, `Oldest core in the league, ${f1(d.age!)} on average. Win-now mode.`);
    if (byPicks[0].rosterId === id && byPicks[0].picks > byPicks[1].picks) add("picks", 1.5, `Most draft capital in the league: ${k(d.picks)} in picks.`);
    if (byPicks.at(-1)!.rosterId === id && byPicks.at(-1)!.picks < byPicks.at(-2)!.picks) add("picks", 1.5, `Least draft capital in the league: ${k(d.picks)} in picks.`);
    if (byValue[0].rosterId === id && latest && latest.standings[0].rosterId !== id) add("value", 2, `Most long-term value in the league, and ${d.record}.`);
    const hurt = d.hurt.find(h => h.status === "IR" && h.rank <= 100);
    if (hurt) add("injury", 2, `${hurt.name} is on IR, the costliest injury on the roster.`);

    const now = live?.find(r => r.rosterId === id)?.week;
    if (now?.opponent && now.state !== "final") {
      const opp = now.opponent, met = g.filter(x => x.opp === opp);
      if (met.length) add("rematch", 2.5, `${met.every(x => x.won) ? "Beat" : met.every(x => !x.won) ? "Lost to" : "Split with"} ${who(opp)} ${met.length > 1 ? `${met.length} times` : `in Week ${met[0].week}`}. Rematch this week.`);
      add("this week", 1 + Math.abs(now.winProb - 0.5) * 3, `${Math.round(now.winProb * 100)}% to beat ${who(opp)} this week.`);
      if (g.length) add("opponent", 1, `This week’s opponent, ${who(opp)}, averages ${f1(avg(opp))}.`);
    }
    // The season-long notes saved with the latest snapshot: what could have been.
    for (const c of latest?.scout?.[id] ?? []) out.push(c);
    return out;
  };
  return new Map(ids.map(id => [id, candidates(id)]));
}

function draw<T>(items: T[], weight: (item: T) => number, rand: () => number): T | undefined {
  const ws = items.map(weight);
  let r = rand() * ws.reduce((a, b) => a + b, 0);
  return items.find((_, i) => (r -= ws[i]) < 0) ?? items.at(-1);
}

// One scout's note per team, drawn at random: likelier the more interesting the note and the higher its kind's weight.
// A new seed reshuffles the picks; no kind of note shows up more than twice on the page.
export function scoutNotes(input: Facts & { seed: number }): Map<number, Note> {
  const all = noteCandidates(input);
  const rand = rng(input.seed);
  const used = new Map<string, number>();
  const notes = new Map<number, Note>();
  const order = [...all.keys()].map(id => ({ id, r: rand() })).sort((a, b) => a.r - b.r);
  for (const { id } of order) {
    const open = all.get(id)!.filter(c => (used.get(c.kind) ?? 0) < 2);
    const pool = open.length ? open : all.get(id)!;
    // First the kind (its weight times its best note), then the note within it, so a kind with many notes
    // doesn't crowd out the rest.
    const kinds = [...new Set(pool.map(c => c.kind))];
    const best = (k: string) => Math.max(...pool.filter(c => c.kind === k).map(c => Math.max(0.1, c.score)));
    const kind = draw(kinds, k => (WEIGHT[k] ?? 0.5) * best(k), rand);
    const pick = kind && draw(pool.filter(c => c.kind === kind), c => Math.max(0.1, c.score), rand);
    if (!pick) continue;
    used.set(pick.kind, (used.get(pick.kind) ?? 0) + 1);
    notes.set(id, { kind: pick.kind, text: pick.text });
  }
  return notes;
}
