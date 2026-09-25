// Self-check for the live and dynasty models: node scripts/check-models.mjs
import assert from "node:assert/strict";
import { gameClock, liveStandings, score } from "../lib/live.ts";
import { dynastyRankings } from "../lib/dynasty.ts";
import { noteCandidates, scoutNotes } from "../lib/insights.ts";
import { parseBlurb, splitHook } from "../lib/blurb.ts";
import phones from "../lib/coaches.json" with { type: "json" };
import { coachTel, firstNames } from "../lib/managers.ts";

const scoring = { rec: 0.5, bonus_rec_te: 0.5, rec_yd: 0.1, pass_td: 4 };
assert.equal(score({ rec: 4, bonus_rec_te: 4, rec_yd: 50, pts_ppr: 99 }, scoring), 9); // TE premium, unknown keys ignored

const clock = gameClock({ events: [
  { status: { period: 1, displayClock: "15:00", type: { state: "pre" } }, competitions: [{ competitors: [{ team: { abbreviation: "BUF" } }, { team: { abbreviation: "WSH" } }] }] },
  { status: { period: 3, displayClock: "15:00", type: { state: "in" } }, competitions: [{ competitors: [{ team: { abbreviation: "KC" } }, { team: { abbreviation: "DEN" } }] }] },
  { status: { period: 4, displayClock: "0:00", type: { state: "post" } }, competitions: [{ competitors: [{ team: { abbreviation: "GB" } }, { team: { abbreviation: "ATL" } }] }] },
] });
assert.equal(clock.get("WAS"), 1); // ESPN's WSH is Sleeper's WAS
assert.equal(clock.get("KC"), 0.5);
assert.equal(clock.get("GB"), 0);

const player = (id, team, pts) => ({ player_id: id, stats: { rec: pts * 2 }, player: { first_name: id, last_name: "X", position: "WR", team, injury_status: null } });
const projections = [player("a1", "GB", 10), player("a2", "KC", 10), player("a3", "GB", 10), player("b1", "BUF", 10), player("b2", "SEA", 10)]; // SEA is on bye
const roster = (id, wins, losses, fpts) => ({ roster_id: id, owner_id: String(id), players: [], settings: { wins, losses, ties: 0, fpts } });
const rosters = [roster(1, 0, 1, 100), roster(2, 1, 0, 90)];
const matchups = [
  { roster_id: 1, matchup_id: 1, points: 33, starters: ["a1", "a2", "a3", "0"], players_points: { a1: 22, a2: 8, a3: 3 } },
  { roster_id: 2, matchup_id: 1, points: 0, starters: ["b1", "b2"], players_points: {} },
];
const input = { rosters, matchups, projections, scoring: { rec: 0.5 }, clock, top100: new Set(["a1", "a3"]) };
const rows = liveStandings({ ...input, countWeek: true });
const one = rows.find(r => r.rosterId === 1), two = rows.find(r => r.rosterId === 2);
assert.equal(one.week.projected, 22 + 8 + 5 + 3); // final + half a game left + final bust + nothing for the empty slot
assert.equal(two.week.projected, 10); // bye player adds nothing
assert.equal(one.week.state, "live");
assert.equal(one.week.oppPoints, 0);
assert.ok(one.week.winProb > 0.99 && Math.abs(one.week.winProb + two.week.winProb - 1) < 1e-9);
assert.deepEqual(one.busts, [{ name: "a3 X", points: 3 }]); // finished top-100 starter under 5; a1 scored 22
assert.equal(rows[0].rosterId, 1); // if it ended now: 0–1 + leading = 1–0 + trailing, PF breaks the tie
assert.equal(liveStandings({ ...input, countWeek: false })[0].rosterId, 2); // week already counted: records alone decide

const values = [
  { player: { name: "Star", sleeperId: "s", position: "QB", maybeAge: 24 }, value: 9000, redraftValue: 0, overallRank: 5 }, // out for the season
  { player: { name: "Vet", sleeperId: "v", position: "RB", maybeAge: 30 }, value: 1000, redraftValue: 5000, overallRank: 150 },
  { player: { name: "2027 1st", position: "PICK" }, value: 3000, redraftValue: 0, overallRank: 20 },
  { player: { name: "2028 1st", position: "PICK" }, value: 2000, redraftValue: 0, overallRank: 40 },
];
const league = {
  rosters: [{ ...rosters[0], players: ["s"] }, { ...rosters[1], players: ["v", "nobody"] }],
  values,
  traded: [{ season: "2027", round: 1, roster_id: 1, owner_id: 2 }], // team 1 traded its 2027 1st to team 2
  projections: [{ player_id: "s", stats: {}, player: { first_name: "", last_name: "", position: "QB", team: null, injury_status: "IR" } }],
  season: "2026",
  rounds: 1,
  played: 1,
  weeks: 14,
};
const dyn = dynastyRankings({ ...league, cuts: {} });
const t1 = dyn.find(d => d.rosterId === 1), t2 = dyn.find(d => d.rosterId === 2);
assert.deepEqual([t1.players, t1.picks, t2.players, t2.picks], [9000, 2000, 1000, 8000]);
assert.equal(t1.record, "0–1");
assert.ok(Math.abs(t2.projectedWins - (1 + 13 / (1 + Math.exp(-0.5)))) < 1e-9); // 1–0 plus 13 games at ~62%
assert.equal(dyn[0].rosterId, 2); // more long-run value loses to a far better season (and record)
assert.ok(Math.abs(t2.score - (50 + 50 * 9000 / 11000)) < 1e-9);
assert.deepEqual(t1.hurt, [{ name: "Star", status: "IR", rank: 5 }]);
assert.equal(t2.age, 30);
assert.equal(dynastyRankings({ ...league, cuts: { s: 0.5 } }).find(d => d.rosterId === 1).total, 6500); // injury cut

// Scout's notes: four teams, two weeks. Team 1 wins both (one squeaker); team 4 scores big but loses twice.
const final = (matchup, winner, loser, winnerPoints, loserPoints) => ({ matchup, winner, loser, winnerPoints, loserPoints });
const snap = (week, finals, mvp) => ({ week, season: "2026", capturedAt: "", teams: {}, finals, standings: [{ rosterId: 1 }], dynasty: null, recap: null, mvp });
const weeks = [
  snap(1, [final(1, 1, 2, 120, 118), final(2, 3, 4, 150, 140)], { 1: { name: "Ace", points: 30 } }),
  snap(2, [final(1, 1, 3, 130, 125), final(2, 2, 4, 160, 145)], { 1: { name: "Ace", points: 35 } }),
];
const row = (rosterId, total, picks, age) => ({ rosterId, total, picks, age, players: total - picks, score: 0, record: "", projectedWins: 0, top: [], hurt: [] });
const dynasty = [row(1, 900, 100, 24), row(2, 800, 300, 27), row(3, 700, 200, 25), row(4, 600, 150, 26)];
const said = [...noteCandidates({ weeks, dynasty, first: { 1: "Jag" } })].flatMap(([id, cs]) => cs.map(c => `${id}:${c.text}`));
assert.ok(said.includes("1:Won 2 straight."));
assert.ok(said.includes("1:Ace has been the top scorer every week, 65.00 total."));
assert.ok(said.includes("1:Averaging 125.0 a week, worst in the league."));
assert.ok(said.includes("4:Lost 2 straight."));
assert.ok(said.includes("4:4–2 against the whole league, 0–2 in real life. Unlucky.")); // 140 and 145 beat most of the league
assert.ok(!said.some(s => s.startsWith("1:") && s.includes("Unlucky")));
for (let s = 0; s < 60; s++) {
  const notes = scoutNotes({ weeks, dynasty, first: {}, seed: s / 60 });
  assert.equal(notes.size, 4);
  const kinds = [...notes.values()].map(n => n.kind);
  assert.ok(kinds.every(k => kinds.filter(x => x === k).length <= 2)); // variety
}
assert.deepEqual(scoutNotes({ weeks, dynasty, first: {}, seed: 0.42 }), scoutNotes({ weeks, dynasty, first: {}, seed: 0.42 })); // same seed, same notes
// Blurb parser: the real formats from the Week 1 and Week 2 blurbs.
assert.deepEqual(splitHook("CODY’S BALL KNOWLEDGE ISN’T ENOUGH. 151.04 points, and more"), { hook: "CODY’S BALL KNOWLEDGE ISN’T ENOUGH.", body: "151.04 points, and more" });
assert.deepEqual(splitHook("YALL REALLY LET THE COMMISH GET KENNETH WALKER 😼😭 I went into MNF"), { hook: "YALL REALLY LET THE COMMISH GET KENNETH WALKER 😼😭", body: "I went into MNF" });
assert.deepEqual(splitHook("THE COMMISH HAS FALLEN ALREADY. 🙌🏽 Jit puts up"), { hook: "THE COMMISH HAS FALLEN ALREADY. 🙌🏽", body: "Jit puts up" });
const blurbTeams = [{ id: 1, names: ["Jag", "Commish"] }, { id: 2, names: ["Andrew"] }, { id: 3, names: ["Adi", "Aditya"] }, { id: 4, names: ["Jit"] }];
const blurbFinals = [{ matchup: 1, winner: 4, loser: 1 }, { matchup: 2, winner: 2, loser: 3 }];
const parsed = parseBlurb("🚨 WEEK 2 RECAP 🚨\n\nANDREW ESCAPES 😭 Aditya stays winless.\n\nTHE COMMISH HAS FALLEN. 🙌🏽 Jit beat Jag.\nmeme: Jag - Oof\ncover: meme", blurbTeams, blurbFinals);
assert.equal(parsed.headline, "🚨 WEEK 2 RECAP 🚨");
assert.deepEqual(parsed.games.map(g => [g.matchup, g.hook, g.body]), [[2, "ANDREW ESCAPES 😭", "Aditya stays winless."], [1, "THE COMMISH HAS FALLEN. 🙌🏽", "Jit beat Jag."]]);
assert.deepEqual([parsed.meme, parsed.cover, parsed.problems], [{ rosterId: 1, caption: "Oof" }, true, []]);
assert.ok(parseBlurb("SOMETHING HAPPENED 💀 but no names.", blurbTeams, blurbFinals).problems.length); // nothing to place: refuse

// Coach phone links: nine public numbers, commissioner excluded, Aditya shares Adi's line.
const expected = {
  Cody: "tel:+15127058862", Kartik: "tel:+15129447692", Mateo: "tel:+12817017994", Adi: "tel:+13172940319",
  Pranav: "tel:+19494443827", Jit: "tel:+15128797920", Jorge: "tel:+14692332661", Andrew: "tel:+19792481448", Arjun: "tel:+15129640714",
};
assert.equal(phones.Aditya, phones.Adi);
assert.equal(Object.keys(phones).filter(n => n !== "Aditya").length, 9);
for (const [id, name] of Object.entries(firstNames)) {
  assert.equal(coachTel(Number(id)), name === "Jag" ? undefined : expected[name], name);
}
assert.equal(coachTel(1), undefined);
console.log("models ok");
