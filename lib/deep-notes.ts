// Season-long scout's notes: what could have been. Computed once a week from Sleeper (lineups with bench points,
// transactions, projections, the startup draft) and saved with that week's snapshot, so page views stay fast.
import type { Matchup } from "./sleeper";

export type Candidate = { kind: string; score: number; text: string };
type Pick = { pick_no: number; round: number; roster_id: number; player_id: string };
type Move = { type: string; status: string; adds: Record<string, number> | null; drops: Record<string, number> | null; roster_ids: number[]; draft_picks?: { season: string; round: number; owner_id: number }[] };

export type Season = {
  week: number; // the latest finished week; matchups, projected and stats cover weeks 1..week
  slots: string[]; // league.roster_positions
  scoring: Record<string, number>;
  teams: Record<number, string>; // roster id → team name
  first: Partial<Record<number, string>>; // roster id → first name
  matchups: Matchup[][];
  projected: Record<string, number>[]; // per week: player id → projected points
  stats: Record<string, { points: number; played: boolean }>[]; // per week, every player with a stat line
  players: Record<string, { name: string; position: string }>;
  moves: Move[][]; // per week: Sleeper transactions
  draft: Pick[]; // startup draft
  rosters: Record<number, string[]>; // current rosters
};

const ELIGIBLE: Record<string, string[]> = { QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], FLEX: ["RB", "WR", "TE"], WRRB_FLEX: ["RB", "WR"], REC_FLEX: ["WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"] };
const FILL = ["QB", "RB", "WR", "TE", "WRRB_FLEX", "REC_FLEX", "FLEX", "SUPER_FLEX"]; // most restrictive first
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const ord = (n: number) => n + (["th", "st", "nd", "rd"][n % 10 > 3 || Math.floor((n % 100) / 10) === 1 ? 0 : n % 10] ?? "th");
const times = (n: number) => (n === 2 ? "twice" : `${n} times`);
const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const result = (a: number, b: number) => (a > b ? 1 : a < b ? 0 : 0.5);
const record = (rs: number[]) => {
  const w = rs.filter(r => r === 1).length, l = rs.filter(r => r === 0).length, t = rs.length - w - l;
  return `${w}–${l}${t ? `–${t}` : ""}`;
};
const wins = (rs: number[]) => rs.reduce((a, b) => a + b, 0);

type Game = { week: number; points: number; opp: number; oppPoints: number; starters: string[]; bench: string[]; pp: Record<string, number>; roster: string[] };

export function deepNotes(s: Season): Record<number, Candidate[]> {
  const N = s.week;
  const weeks = Array.from({ length: N }, (_, i) => i + 1);
  const ids = Object.keys(s.teams).map(Number);
  const who = (id: number) => s.first[id] ?? s.teams[id];
  const name = (p: string) => s.players[p]?.name;
  const pos = (p: string) => s.players[p]?.position;
  const slots = s.slots.filter(x => ELIGIBLE[x]);
  const fits = (slot: string, p: string) => !!pos(p) && ELIGIBLE[slot]?.includes(pos(p)!);
  const out = new Map<number, Candidate[]>(ids.map(id => [id, []]));
  const add = (id: number, kind: string, score: number, text: string) => out.get(id)?.push({ kind, score: Math.round(score * 100) / 100, text });

  // Every team's games, week by week. A week without an opponent (playoff byes) is left out.
  const games = new Map<number, Game[]>(ids.map(id => [id, []]));
  for (const w of weeks) for (const m of s.matchups[w - 1] ?? []) {
    const o = (s.matchups[w - 1] ?? []).find(x => x.matchup_id != null && x.matchup_id === m.matchup_id && x.roster_id !== m.roster_id);
    if (!o) continue;
    const roster = m.players ?? [];
    games.get(m.roster_id)?.push({ week: w, points: m.points ?? 0, opp: o.roster_id, oppPoints: o.points ?? 0, starters: m.starters, bench: roster.filter(p => !m.starters.includes(p)), pp: m.players_points ?? {}, roster });
  }
  const real = (id: number) => games.get(id)!.map(g => result(g.points, g.oppPoints));
  const scoreOf = (id: number, w: number) => games.get(id)!.find(g => g.week === w)?.points ?? 0;
  // The best legal lineup from a pool of players, filling the narrowest slots first.
  const bestLineup = (pool: string[], pts: (p: string) => number) => {
    const left = pool.filter(p => pos(p)).sort((a, b) => pts(b) - pts(a));
    let total = 0;
    for (const slot of [...slots].sort((a, b) => FILL.indexOf(a) - FILL.indexOf(b))) {
      const i = left.findIndex(p => fits(slot, p));
      if (i >= 0) total += pts(left.splice(i, 1)[0]);
    }
    return total;
  };
  // The weakest starter a player could have replaced, and the score with that swap made.
  const swapIn = (g: Game, p: string, points: number) => {
    let best: { score: number; replaced: string } | null = null;
    for (const [i, st] of g.starters.entries()) {
      if (st === "0" || st === p || !fits(slots[i], p)) continue;
      const score = g.points - (g.pp[st] ?? 0) + points;
      if (!best || score > best.score) best = { score, replaced: st };
    }
    return best;
  };

  for (const id of ids) {
    const g = games.get(id)!;
    if (!g.length) continue;
    const rs = real(id), rec = record(rs);

    // 1. The one swap: the bench player who, started over the same starter every week both were options, flips the most games.
    const pairs = new Map<string, { b: string; st: string; weeks: number[]; rs: number[]; gain: number }>();
    g.forEach((x, gi) => x.starters.forEach((st, i) => {
      if (st === "0") return;
      for (const b of x.bench) {
        if (!fits(slots[i], b)) continue;
        const key = `${b}>${st}`, pair = pairs.get(key) ?? { b, st, weeks: [], rs: [...rs], gain: 0 };
        pair.weeks.push(x.week);
        pair.rs[gi] = result(x.points - (x.pp[st] ?? 0) + (x.pp[b] ?? 0), x.oppPoints);
        pair.gain += (x.pp[b] ?? 0) - (x.pp[st] ?? 0);
        pairs.set(key, pair);
      }
    }));
    const swap = [...pairs.values()].filter(p => p.weeks.length >= 2 && name(p.b) && name(p.st) && wins(p.rs) > wins(rs))
      .sort((a, b) => wins(b.rs) - wins(a.rs) || b.gain - a.gain)[0];
    if (swap) {
      const more = wins(swap.rs) - wins(rs), fresh = swap.weeks.includes(N) && swap.rs[g.length - 1] !== rs[g.length - 1];
      add(id, "swap", 3 + more + (fresh ? 1 : 0), `Starting ${name(swap.b)} over ${name(swap.st)} in the ${swap.weeks.length} weeks ${who(id)} had both would have made ${who(id)} ${record(swap.rs)}, not ${rec}${swap.gain < 0 ? `, even though ${name(swap.b)} scored ${f1(-swap.gain)} fewer points` : ""}.`);
    }

    // 2. The costliest call: one benching that cost a game. The latest week wins ties for freshness.
    const calls = g.filter(x => x.points < x.oppPoints).flatMap(x => x.starters.flatMap((st, i) => st === "0" ? [] : x.bench
      .filter(b => fits(slots[i], b) && name(b) && name(st) && x.points - (x.pp[st] ?? 0) + (x.pp[b] ?? 0) > x.oppPoints)
      .map(b => ({ x, b, st, swing: (x.pp[b] ?? 0) - (x.pp[st] ?? 0) }))));
    const call = calls.sort((a, b) => b.x.week - a.x.week || b.swing - a.swing)[0];
    if (call) add(id, "costly call", 2.5 + (call.x.week === N ? 2.5 : 0), `Lost Week ${call.x.week} to ${who(call.x.opp)} by ${f2(call.x.oppPoints - call.x.points)} with ${name(call.b)}’s ${f2(call.x.pp[call.b] ?? 0)} on the bench. ${name(call.st)} started and scored ${f2(call.x.pp[call.st] ?? 0)}.`);

    // 3. Perfect-lineup record.
    const perfect = g.map(x => result(bestLineup([...x.starters, ...x.bench].filter(p => p !== "0"), p => x.pp[p] ?? 0), x.oppPoints));
    const benched = g.reduce((a, x) => a + bestLineup([...x.starters, ...x.bench].filter(p => p !== "0"), p => x.pp[p] ?? 0) - x.points, 0);
    if (wins(perfect) - wins(rs) >= 2) add(id, "perfect", 2 + (wins(perfect) - wins(rs)) / 2, `With the best possible lineup every week, ${who(id)} would be ${record(perfect)}, not ${rec}. ${f1(benched)} points have sat on the bench.`);

    // 5. Without the star: the top scorer's starts go to the best bench option instead.
    const totals = new Map<string, number>();
    for (const x of g) for (const st of x.starters) if (st !== "0") totals.set(st, (totals.get(st) ?? 0) + (x.pp[st] ?? 0));
    const [star, starPts] = [...totals].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (star && name(star)) {
      const without = g.map(x => {
        const i = x.starters.indexOf(star);
        if (i < 0) return result(x.points, x.oppPoints);
        const sub = Math.max(0, ...x.bench.filter(b => fits(slots[i], b)).map(b => x.pp[b] ?? 0));
        return result(x.points - (x.pp[star] ?? 0) + sub, x.oppPoints);
      });
      const all = g.reduce((a, x) => a + x.points, 0);
      if (wins(rs) - wins(without) >= 1) add(id, "star", 2 + wins(rs) - wins(without), `Take away ${name(star)} and ${who(id)} is ${record(without)}, not ${rec}. ${name(star)} has scored ${Math.round((100 * starPts) / all)}% of the team’s points.`);
    }

    // 6 and 20. The schedule multiverse: these scores against every other team's opponents.
    const swapped = ids.filter(o => o !== id && games.get(o)!.length).map(o => {
      const theirs = games.get(o)!;
      const r = g.map(x => {
        const opp = theirs.find(t => t.week === x.week)?.opp;
        return opp === undefined ? result(x.points, x.oppPoints) : result(x.points, scoreOf(opp === id ? o : opp, x.week));
      });
      return { o, r };
    }).sort((a, b) => wins(b.r) - wins(a.r));
    const lucky = swapped[0], cursed = swapped.at(-1);
    const isSchedule = (team: number) => /schedule/i.test(s.teams[team] ?? "");
    if (lucky && wins(lucky.r) - wins(rs) >= 2) {
      const lore = isSchedule(lucky.o);
      add(id, lore ? "lore" : "multiverse", 2.5 + (wins(lucky.r) - wins(rs)) / 2, lore
        ? `${who(id)} is ${rec}. With ${s.teams[lucky.o]}’s schedule, ${who(id)} would be ${record(lucky.r)}. It’s in the name.`
        : `${who(id)} is ${rec}. With ${who(lucky.o)}’s schedule, ${who(id)} would be ${record(lucky.r)}.`);
    }
    if (cursed && wins(rs) - wins(cursed.r) >= 2) {
      const lore = isSchedule(id);
      add(id, lore ? "lore" : "multiverse", 2.5 + (wins(rs) - wins(cursed.r)) / 2, lore
        ? `Even ${s.teams[id]} can’t beat every schedule: with ${who(cursed.o)}’s, it would be ${record(cursed.r)}, not ${rec}.`
        : `With ${who(cursed.o)}’s schedule, ${who(id)} would be ${record(cursed.r)}, not ${rec}.`);
    }

    // 7 and 20. As projected: every game decided by Sleeper's projections for the starters.
    const proj = (team: number, w: number) => (games.get(team)!.find(x => x.week === w)?.starters ?? []).reduce((a, p) => a + (s.projected[w - 1]?.[p] ?? 0), 0);
    const asProj = g.map(x => result(proj(id, x.week), proj(x.opp, x.week)));
    const gap = !g.every(x => proj(id, x.week) > 0) ? 0 : wins(rs) - wins(asProj); // no projections, no comparison
    if (/projection/i.test(s.teams[id] ?? "") && Math.abs(gap) >= 1) add(id, "lore", 2.5 + Math.abs(gap) / 2, `${s.teams[id]}, as advertised: ${record(asProj)} if every game had gone to Sleeper’s projections, ${rec} in real life.`);
    else if (gap >= 2) add(id, "projected", 2.5 + gap / 2, `If every game had gone to Sleeper’s projections, ${who(id)} would be ${record(asProj)}. ${who(id)} is ${rec}.`);
    else if (gap <= -2) add(id, "projected", 2.5 - gap / 2, `${who(id)} would be ${record(asProj)} if every game had gone to Sleeper’s projections. ${who(id)} is ${rec}, with ${asProj.filter((r, i) => r === 1 && rs[i] === 0).length} losses as the favorite.`);
    const last = g.at(-1)!;
    const by = Math.abs(proj(id, N) - proj(last.opp, N)), margin = Math.abs(last.points - last.oppPoints);
    if (last.week === N && asProj.at(-1) !== rs.at(-1) && rs.at(-1) !== 0.5 && by >= 0.5) {
      add(id, "projected", 4 + by / 15, rs.at(-1) === 1
        ? `Sleeper had ${who(id)} losing Week ${N} by ${f1(by)}. ${who(id)} won by ${f2(margin)}.`
        : `Sleeper had ${who(id)} beating ${who(last.opp)} by ${f1(by)} in Week ${N}. ${who(id)} lost by ${f2(margin)}.`);
    }

    // 12. Projection busts and booms: rostered players against what Sleeper projected for them.
    const seen = new Map<string, { actual: number; projected: number; n: number }>();
    for (const x of g) for (const p of x.roster) {
      const t = seen.get(p) ?? { actual: 0, projected: 0, n: 0 };
      t.actual += x.pp[p] ?? 0; t.projected += s.projected[x.week - 1]?.[p] ?? 0; t.n++;
      seen.set(p, t);
    }
    const graded = [...seen].filter(([p, t]) => t.n >= 4 && t.projected > 30 && name(p)).map(([p, t]) => ({ p, ...t, diff: t.actual - t.projected }));
    const bust = [...graded].sort((a, b) => a.diff - b.diff)[0], boom = [...graded].sort((a, b) => b.diff - a.diff)[0];
    if (bust && bust.diff <= -20) add(id, "projection", 2 + -bust.diff / 25, `Sleeper has projected ${name(bust.p)} for ${f1(bust.projected)} points on ${who(id)}’s roster. ${name(bust.p)} has delivered ${f1(bust.actual)}.`);
    if (boom && boom.diff >= 20) add(id, "projection", 2 + boom.diff / 25, `${name(boom.p)} has scored ${f1(boom.actual)} for ${who(id)}, ${Math.round((100 * boom.diff) / boom.projected)}% more than Sleeper projected.`);

    // 13. Heartbreak and robbery: a losing score most of the league didn't reach, or a winning one most of it beat.
    const others = (x: Game) => ids.filter(o => o !== id).map(o => scoreOf(o, x.week));
    const heart = g.filter(x => x.points < x.oppPoints).map(x => ({ x, beat: others(x).filter(p => p < x.points).length })).filter(h => h.beat >= ids.length - 3).at(-1);
    if (heart) add(id, "heartbreak", 2.5 + (heart.x.week === N ? 2.5 : 0) + (heart.beat - 6) / 2, heart.beat === ids.length - 2
      ? `${who(id)} scored ${f2(heart.x.points)} in Week ${heart.x.week}, enough to beat every team except the one ${who(id)} played.`
      : `${who(id)} scored ${f2(heart.x.points)} in Week ${heart.x.week}, more than ${heart.beat} of the other ${ids.length - 1} teams, and lost to ${who(heart.x.opp)}.`);
    const rob = g.filter(x => x.points > x.oppPoints).map(x => ({ x, lost: others(x).filter(p => p > x.points).length })).filter(h => h.lost >= ids.length - 3).at(-1);
    if (rob) add(id, "heartbreak", 2.5 + (rob.x.week === N ? 2.5 : 0) + (rob.lost - 6) / 2, rob.lost === ids.length - 2
      ? `${who(id)} won Week ${rob.x.week} with ${f2(rob.x.points)}, a score that beat only the team ${who(id)} played.`
      : `${who(id)} won Week ${rob.x.week} with ${f2(rob.x.points)}. ${rob.lost} of the other ${ids.length - 1} teams scored more.`);

    // 14. Cursed opponents: losses that came on the opponent's best day of the season.
    const high = (o: number) => Math.max(...games.get(o)!.map(x => x.points));
    const curses = g.filter(x => x.points < x.oppPoints && x.oppPoints >= high(x.opp));
    if (last.week === N && curses.includes(last)) add(id, "cursed", 4.5, `${who(last.opp)} saved a season-high ${f2(last.oppPoints)} for ${who(id)} in Week ${N}.`);
    if (curses.length >= 2) add(id, "cursed", 2.5 + curses.length / 2, `${curses.length} of ${who(id)}’s ${rs.filter(r => r === 0).length} losses came on the opponent’s best day of the season.`);

    // 17. Ghost starters: started, didn't play.
    const ghosts = g.flatMap(x => x.starters.filter(p => p !== "0" && name(p) && !s.stats[x.week - 1]?.[p]?.played).map(p => ({ p, week: x.week })));
    if (ghosts.length) {
      const byPlayer = new Map<string, number[]>();
      for (const x of ghosts) byPlayer.set(x.p, [...(byPlayer.get(x.p) ?? []), x.week]);
      const when = (ws: number[]) => (ws.length === 1 ? `Week ${ws[0]}` : `Weeks ${list(ws.map(String))}`);
      const [[p0, w0]] = byPlayer;
      add(id, "ghost", 1.5 + ghosts.length / 2 + (ghosts.some(x => x.week === N) ? 1.5 : 0), byPlayer.size > 1
        ? `${who(id)} has started someone who didn’t play ${times(ghosts.length)}: ${list([...byPlayer].map(([p, ws]) => `${name(p)} (${when(ws)})`))}.`
        : w0.length === 1 ? `${who(id)} started ${name(p0)} in Week ${w0[0]}, and ${name(p0)} didn’t play.`
        : `${who(id)} has started ${name(p0)} ${times(w0.length)} when ${name(p0)} didn’t play (${when(w0)}).`);
    }

    // 19. Margins in football terms.
    const close = g.filter(x => Math.abs(x.points - x.oppPoints) < 8 && x.points !== x.oppPoints).sort((a, b) => b.week - a.week)[0];
    const perYard = s.scoring.rush_yd || 0.1, perPass = s.scoring.pass_yd || 0.04;
    if (close) {
      const m = Math.abs(close.points - close.oppPoints), yards = Math.floor(m / perYard) + 1, passing = Math.floor(m / perPass) + 1;
      add(id, "units", 2 + (close.week === N ? 2.5 : 0) + (m < 3 ? 1 : 0), close.points < close.oppPoints
        ? `${who(id)} lost Week ${close.week} by ${f2(m)}. ${yards} more rushing yards, or ${passing} passing yards, would have flipped it.`
        : `${who(id)} beat ${who(close.opp)} by ${f2(m)} in Week ${close.week}: ${yards} rushing yards from a loss.`);
    }
  }

  // 9. The one that got away: a dropped player who, kept and started, would have flipped a loss. Only flips count.
  const dropped = new Map<string, { p: string; id: number; week: number }>();
  s.moves.forEach((ms, i) => {
    for (const m of ms) if (m.status === "complete" && m.type !== "trade") for (const [p, id] of Object.entries(m.drops ?? {})) {
      const key = `${id}:${p}`;
      if (!dropped.has(key)) dropped.set(key, { p, id, week: i + 1 });
    }
  });
  const gotAway = new Map<number, { p: string; week: number; flips: Game[]; points: Record<number, number> }[]>();
  for (const d of dropped.values()) {
    if (!name(d.p) || !games.has(d.id)) continue;
    const points: Record<number, number> = {};
    const flips = games.get(d.id)!.filter(x => {
      if (x.week <= d.week || x.roster.includes(d.p) || x.points >= x.oppPoints) return false;
      points[x.week] = s.stats[x.week - 1]?.[d.p]?.points ?? 0;
      const swap = swapIn(x, d.p, points[x.week]);
      return !!swap && swap.score > x.oppPoints;
    });
    if (flips.length) gotAway.set(d.id, [...(gotAway.get(d.id) ?? []), { p: d.p, week: d.week, flips, points }]);
  }
  for (const [id, ghosts] of gotAway) {
    const rs = real(id);
    for (const x of ghosts) {
      const now = ids.find(o => s.rosters[o]?.includes(x.p));
      const where = now === id ? "" : now ? ` ${name(x.p)} is on ${who(now)}’s roster now.` : ` ${name(x.p)} is still a free agent.`;
      const latest = x.flips.find(f => f.week === N);
      const more = x.flips.length > 1 ? ` That’s ${x.flips.length} wins ${name(x.p)} would have added: ${who(id)} would be ${record(rs.map((r, i) => (x.flips.includes(games.get(id)![i]) ? 1 : r)))}.` : "";
      add(id, "got away", 3 + x.flips.length + (latest ? 2.5 : 0), latest
        ? `${who(id)} dropped ${name(x.p)} in Week ${x.week}. ${name(x.p)}’s ${f2(x.points[N])} in Week ${N} would have beaten ${who(latest.opp)} instead of losing by ${f2(latest.oppPoints - latest.points)}.${more}${where}`
        : x.flips.length === 1
          ? `Keeping ${name(x.p)}, dropped in Week ${x.week}, would have flipped ${who(id)}’s Week ${x.flips[0].week} loss to ${who(x.flips[0].opp)}: ${name(x.p)} scored ${f2(x.points[x.flips[0].week])}.${where}`
          : `Keeping ${name(x.p)}, dropped in Week ${x.week}, would have flipped ${x.flips.length} of ${who(id)}’s losses: ${who(id)} would be ${record(rs.map((r, i) => (x.flips.includes(games.get(id)![i]) ? 1 : r)))}.${where}`);
    }
  }

  // 10. Trade scoreboard: points each side's incoming players have scored in their new team's lineup.
  s.moves.forEach((ms, i) => {
    const week = i + 1;
    for (const m of ms) {
      if (m.type !== "trade" || m.status !== "complete") continue;
      const incoming = (team: number) => Object.entries(m.adds ?? {}).filter(([, r]) => r === team).map(([p]) => p);
      const started = (team: number) => incoming(team).reduce((a, p) => a + (games.get(team) ?? []).filter(x => x.week >= week && x.starters.includes(p)).reduce((b, x) => b + (x.pp[p] ?? 0), 0), 0);
      const sides = m.roster_ids.filter(r => games.has(r));
      if (sides.length !== 2 || sides.some(r => !incoming(r).every(name))) continue;
      const [a, b] = sides, pa = started(a), pb = started(b);
      if (pa + pb < 15) continue;
      const plus = (team: number) => {
        const got = (m.draft_picks ?? []).filter(d => d.owner_id === team).map(d => `a ${d.season} ${ord(d.round)}`);
        return got.length ? ` (plus ${list(got)})` : "";
      };
      for (const [me, them, mine, theirs] of [[a, b, pa, pb], [b, a, pb, pa]] as const) {
        const got = incoming(me).map(p => name(p)!), gave = incoming(them).map(p => name(p)!);
        if (!got.length || !gave.length) continue;
        add(me, "trade", 2.5 + Math.abs(mine - theirs) / 40 + (week >= N - 1 ? 1 : 0), `Since the Week ${week} trade, ${list(got)}${plus(me)} ${got.length > 1 ? "have" : "has"} scored ${f1(mine)} in ${who(me)}’s lineup. ${list(gave)}${plus(them)} ${gave.length > 1 ? "have" : "has"} scored ${f1(theirs)} in ${who(them)}’s.`);
      }
    }
  });

  // 11. Startup draft regret, and the steal.
  const season = (p: string) => s.stats.reduce((a, wk) => a + (wk[p]?.points ?? 0), 0);
  const picks = [...s.draft].sort((a, b) => a.pick_no - b.pick_no);
  const firsts = picks.filter(p => p.round === 1).map(p => season(p.player_id));
  for (const id of ids) {
    const regret = picks.filter(p => p.roster_id === id && p.round <= 3 && name(p.player_id)).map(p => {
      const later = picks.filter(x => x.pick_no > p.pick_no && x.pick_no <= p.pick_no + 10 && x.roster_id !== id && name(x.player_id))
        .map(x => ({ x, pts: season(x.player_id) })).sort((a, b) => b.pts - a.pts)[0];
      return later && { p, mine: season(p.player_id), ...later, gap: later.pts - season(p.player_id) };
    }).filter(r => r && r.gap >= 40).sort((a, b) => b!.gap - a!.gap)[0];
    if (regret) {
      const k = regret.x.pick_no - regret.p.pick_no;
      add(id, "draft", 2 + regret.gap / 50, `${who(id)} took ${name(regret.p.player_id)} ${ord(regret.p.pick_no)} in the startup draft: ${f1(regret.mine)} points this season. ${k} ${k > 1 ? "picks" : "pick"} later, ${who(regret.x.roster_id)} took ${name(regret.x.player_id)}: ${f1(regret.pts)}.`);
    }
    // A steal: a late pick that has outscored half the first round. Later is more surprising.
    const steal = picks.filter(p => p.roster_id === id && p.round >= 8 && name(p.player_id)).map(p => ({ p, pts: season(p.player_id), beat: firsts.filter(f => f < season(p.player_id)).length }))
      .filter(x => x.beat >= Math.ceil(firsts.length / 2)).sort((a, b) => b.p.round + b.beat - (a.p.round + a.beat))[0];
    if (steal) add(id, "draft", 2 + steal.beat / 5 + steal.p.round / 10, `${who(id)} took ${name(steal.p.player_id)} with the ${ord(steal.p.pick_no)} pick. ${name(steal.p.player_id)} has outscored ${steal.beat} of the ${firsts.length} first-rounders.`);
  }

  // League-wide extremes: the steadiest and swingiest teams, position rooms, and benches that could field a team.
  const played = ids.filter(id => games.get(id)!.length >= 3);
  const spread = (id: number) => {
    const xs = games.get(id)!.map(x => x.points), mu = xs.reduce((a, b) => a + b, 0) / xs.length;
    return { sd: Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length), lo: Math.min(...xs), hi: Math.max(...xs) };
  };
  const bySpread = [...played].sort((a, b) => spread(a).sd - spread(b).sd);
  if (bySpread.length >= 3) {
    const steady = bySpread[0], wild = bySpread.at(-1)!;
    add(steady, "steady", 2, `${who(steady)} has scored between ${f1(spread(steady).lo)} and ${f1(spread(steady).hi)} every week, the steadiest team in the league.`);
    add(wild, "steady", 2, `${who(wild)} has ranged from ${f1(spread(wild).lo)} to ${f1(spread(wild).hi)}, the league’s biggest swings.`);
  }
  for (const position of ["QB", "RB", "WR", "TE"]) {
    const room = (id: number) => games.get(id)!.reduce((a, x) => a + x.starters.filter(p => pos(p) === position).reduce((b, p) => b + (x.pp[p] ?? 0), 0), 0);
    const ranked = [...played].sort((a, b) => room(b) - room(a));
    if (ranked.length < 3) continue;
    const top = ranked[0], bottom = ranked.at(-1)!;
    if (room(top) < 1.5 * room(bottom)) continue;
    add(bottom, "rooms", 2, `${who(bottom)}’s ${position}s have ${f1(room(bottom))} points all season. ${who(top)}’s have ${f1(room(top))}.`);
    add(top, "rooms", 2, `${who(top)}’s ${position}s lead the league with ${f1(room(top))} points, ${(room(top) / Math.max(1, room(bottom))).toFixed(1)} times the worst ${position} room.`);
  }
  const benchRecord = (id: number) => games.get(id)!.map(x => result(bestLineup(x.bench, p => x.pp[p] ?? 0), x.oppPoints));
  const winners = played.filter(id => wins(benchRecord(id)) >= 1);
  for (const id of winners) add(id, "bench team", 2 + wins(benchRecord(id)), `${who(id)}’s bench, playing as its own team, would be ${record(benchRecord(id))}${winners.length === 1 ? `. No other bench has won a game` : ""}.`);

  return Object.fromEntries([...out].map(([id, cs]) => [id, cs.sort((a, b) => b.score - a.score)]));
}
