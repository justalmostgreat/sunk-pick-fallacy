// Read-only public feeds: Sleeper (league + projections), FantasyCalc (dynasty values), ESPN (game clock). No keys.
export const LEAGUE_ID = "1392799570517303296";
const SLEEPER = "https://api.sleeper.app/v1";

export type Roster = {
  roster_id: number;
  owner_id: string;
  players: string[] | null;
  settings: { wins: number; losses: number; ties: number; fpts: number; fpts_decimal?: number; fpts_against?: number; fpts_against_decimal?: number };
};
export type Matchup = { roster_id: number; matchup_id: number | null; points: number | null; starters: string[]; players?: string[]; players_points: Record<string, number> | null };
export type DraftPick = { player_id: string; round: number; draft_slot: number; pick_no: number };
export type User = { user_id: string; display_name: string; metadata?: { team_name?: string } };
export type League = { season: string; settings: { playoff_teams: number; playoff_week_start: number; last_scored_leg: number; draft_rounds: number }; scoring_settings: Record<string, number> };
export type NflState = { week: number; season: string };
export type Projection = {
  player_id: string;
  stats: Record<string, number>;
  player: { first_name: string; last_name: string; position: string; team: string | null; injury_status: string | null } | null;
};
export type TradedPick = { season: string; round: number; roster_id: number; owner_id: number };
export type FcValue = { player: { name: string; sleeperId?: string; position: string; maybeAge?: number }; value: number; redraftValue: number; overallRank: number };
export type Espn = {
  week?: { number: number };
  events: {
    status: { period: number; displayClock: string; type: { state: "pre" | "in" | "post" } };
    competitions: { competitors: { team: { abbreviation: string } }[] }[];
  }[];
};

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json() as Promise<T>;
}

const positions = ["QB", "RB", "WR", "TE"].map(p => ["position[]", p]);

export const feeds = {
  state: () => get<NflState>(`${SLEEPER}/state/nfl`),
  league: () => get<League>(`${SLEEPER}/league/${LEAGUE_ID}`),
  rosters: () => get<Roster[]>(`${SLEEPER}/league/${LEAGUE_ID}/rosters`),
  users: () => get<User[]>(`${SLEEPER}/league/${LEAGUE_ID}/users`),
  matchups: (week: number) => get<Matchup[]>(`${SLEEPER}/league/${LEAGUE_ID}/matchups/${week}`),
  tradedPicks: () => get<TradedPick[]>(`${SLEEPER}/league/${LEAGUE_ID}/traded_picks`),
  startupPicks: () => get<DraftPick[]>(`${SLEEPER}/draft/1392799571096109056/picks`),
  projections: (season: string, week: number) =>
    get<Projection[]>(`https://api.sleeper.com/projections/nfl/${season}/${week}?${new URLSearchParams([["season_type", "regular"], ...positions])}`),
  values: () => get<FcValue[]>("https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5&includeAdp=false"),
  scoreboard: () => get<Espn>("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"),
};

export const teamName = (u: User | undefined) => u?.metadata?.team_name || u?.display_name || "Unclaimed";
