import type { Espn, Matchup, Projection, Roster } from "./sleeper";

// NFL team → share of its game still to play (1 = not started, 0 = final). Teams on bye are absent.
export type Clock = Map<string, number>;

const ESPN_ALIAS: Record<string, string> = { WSH: "WAS" };

export function gameClock(espn: Espn): Clock {
  const clock: Clock = new Map();
  for (const ev of espn.events) {
    const { state } = ev.status.type;
    const [min, sec] = ev.status.displayClock.split(":").map(Number);
    const played = state === "pre" ? 0 : state === "post" ? 60 : Math.min(60, (ev.status.period - 1) * 15 + 15 - min - sec / 60);
    for (const c of ev.competitions[0].competitors) clock.set(ESPN_ALIAS[c.team.abbreviation] ?? c.team.abbreviation, 1 - played / 60);
  }
  return clock;
}

// League-specific fantasy points: projected stats · the league's scoring settings (TE bonus rides in as a stat).
export const score = (stats: Record<string, number>, scoring: Record<string, number>) =>
  Object.entries(stats).reduce((sum, [k, v]) => sum + v * (scoring[k] ?? 0), 0);

// Abramowitz–Stegun 7.1.26; plenty for win odds.
function phi(z: number) {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + Math.sign(z) * erf);
}

// ponytail: a starter's remaining output ~ Normal(proj, (0.5 × proj)²). Tune SPREAD if the odds feel too sure or too timid.
const SPREAD = 0.5;
const BUST = 5; // a top-100 starter who finishes under this many points gets the reaction photo

export type Week = { points: number; projected: number; opponent: number | null; oppPoints: number; winProb: number; state: "pre" | "live" | "final" };
export type LiveRow = {
  rosterId: number; wins: number; losses: number; ties: number; pf: number; pa: number;
  week: Week | null;
  standingWins: number; // record so far + this week as if it ended right now
  busts: { name: string; points: number }[];
};

export function liveStandings(input: {
  rosters: Roster[];
  matchups: Matchup[];
  projections: Projection[];
  scoring: Record<string, number>;
  clock: Clock;
  countWeek: boolean; // false once Sleeper has folded this week into the season record
  top100?: Set<string>; // Sleeper ids of FantasyCalc's top 100, for busts
}): LiveRow[] {
  const { rosters, matchups, projections, scoring, clock, countWeek, top100 = new Set() } = input;
  const proj = new Map(projections.map(p => [p.player_id, p]));
  type Team = { points: number; projected: number; variance: number; started: boolean; done: boolean; matchup: number | null; busts: LiveRow["busts"] };
  const teams = new Map<number, Team>();

  for (const m of matchups) {
    const t: Team = { points: m.points ?? 0, projected: 0, variance: 0, started: false, done: true, matchup: m.matchup_id, busts: [] };
    for (const id of m.starters) {
      if (id === "0") continue; // empty slot
      const p = proj.get(id);
      const actual = m.players_points?.[id] ?? 0;
      const nfl = p?.player?.team;
      // Share of this player's game still to play; null = no game this week (bye, free agent).
      // Without a clock, assume anyone who has scored is finished and anyone who hasn't is yet to play.
      const left = !clock.size ? (actual ? 0 : 1) : nfl && clock.has(nfl) ? clock.get(nfl)! : null;
      t.projected += actual;
      if (left === null) continue;
      const rest = Math.max(0, p ? score(p.stats, scoring) : 0) * left;
      t.projected += rest;
      t.variance += (SPREAD * rest) ** 2;
      if (left < 1) t.started = true;
      if (left > 0) t.done = false;
      if (clock.size && left === 0 && actual < BUST && top100.has(id) && p?.player) t.busts.push({ name: `${p.player.first_name} ${p.player.last_name}`, points: actual });
    }
    teams.set(m.roster_id, t);
  }

  return rosters.map(r => {
    const s = r.settings;
    const me = teams.get(r.roster_id);
    const opp = me?.matchup == null ? undefined : [...teams].find(([id, t]) => id !== r.roster_id && t.matchup === me.matchup);
    const them = opp?.[1];
    let week: Week | null = null;
    if (me) {
      const spread = Math.sqrt(me.variance + (them?.variance ?? 0));
      const diff = me.projected - (them?.projected ?? 0);
      const winProb = spread ? phi(diff / spread) : diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
      const state = me.done && them?.done !== false ? "final" : me.started || them?.started ? "live" : "pre";
      week = { points: me.points, projected: me.projected, opponent: opp?.[0] ?? null, oppPoints: them?.points ?? 0, winProb, state };
    }
    const leading = !countWeek || !week ? 0 : week.points > week.oppPoints ? 1 : week.points === week.oppPoints ? 0.5 : 0;
    return {
      rosterId: r.roster_id,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pf: s.fpts + (s.fpts_decimal ?? 0) / 100,
      pa: (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100,
      week,
      standingWins: s.wins + s.ties / 2 + leading,
      busts: me?.busts ?? [],
    };
  }).sort((a, b) => b.standingWins - a.standingWins || b.pf + (countWeek ? b.week?.points ?? 0 : 0) - (a.pf + (countWeek ? a.week?.points ?? 0 : 0)));
}
