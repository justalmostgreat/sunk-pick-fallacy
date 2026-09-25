import type { FcValue, Projection, Roster, TradedPick } from "./sleeper";

export type DynastyRow = {
  rosterId: number;
  score: number; // 0–100: half this season, half the long run
  record: string;
  projectedWins: number; // record so far + expected wins in the games left
  total: number; // long-run market value: players + picks
  players: number;
  picks: number;
  age: number | null; // value-weighted, so the players who matter count most
  top: { name: string; value: number }[];
  hurt: { name: string; status: string; rank: number }[]; // rank = FantasyCalc overall rank
};

// Commissioner's injury calls on top of the market. Remove an entry when it no longer applies.
export const CUTS: Record<string, number> = { "12508": 0.8 }; // Sleeper id → value multiplier. Jaxson Dart: IR, meniscus surgery, a further 20% off.

const ord = (n: number) => n + (["th", "st", "nd", "rd"][n] ?? "th");
const OUT = new Set(["IR", "Out", "PUP", "Doubtful", "Sus", "DNR", "NA"]);
const CORE = 15; // players that decide this season: the lineup plus the depth that covers byes and injuries

// Half this season, half the long run.
// Season: projected final record — record so far, plus each remaining game's win chance from the roster's
//   current-season (redraft) market value against the league.
// Long run: FantasyCalc dynasty value of every player (age and injuries priced in) + the next three drafts' picks.
export function dynastyRankings(input: {
  rosters: Roster[];
  values: FcValue[];
  traded: TradedPick[];
  projections: Projection[];
  season: string;
  rounds: number;
  played: number; // weeks already in the record
  weeks: number; // regular-season length
  cuts?: Record<string, number>;
}): DynastyRow[] {
  const { rosters, values, traded, projections, season, rounds, played, weeks, cuts = CUTS } = input;
  const byId = new Map(values.filter(v => v.player.sleeperId).map(v => [v.player.sleeperId!, v]));
  const pickValue = new Map(values.filter(v => v.player.position === "PICK").map(v => [v.player.name, v.value]));
  const status = new Map(projections.map(p => [p.player_id, p.player?.injury_status]));
  const owner = new Map(traded.map(t => [`${t.season}-${t.round}-${t.roster_id}`, t.owner_id]));
  const years = [1, 2, 3].map(n => Number(season) + n);

  const teams = rosters.map(r => {
    const mine = (r.players ?? [])
      .flatMap(id => {
        const v = byId.get(id);
        return v ? [{ id, ...v, value: v.value * (cuts[id] ?? 1), now: v.redraftValue * (cuts[id] ?? 1) }] : [];
      })
      .sort((a, b) => b.value - a.value);
    const players = Math.round(mine.reduce((s, p) => s + p.value, 0));
    const aged = mine.filter(p => p.player.maybeAge);
    const agedValue = aged.reduce((s, p) => s + p.value, 0);
    let picks = 0;
    for (const y of years) for (let round = 1; round <= rounds; round++) for (const from of rosters)
      if ((owner.get(`${y}-${round}-${from.roster_id}`) ?? from.roster_id) === r.roster_id) picks += pickValue.get(`${y} ${ord(round)}`) ?? 0;
    return {
      r,
      strength: mine.map(p => p.now).sort((a, b) => b - a).slice(0, CORE).reduce((s, v) => s + v, 0),
      row: {
        rosterId: r.roster_id,
        total: players + picks,
        players,
        picks,
        age: agedValue ? aged.reduce((s, p) => s + p.player.maybeAge! * p.value, 0) / agedValue : null,
        top: mine.slice(0, 3).map(p => ({ name: p.player.name, value: Math.round(p.value) })),
        hurt: mine.filter(p => OUT.has(status.get(p.id) ?? "")).slice(0, 3).map(p => ({ name: p.player.name, status: status.get(p.id)!, rank: p.overallRank })),
      },
    };
  });

  const mean = teams.reduce((s, t) => s + t.strength, 0) / teams.length;
  const sd = Math.sqrt(teams.reduce((s, t) => s + (t.strength - mean) ** 2, 0) / teams.length) || 1;
  const left = Math.max(0, weeks - played);
  // ponytail: logistic ≈ Normal CDF; 0.5 keeps the best roster near 75–80% a week, as fantasy luck demands.
  const withSeason = teams.map(({ r, strength, row }) => {
    const { wins, losses, ties } = r.settings;
    const winChance = 1 / (1 + Math.exp((-0.5 * (strength - mean)) / sd));
    return { ...row, record: `${wins}–${losses}${ties ? `–${ties}` : ""}`, projectedWins: wins + ties / 2 + left * winChance };
  });
  const bestWins = Math.max(...withSeason.map(t => t.projectedWins)) || 1;
  const bestValue = Math.max(...withSeason.map(t => t.total)) || 1;
  return withSeason
    .map(t => ({ ...t, score: 100 * (0.5 * t.projectedWins / bestWins + 0.5 * t.total / bestValue) }))
    .sort((a, b) => b.score - a.score);
}
