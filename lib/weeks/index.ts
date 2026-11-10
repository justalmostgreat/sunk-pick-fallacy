import type { Candidate } from "../deep-notes";
import type { DynastyRow } from "../dynasty";
import w1 from "./1.json";
import w2 from "./2.json";
import w3 from "./3.json";
import w4 from "./4.json";
import w5 from "./5.json";
import w6 from "./6.json";
import w7 from "./7.json";
import w8 from "./8.json";
import w9 from "./9.json";

export type Recap = {
  headline: string;
  featured: { matchup: number; hook: string; body: string; receipts: { label: string; value: string }[] }[];
  meme: { rosterId: number; caption: string; src?: string; alt?: string; width?: number; height?: number } | null;
  cover?: "meme"; // this issue's cover swaps the engraving for the reaction photo; the next issue brings the engraving back
};

export type Snapshot = {
  week: number;
  season: string;
  capturedAt: string;
  teams: Record<string, { name: string; handle: string }>;
  finals: { matchup: number; winner: number; loser: number; winnerPoints: number; loserPoints: number }[];
  standings: { rosterId: number; wins: number; losses: number; ties: number; pf: number; pa: number }[];
  dynasty: DynastyRow[] | null;
  mvp?: Record<string, { name: string; points: number }>; // each team's top-scoring starter that week
  recap: Recap | null;
  scout?: Record<string, Candidate[]> | null; // the season-long scout's notes, by roster id (the latest week only)
};

// Oldest first. After `node scripts/snapshot.mjs <week>`, import the new file here.
export const weeks = [w1, w2, w3, w4, w5, w6, w7, w8, w9] as Snapshot[];
