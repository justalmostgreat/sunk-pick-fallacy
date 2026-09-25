// The scout: rank a finished week's games by how much the group chat will care, with receipts for each game.
// Plain rules for now; Jev (TypeSafe, via Cloudflare) replaces interest() once there's a token.
import { feeds, teamName } from "../lib/sleeper.ts";
import { score } from "../lib/live.ts";
import { firstNames } from "../lib/managers.ts";

const COMMISH = 1;
const f2 = n => n.toFixed(2);

export async function scout(week) {
  const league = await feeds.league();
  const [rosters, users, games, projections, values, draft] = await Promise.all([
    feeds.rosters(), feeds.users(), feeds.matchups(week), feeds.projections(league.season, week), feeds.values(), feeds.startupPicks(),
  ]);
  const proj = new Map(projections.map(p => [p.player_id, p]));
  const top100 = new Set(values.filter(v => v.overallRank <= 100).map(v => v.player.sleeperId));
  // Round.pick uses the pick number within the round; draft_slot is the column, which reverses in snake rounds.
  const picks = new Map(draft.map(d => [d.player_id, `${d.round}.${String((d.pick_no - 1) % rosters.length + 1).padStart(2, "0")}`]));
  const owner = new Map(users.map(u => [u.user_id, u]));
  const roster = new Map(rosters.map(r => [r.roster_id, r]));
  const label = id => { const r = roster.get(id); return `${teamName(owner.get(r.owner_id))}${firstNames[id] ? ` (${firstNames[id]})` : ""}`; };

  const side = m => {
    const pts = m.players_points ?? {};
    const out = new Set([...(roster.get(m.roster_id).reserve ?? []), ...(roster.get(m.roster_id).taxi ?? [])]); // not legal lineup swaps
    const player = id => {
      const p = proj.get(id)?.player;
      return { id, name: p ? `${p.first_name} ${p.last_name}` : id, pos: p?.position, pts: pts[id] ?? 0, proj: proj.has(id) ? score(proj.get(id).stats, league.scoring_settings) : 0, pick: picks.get(id) };
    };
    const starters = m.starters.filter(id => id !== "0").map(player);
    const bench = (m.players ?? []).filter(id => !m.starters.includes(id) && !out.has(id)).map(player);
    let crime = null; // best same-position bench swap
    for (const b of bench) for (const s of starters) if (b.pos === s.pos && b.pts - s.pts > (crime?.gain ?? 0)) crime = { bench: b, starter: s, gain: b.pts - s.pts };
    return {
      rosterId: m.roster_id, points: m.points ?? 0, projected: starters.reduce((s, p) => s + p.proj, 0),
      top: [...starters].sort((a, b) => b.pts - a.pts)[0],
      miss: [...starters].sort((a, b) => a.pts - a.proj - (b.pts - b.proj))[0],
      crime, busts: starters.filter(p => top100.has(p.id) && p.pts < 5),
    };
  };

  const sides = new Map(games.map(m => [m.roster_id, side(m)]));
  const high = Math.max(...games.map(m => m.points)), low = Math.min(...games.map(m => m.points));

  // ponytail: hand-tuned weights; Jev's "how much will the group chat care" score slots in here.
  const interest = ({ w, l, margin }) => {
    const why = [];
    let s = 0;
    if (margin < 10) { s += 3 + (10 - margin) / 5; why.push(`nail-biter by ${f2(margin)}`); }
    if (margin > 35) { s += 2 + (margin - 35) / 20; why.push(`blowout by ${f2(margin)}`); }
    if (w.projected < l.projected) { s += 2 + (l.projected - w.projected) / 15; why.push(`upset: projected to lose by ${(l.projected - w.projected).toFixed(1)}`); }
    if (l.crime && l.crime.gain > margin) { s += 3; why.push(`bench flip: ${l.crime.bench.name} ${f2(l.crime.bench.pts)} sat behind ${l.crime.starter.name} ${f2(l.crime.starter.pts)}`); }
    if (w.points === high) { s += 1.5; why.push(`week-high ${f2(high)}`); }
    if (l.points === low || w.points === low) { s += 1.5; why.push(`week-low ${f2(low)}`); }
    const busts = [...w.busts, ...l.busts];
    if (busts.length) { s += Math.min(2, busts.length); why.push(`busts: ${busts.map(b => `${b.name} ${f2(b.pts)}`).join(", ")}`); }
    if ([w.rosterId, l.rosterId].includes(COMMISH)) { s += 1; why.push("the commissioner is in it"); }
    return { s, why };
  };

  const receipt = (p, text) => ({ label: text ?? `${p.name}${p.pick ? `, pick ${p.pick}` : ""}`, value: f2(p.pts) });
  const ranked = [...new Set(games.map(m => m.matchup_id))]
    .map(id => {
      const [w, l] = games.filter(m => m.matchup_id === id).map(m => sides.get(m.roster_id)).sort((a, b) => b.points - a.points);
      const g = { matchup: id, w, l, margin: w.points - l.points };
      return { ...g, ...interest(g), receipts: [receipt(w.top), receipt(l.miss), l.crime ? receipt(l.crime.bench, `${l.crime.bench.name} on the bench`) : receipt(l.top)] };
    })
    .sort((a, b) => b.s - a.s);
  return { ranked, label };
}
