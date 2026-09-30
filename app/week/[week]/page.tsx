import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackIssues, Cover, DynastyList, Finals, Footer, Recap, StandingsTable } from "@/components/program";
import { Price } from "@/components/price";
import { scoutNotes } from "@/lib/insights";
import { firstNames } from "@/lib/managers";
import { weeks } from "@/lib/weeks";

type Props = { params: Promise<{ week: string }> };

const find = async ({ params }: Props) => {
  const { week } = await params;
  return weeks.find(w => String(w.week) === week);
};
const day = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(iso));

export function generateStaticParams() {
  return weeks.map(w => ({ week: String(w.week) }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const snap = await find(props);
  return { title: snap ? `Week ${snap.week} — Sunk Pick Fallacy` : "Sunk Pick Fallacy" };
}

// A frozen back issue: standings, blurb and finals exactly as they stood after that week.
export default async function WeekPage(props: Props) {
  const snap = await find(props);
  if (!snap) notFound();
  const href = (id: number) => {
    const f = snap.finals.find(g => g.winner === id || g.loser === id);
    return f && `#${snap.recap?.featured.some(x => x.matchup === f.matchup) ? "game" : "final"}-${f.matchup}`;
  };

  return <div className="program">
    <Cover items={["Official program", `Week ${snap.week} final`, <Price key="price" seed={(snap.week * 0.618) % 1} />]} meme={snap.recap?.cover === "meme" ? snap.recap.meme : null}>
      <b>Back issue</b>
      <span>As it stood {day(snap.capturedAt)} · <Link href="/">Back to live standings</Link></span>
    </Cover>

    <main>
      <section aria-labelledby="standings">
        <h2 className="shead" id="standings">Standings after Week {snap.week}</h2>
        <p className="sub">Wins, then points · top 6 make the playoffs</p>
        <StandingsTable snap={snap} href={href} />
      </section>

      {snap.dynasty && <section aria-labelledby="dynasty">
        <h2 className="shead" id="dynasty">Dynasty power rankings</h2>
        <p className="sub">Which teams are set up as a true dynasty · as of {day(snap.capturedAt)}</p>
        <DynastyList rows={snap.dynasty} names={snap.teams} href={href}
          notes={scoutNotes({ weeks: weeks.filter(w => w.week <= snap.week), dynasty: snap.dynasty, first: firstNames, seed: (snap.week * 0.618) % 1 })} />
      </section>}

      <Recap snap={snap} />

      <div className="around">
        <Finals snap={snap} />
        <BackIssues weeks={weeks} current={snap.week} />
      </div>
    </main>

    <Footer>Scores and standings from Sleeper · dynasty values from FantasyCalc · half-PPR, TEs +0.5 per catch, 4-point passing TDs</Footer>
  </div>;
}
