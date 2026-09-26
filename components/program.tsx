import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Ink } from "@/components/ink";
import type { DynastyRow } from "@/lib/dynasty";
import type { Note } from "@/lib/insights";
import type { LiveRow } from "@/lib/live";
import { coachSms, firstNames } from "@/lib/managers";
import { LEAGUE_ID } from "@/lib/sleeper";
import type { Snapshot } from "@/lib/weeks";

export const PLAYOFF_TEAMS = 6; // Sleeper settings.playoff_teams

type Names = Record<string, { name: string }>;
type Href = (rosterId: number) => string | undefined;

const pts = (n: number) => n.toFixed(2);
const thousands = (n: number) => `${(n / 1000).toFixed(1)}k`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

export function Cover({ items, meme, children }: { items: ReactNode[]; meme?: boolean; children: ReactNode }) {
  return <header className="cover">
    <p className="topline">{items.map((t, i) => <span key={i}>{i > 0 && <i aria-hidden="true">★</i>}{t}</span>)}</p>
    {meme
      ? <div className="vignette meme" role="img" aria-label="Reaction photo: a man in a blazer doubled over, laughing and wincing"><span /></div>
      : <div className="vignette" role="img" aria-label="Engraved bust of a football player in a leather helmet, holding a ball"><span /></div>}
    <h1>Sunk Pick Fallacy</h1>
    <div className="orn" aria-hidden="true" />
    <div className="issue">{children}</div>
  </header>;
}

export function Name({ id, names, href }: { id: number; names: Names; href?: Href }) {
  const first = firstNames[id];
  const to = href?.(id);
  const sms = coachSms(id);
  const team = names[id]?.name ?? "Unclaimed";
  return <span className="name">
    {to ? <a href={to}><b>{team}</b></a> : <b>{team}</b>}
    {first && <small>{sms
      ? <a href={sms} aria-label={`text Coach ${first}`}>Coach {first}</a>
      : <>Coach {first}</>}</small>}
  </span>;
}

function Move({ by }: { by?: number }) {
  if (by === undefined) return <span className="move" />;
  const label = by > 0 ? `Up ${by} since last week` : by < 0 ? `Down ${-by} since last week` : "Same spot as last week";
  return <span className="move" data-dir={by > 0 ? "up" : by < 0 ? "down" : "same"} title={label}>
    <span aria-hidden="true">{by > 0 ? `▲ ${by}` : by < 0 ? `▼ ${-by}` : "—"}</span>
    <span className="sr-only">{label}</span>
  </span>;
}

const moved = (before: Map<number, number> | undefined, id: number, now: number) => (before?.has(id) ? before.get(id)! - now : undefined);

// The reaction photo, shrunk to a stamp: pinned next to top-100 players who bust or land on IR.
function Stamp({ title = "Reaction photo" }: { title?: string }) {
  return <span className="stamp" aria-hidden="true" title={title} />;
}

export function LiveStandings({ rows, names, before, href }: { rows: LiveRow[]; names: Names; before: Map<number, number>; href: Href }) {
  return <ol className="live">{rows.map((r, i) => {
    const w = r.week;
    const opp = w?.opponent ? names[w.opponent]?.name : null;
    return <li key={r.rosterId} className={i + 1 === PLAYOFF_TEAMS ? "cut" : undefined}>
      <span className="n">{i + 1}</span>
      <Move by={moved(before, r.rosterId, i + 1)} />
      <Name id={r.rosterId} names={names} href={href} />
      <p className="rec"><b>{r.wins}–{r.losses}{r.ties ? `–${r.ties}` : ""}</b>{pts(r.pf)} pts</p>
      {w && <p className="wk" data-state={w.state}>{
        w.state === "final" ? <>{w.winProb > 0.5 ? "Won" : w.winProb < 0.5 ? "Lost" : "Tied"} {pts(w.points)}–{pts(w.oppPoints)} vs {opp}</>
        : w.state === "live" ? <>{pts(w.points)} · proj {w.projected.toFixed(1)} vs {opp} · <b>{pct(w.winProb)}</b></>
        : <>vs {opp ?? "bye"} · proj {w.projected.toFixed(1)} · <b>{pct(w.winProb)}</b> to win</>
      }</p>}
      {r.busts.length > 0 && <p className="bust">{r.busts.map(b => <span key={b.name}><Stamp />{b.name} {pts(b.points)}</span>)}</p>}
    </li>;
  })}</ol>;
}

export function StandingsTable({ snap, href }: { snap: Snapshot; href?: Href }) {
  return <table className="table">
    <caption className="sr-only">Standings after week {snap.week}</caption>
    <thead><tr><th scope="col">Pos.</th><th scope="col">Club</th><th scope="col">W</th><th scope="col">L</th><th scope="col">For</th><th scope="col">Agst.</th></tr></thead>
    <tbody>{snap.standings.flatMap((s, i) => [
      <tr key={s.rosterId}><td>{i + 1}</td><td><Name id={s.rosterId} names={snap.teams} href={href} /></td><td>{s.wins}</td><td>{s.losses}</td><td>{pts(s.pf)}</td><td>{pts(s.pa)}</td></tr>,
      ...(i + 1 === PLAYOFF_TEAMS ? [<tr key="line" className="line" aria-hidden="true"><td colSpan={6}>★ Playoff line ★</td></tr>] : []),
    ])}</tbody>
  </table>;
}

export function DynastyList({ rows, names, before, href, notes }: { rows: DynastyRow[]; names: Names; before?: Map<number, number>; href?: Href; notes?: Map<number, Note> }) {
  return <ol className="dynasty">{rows.map((d, i) => {
    const hurt = d.hurt.find(h => h.status === "IR" && h.rank <= 100);
    return <li key={d.rosterId}>
    <span className="n">{i + 1}</span>
    <div>
      <div className="head"><span className="who"><Name id={d.rosterId} names={names} href={href} />{hurt && <Stamp title={`${hurt.name} is on IR`} />}</span><Move by={moved(before, d.rosterId, i + 1)} /></div>
      <p className="val"><b>{Math.round(d.score)}</b>power · {d.record} · on pace for {d.projectedWins.toFixed(1)} wins</p>
      <p className="val">Value {thousands(d.total)} · picks {thousands(d.picks)}{d.age ? ` · average age ${d.age.toFixed(1)}` : ""}</p>
      <p className="assets">{d.top.map(t => t.name).join(" · ")}</p>
      {notes?.get(d.rosterId) && <p className="scout">{notes.get(d.rosterId)!.text}</p>}
    </div>
  </li>;
  })}</ol>;
}

function Press({ caption }: { caption: string }) {
  return <figure className="press">
    {/* eslint-disable-next-line @next/next/no-img-element -- 20KB static duotone; next/image adds nothing here */}
    <img src="/assets/meme-reaction.webp" alt="A man in a blazer doubled over, laughing and wincing" width={440} height={322} loading="lazy" />
    <figcaption>{caption}<span>Photo: the group chat</span></figcaption>
  </figure>;
}

export function Recap({ snap }: { snap: Snapshot }) {
  const { recap } = snap;
  if (!recap) return null;
  const game = (m: number) => snap.finals.find(f => f.matchup === m)!;
  const memeOn = (m: number) => !!recap.meme && [game(m).winner, game(m).loser].includes(recap.meme.rosterId);
  return <section className="notes" aria-labelledby={`recap-${snap.week}`}>
    <h2 className="shead" id={`recap-${snap.week}`}>Week {snap.week} recap</h2>
    <p className="sub"><Ink text={recap.headline} /></p>
    {recap.featured.map(f => {
      const g = game(f.matchup);
      return <article key={f.matchup} id={`game-${f.matchup}`} className="card">
        <div className="box">
          <div><Name id={g.winner} names={snap.teams} /><strong>{pts(g.winnerPoints)}</strong></div>
          <span>Final</span>
          <div className="l"><Name id={g.loser} names={snap.teams} /><strong>{pts(g.loserPoints)}</strong></div>
        </div>
        {f.hook && <h3><Ink text={f.hook} /></h3>}
        {f.body && <p className="body"><Ink text={f.body} /></p>}
        <ul className="receipts" aria-label="Receipts">{f.receipts.map(r => <li key={r.label}><span>{r.label}</span><i /><b>{r.value}</b></li>)}</ul>
        {memeOn(f.matchup) && <Press caption={recap.meme!.caption} />}
      </article>;
    })}
    {recap.meme && !recap.featured.some(f => memeOn(f.matchup)) && <Press caption={recap.meme.caption} />}
  </section>;
}

export function Finals({ snap }: { snap: Snapshot }) {
  return <section aria-labelledby={`finals-${snap.week}`}>
    <h2 className="shead small" id={`finals-${snap.week}`}>Week {snap.week} final scores</h2>
    <ol className="finals">{snap.finals.map(f => <li key={f.matchup} id={`final-${f.matchup}`}>
      <span>{snap.teams[f.winner].name} <b>{pts(f.winnerPoints)}</b></span>
      <span className="l">{snap.teams[f.loser].name} <b>{pts(f.loserPoints)}</b></span>
    </li>)}</ol>
  </section>;
}

export function BackIssues({ weeks, current }: { weeks: Snapshot[]; current?: number }) {
  return <nav className="issues" aria-labelledby="issues">
    <h2 className="shead small" id="issues">Back issues</h2>
    <ol>{[...weeks].reverse().map(w => <li key={w.week}>
      <Link href={`/week/${w.week}`} aria-current={w.week === current ? "page" : undefined}>
        <b>Week {w.week}</b><span>{w.recap ? <Ink text={w.recap.headline} /> : "Final scores and standings"}</span>
      </Link>
    </li>)}</ol>
  </nav>;
}

export function Footer({ children }: { children: ReactNode }) {
  return <footer className="foot">
    <div className="orn" aria-hidden="true" />
    <p>{children}</p>
    <p><a href={`https://sleeper.com/leagues/${LEAGUE_ID}`} target="_blank" rel="noreferrer">League on Sleeper <ArrowUpRight size={14} aria-hidden="true" /></a></p>
  </footer>;
}
