import { BackIssues, Cover, DynastyList, Finals, Footer, LiveStandings, Recap, StandingsTable } from "@/components/program";
import { LiveRefresh } from "@/components/live-refresh";
import { Price } from "@/components/price";
import { scoutNotes } from "@/lib/insights";
import { firstNames } from "@/lib/managers";
import { dynastyRankings } from "@/lib/dynasty";
import { gameClock, liveStandings } from "@/lib/live";
import { feeds, teamName } from "@/lib/sleeper";
import { weeks } from "@/lib/weeks";

export const dynamic = "force-dynamic";

const rankOf = (ids: number[]) => new Map(ids.map((id, i) => [id, i + 1]));
const stamp = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(d);

async function loadLive() {
  const state = await feeds.state();
  const [league, rosters, users, matchups, projections] = await Promise.all([
    feeds.league(), feeds.rosters(), feeds.users(), feeds.matchups(state.week), feeds.projections(state.season, state.week),
  ]);
  // The clock and the values are nice-to-haves: the page still works without them.
  const [espn, values, traded] = await Promise.all([feeds.scoreboard().catch(() => null), feeds.values().catch(() => null), feeds.tradedPicks().catch(() => [])]);
  const clock = espn?.week?.number === state.week ? gameClock(espn) : new Map<string, number>();
  const top100 = new Set((values ?? []).filter(v => v.overallRank <= 100).flatMap(v => (v.player.sleeperId ? [v.player.sleeperId] : [])));
  const owner = new Map(users.map(u => [u.user_id, u]));
  return {
    week: state.week,
    names: Object.fromEntries(rosters.map(r => [r.roster_id, { name: teamName(owner.get(r.owner_id)) }])),
    rows: liveStandings({ rosters, matchups, projections, scoring: league.scoring_settings, clock, countWeek: league.settings.last_scored_leg < state.week, top100 }),
    dynasty: values && dynastyRankings({ rosters, values, traded, projections, season: league.season, rounds: league.settings.draft_rounds, played: league.settings.last_scored_leg, weeks: league.settings.playoff_week_start - 1 }),
    gamesLive: espn?.events.filter(e => e.status.type.state === "in").length ?? 0,
  };
}

export default async function Home() {
  const last = weeks[weeks.length - 1];
  const recap = [...weeks].reverse().find(w => w.recap?.featured.length);
  const live = await loadLive().catch(() => null);
  const names = live?.names ?? last.teams;
  const dynasty = live?.dynasty ?? last.dynasty;
  // eslint-disable-next-line react-hooks/purity -- a server render runs once per request; a fresh price and fresh notes per request is the point
  const seed = Math.random();

  // Team names jump to their featured story from last week, otherwise to their line in last week's finals.
  const href = (id: number) => {
    const f = last.finals.find(g => g.winner === id || g.loser === id);
    if (!f) return undefined;
    return recap === last && last.recap?.featured.some(x => x.matchup === f.matchup) ? `#game-${f.matchup}` : `#final-${f.matchup}`;
  };

  return <div className="program">
    <LiveRefresh seconds={live?.gamesLive ? 120 : 1800} />
    <Cover items={["Official program", `Week ${live?.week ?? last.week + 1}`, <Price key="price" seed={seed} />]} meme={recap?.recap?.cover === "meme" ? recap.recap.meme : null}>
      <b>{live?.gamesLive ? "Games in progress" : "The league, as of now"}</b>
      <span>{live ? `${live.gamesLive ? `${live.gamesLive} ${live.gamesLive > 1 ? "games" : "game"} live · ` : ""}Updated ${stamp(new Date())}` : `Sleeper isn’t answering — showing the Week ${last.week} final table`}</span>
    </Cover>

    <main>
      <section aria-labelledby="standings">
        <h2 className="shead" id="standings">Live standings</h2>
        <p className="sub">{live ? `Record so far, plus Week ${live.week} as if it ended right now · moves are since last week` : `After Week ${last.week}`}</p>
        {live
          ? <LiveStandings rows={live.rows} names={names} before={rankOf(last.standings.map(s => s.rosterId))} href={href} />
          : <StandingsTable snap={last} href={href} />}
      </section>

      {dynasty && <section aria-labelledby="dynasty">
        <h2 className="shead" id="dynasty">Dynasty power rankings</h2>
        <p className="sub">Which teams are set up as a true dynasty{live?.dynasty ? "" : ` · as of Week ${last.week}`}</p>
        <DynastyList rows={dynasty} names={names} before={last.dynasty ? rankOf(last.dynasty.map(d => d.rosterId)) : undefined} href={href}
          notes={scoutNotes({ weeks, dynasty, first: firstNames, live: live?.rows, seed })} />
      </section>}

      {recap && <Recap snap={recap} />}

      <div className="around">
        <Finals snap={last} />
        <BackIssues weeks={weeks} />
      </div>
    </main>

    <Footer>Live scores, projections and injuries from Sleeper · game clocks from ESPN · dynasty values from FantasyCalc (superflex, 10 teams, half-PPR) · half-PPR, TEs +0.5 per catch, 4-point passing TDs · odds are a projection, not a promise</Footer>
  </div>;
}
