"use client";

import { useEffect, useRef, useState } from "react";
import league from "@/lib/league.json";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type Team = (typeof league.teams)[number];
type Voice = "roast" | "booth" | "court";
export type EditionCopy = {
  opening: string;
  closing: string;
  matchups: { id: number; headline: string; roast: string; booth: string; court: string; facts: { label: string; value: string; detail: string }[]; talkingPoints: string[] }[];
  awards: { label: string; teamId: number; value: string; text: string }[];
  readyToSend: string;
};
const voices: { id: Voice; label: string; description: string }[] = [
  { id: "roast", label: "Chat roast", description: "Group-chat heat" },
  { id: "booth", label: "Booth call", description: "Mock broadcast" },
  { id: "court", label: "Draft court", description: "The draft-day receipts" },
];
const money = (n: number) => n.toFixed(2);

function TeamName({ team, onOpen, className = "" }: { team: Team; onOpen: (team: Team, target: HTMLButtonElement) => void; className?: string }) {
  return <Button variant="ghost" className={`team-link ${className}`} onClick={e => onOpen(team, e.currentTarget)} aria-label={`Open ${team.name} team breakdown`}>{team.name}<span aria-hidden="true">↗</span></Button>;
}

export default function LeagueEdition({ copy }: { copy: EditionCopy }) {
  const [chosen, setChosen] = useState<Record<number, Voice>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const teams = new Map(league.teams.map(t => [t.id, t]));
  const selectedTeam = selected === null ? null : teams.get(selected);

  function storyText(id: number, voice: Voice) {
    const story = copy.matchups.find(s => s.id === id)!;
    const match = league.matchups.find(m => m.id === id)!;
    const winner = teams.get(match.winnerId)!;
    const loser = teams.get(match.loserId)!;
    return `${story.headline}\n${winner.name} ${money(winner.score)} — ${loser.name} ${money(loser.score)}\n\n${story[voice]}`;
  }

  async function copyText(text: string, id: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setFallback(null);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2200);
    } catch {
      setFallback(text);
    }
  }

  function openTeam(team: Team, target: HTMLButtonElement) {
    returnFocus.current = target;
    setSelected(team.id);
  }

  function copyEdition() {
    const text = ["SUNK PICK FALLACY — WEEK 1", copy.opening, ...league.matchups.map(m => storyText(m.id, chosen[m.id] || "roast")), "THIS WEEK’S HONORS", ...copy.awards.map(a => `${a.label}: ${teams.get(a.teamId)?.name ?? "The league"} — ${a.value}. ${a.text}`), copy.closing].join("\n\n");
    void copyText(text, "edition");
  }

  return <>
    <section aria-label="Week 1 final scores" className="score-wire grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      {league.matchups.map(m => { const w = teams.get(m.winnerId)!; const l = teams.get(m.loserId)!; return <a href={`#game-${m.id}`} key={m.id} className="wire-game px-4 py-5">
        <span className="wire-label">FINAL / 0{m.id}</span>
        <span className="wire-team"><span>{w.name}</span><b>{money(w.score)}</b></span>
        <span className="wire-team wire-loser"><span>{l.name}</span><b>{money(l.score)}</b></span>
        <span className="wire-margin">+{money(m.margin)} <span aria-hidden="true">↘</span></span>
      </a>})}
    </section>

    <section id="matchups" className="py-14 md:py-20">
      <div className="section-label"><span>01 / THE DAMAGE REPORT</span><span>ALL FIVE. NO HIDING.</span></div>
      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div><h2>Everybody had a plan.</h2><p className="section-intro mb-0!">Three ways to tell every story. Pick your version, then copy the whole edition.</p></div>
        <div className="edition-actions flex flex-wrap gap-3 md:justify-end">
          <Button className="ink-button" onClick={copyEdition}>{copied === "edition" ? "COPIED TO CLIPBOARD" : "COPY MY EDITION"} <span aria-hidden="true">↗</span></Button>
          <a className="outline-button" href="/commissioner-writing-pack.md" download>ALL 15 WRITE-UPS ↓</a>
        </div>
      </div>
      <div className="commissioner-note mt-10 grid gap-5 border-y py-7 md:grid-cols-[180px_1fr]"><span className="eyebrow">FROM THE COMMISH</span><p>{copy.opening}</p></div>
      <p role="status" aria-live="polite" className="sr-only">{copied ? "Text copied to clipboard." : ""}</p>
      {fallback && <div className="my-6 border p-5" role="alert"><p className="mb-3">Your browser couldn’t copy this. Select the text below, or download the writing pack.</p><pre className="manual-copy whitespace-pre-wrap select-text" tabIndex={0}>{fallback}</pre><Button variant="outline" className="outline-button mt-4" onClick={() => setFallback(null)}>CLOSE</Button></div>}

      {league.matchups.map(m => {
        const story = copy.matchups.find(s => s.id === m.id)!;
        const w = teams.get(m.winnerId)!; const l = teams.get(m.loserId)!;
        const voice = chosen[m.id] || "roast";
        return <article id={`game-${m.id}`} key={m.id} className="game-story grid gap-7 border-b py-10 md:grid-cols-[180px_minmax(0,1fr)] md:gap-9 md:py-14">
          <aside className="game-meta flex flex-wrap items-center gap-x-6 gap-y-2 md:block"><span className="game-number">0{m.id}</span><p className="eyebrow md:mt-7">FINAL MARGIN</p><strong className="margin-number">{money(m.margin)}</strong><p className="muted-label">POINTS</p></aside>
          <div className="min-w-0">
            <div className="story-scores grid gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <div><span className="result-label">WINNER / 1–0</span><TeamName team={w} onOpen={openTeam}/><strong>{money(w.score)}</strong></div>
              <span className="versus hidden sm:block">VS.</span>
              <div className="loser-score"><span className="result-label">LOSER / 0–1</span><TeamName team={l} onOpen={openTeam}/><strong>{money(l.score)}</strong></div>
            </div>
            <h3 className="story-headline mt-8">{story.headline}</h3>
            <Tabs value={voice} onValueChange={v => setChosen(prev => ({...prev, [m.id]:v as Voice}))} className="tone-tabs mt-7">
              <TabsList aria-label={`Writing options for ${w.name} versus ${l.name}`} className="w-full justify-start border-b border-border bg-transparent p-0 sm:w-fit">
                {voices.map(v => <TabsTrigger value={v.id} key={v.id} title={v.description} className="rounded-none px-4 py-3 text-sm">{v.label}</TabsTrigger>)}
              </TabsList>
              {voices.map(v => <TabsContent value={v.id} key={v.id} className="pt-5"><p className="story-body">{story[v.id]}</p></TabsContent>)}
            </Tabs>
            <div className="mt-5 flex items-center justify-between gap-4"><span className="muted-label">{voices.find(v => v.id === voice)?.description}</span><Button variant="ghost" className="text-button" onClick={() => void copyText(storyText(m.id, voice), `game-${m.id}`)}>{copied === `game-${m.id}` ? "COPIED" : "COPY THIS VERSION"} <span aria-hidden="true">↗</span></Button></div>
            <div className="fact-grid mt-8 grid grid-cols-1 border-t sm:grid-cols-2">
              {story.facts.map((f,i) => <div key={i} className="fact-item py-5 sm:pr-7"><span className="muted-label">{f.label}</span><strong>{f.value}</strong><p>{f.detail}</p></div>)}
            </div>
            <details className="talking-points border-t py-4"><summary className="text-button">MORE SHIT TO TALK ABOUT <span aria-hidden="true">+</span></summary><ul className="mt-5 space-y-3 pl-5">{story.talkingPoints.map((point,i)=><li key={i}>{point}</li>)}</ul></details>
          </div>
        </article>;
      })}
    </section>

    <section id="honors" className="pb-14 md:pb-20"><div className="section-label"><span>02 / THE WEEKLY HONORS</span><span>NO ACCEPTANCE SPEECHES.</span></div><h2>Excellence. And whatever that was.</h2>
      <div className="awards mt-10 grid grid-cols-1 border-t md:grid-cols-2">{copy.awards.map((a,i)=>{const t=teams.get(a.teamId);return <article key={i} className="award flex flex-col gap-3 border-b py-7 md:pr-10"><span className="eyebrow">{a.label}</span><strong className="award-value">{a.value}</strong>{t&&<TeamName team={t} onOpen={openTeam}/>}<p>{a.text}</p></article>})}</div>
    </section>

    <section id="teams" className="pb-14 md:pb-20"><div className="section-label"><span>03 / EVERY TEAM, ON THE RECORD</span><span>WEEK 1 SCORE ORDER</span></div><h2>The table doesn’t give a shit.</h2><p className="section-intro">Click a team for its lineup and draft receipts. “Against the field” shows its record if it played all nine teams this week.</p>
      <Table className="standings text-base"><TableHeader><TableRow><TableHead className="w-10">#</TableHead><TableHead>TEAM</TableHead><TableHead className="text-right">POINTS</TableHead><TableHead className="hidden text-right sm:table-cell">RECORD</TableHead><TableHead className="hidden text-right md:table-cell">AGAINST FIELD</TableHead></TableRow></TableHeader><TableBody>{[...league.teams].sort((a,b)=>b.score-a.score).map(t=><TableRow key={t.id}><TableCell className="muted-label">{String(t.rank).padStart(2,"0")}</TableCell><TableCell className="whitespace-normal"><TeamName team={t} onOpen={openTeam}/></TableCell><TableCell className="text-right tabular-nums">{money(t.score)}</TableCell><TableCell className="hidden text-right sm:table-cell">{t.record}</TableCell><TableCell className="hidden text-right md:table-cell">{t.allPlay}</TableCell></TableRow>)}</TableBody></Table>
    </section>

    <section className="closing-note grid gap-6 border-y py-8 md:grid-cols-[180px_1fr]"><span className="eyebrow">UNTIL NEXT TUESDAY</span><p>{copy.closing}</p></section>
    <section className="source-notes py-8"><details><summary className="text-button">THE ACTUAL RECEIPTS <span aria-hidden="true">+</span></summary><div className="mt-5 max-w-3xl space-y-4 text-sm text-muted-foreground"><p>Scores captured September 15, 2026, after Monday Night Football. Half-PPR; tight ends get an extra 0.5 per catch; 4-point passing touchdowns. Stat corrections can still happen.</p><p>Draft receipts are the completed August startup’s actual round/pick and overall selection. Where cited, the August 19 draft benchmark is our saved 10-team superflex blend: 60% TE-premium and 40% non-premium Fantasy Orphans ADP. It is a reference, not a universal price.</p><p>Bench swaps are hindsight comparisons between legal positions. IR and taxi players are not treated as free lineup fixes. One week is a roast, not a dynasty verdict.</p><div className="flex flex-wrap gap-x-6 gap-y-3"><a href={league.source} target="_blank" rel="noreferrer">Sleeper league ↗</a><a href="https://api.sleeper.app/v1/draft/1392799571096109056/picks" target="_blank" rel="noreferrer">Official draft receipts ↗</a><a href="https://api.sleeper.app/v1/league/1392799570517303296/matchups/1" target="_blank" rel="noreferrer">Official Week 1 scores ↗</a></div></div></details></section>

    <Sheet open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
      <SheetContent className="team-sheet w-full gap-0 overflow-y-auto border-l p-6 sm:max-w-[600px] sm:p-9" onCloseAutoFocus={e=>{e.preventDefault();returnFocus.current?.focus();}}>
        {selectedTeam && <>
          <SheetHeader className="px-0 pb-8 pt-5"><p className="eyebrow">TEAM FILE / WEEK 01</p><SheetTitle className="team-sheet-title break-words">{selectedTeam.name}</SheetTitle><SheetDescription>Managed by @{selectedTeam.manager}. {selectedTeam.record}; #{selectedTeam.rank} in Week 1 scoring.</SheetDescription></SheetHeader>
          <div className="sheet-score flex items-end justify-between gap-5 border-y py-6"><strong>{money(selectedTeam.score)}</strong><span className="muted-label">FANTASY POINTS<br/>{selectedTeam.allPlay} AGAINST THE FIELD</span></div>
          <h3 className="sheet-heading mt-9">The first five receipts</h3><p className="text-sm text-muted-foreground">Actual startup selections. Points below are each player’s Week 1 output, whether started or benched.</p>
          <Table className="mt-4 text-sm"><TableHeader><TableRow><TableHead>PICK</TableHead><TableHead>PLAYER</TableHead><TableHead className="text-right">W1</TableHead></TableRow></TableHeader><TableBody>{selectedTeam.draft.slice(0,5).map(p=><TableRow key={p.id}><TableCell className="text-primary">{p.pick}</TableCell><TableCell className="whitespace-normal">{p.name}<span className="block text-xs text-muted-foreground">#{p.overall} OVERALL</span></TableCell><TableCell className="text-right tabular-nums">{p.points === null ? "—" : money(p.points)}</TableCell></TableRow>)}</TableBody></Table>
          <h3 className="sheet-heading mt-9">The starting eleven</h3>
          <Table className="mt-3 text-sm"><TableHeader><TableRow><TableHead>SLOT</TableHead><TableHead>PLAYER</TableHead><TableHead className="text-right">PTS</TableHead></TableRow></TableHeader><TableBody>{selectedTeam.starters.map(p=><TableRow key={p.id}><TableCell className="muted-label">{p.slot}</TableCell><TableCell className="whitespace-normal">{p.name}<span className="block text-xs text-muted-foreground">{p.pos} · {p.nfl}{p.pick?` · DRAFT ${p.pick}`:""}</span></TableCell><TableCell className="text-right tabular-nums">{money(p.points)}</TableCell></TableRow>)}</TableBody></Table>
          <h3 className="sheet-heading mt-9">The bench had opinions</h3><p className="text-sm text-muted-foreground">Sorted by Week 1 points. IR/taxi players are marked separately.</p>
          <Table className="mt-3 text-sm"><TableHeader><TableRow><TableHead>PLAYER</TableHead><TableHead className="text-right">PTS</TableHead></TableRow></TableHeader><TableBody>{selectedTeam.bench.map(p=><TableRow key={p.id}><TableCell className="whitespace-normal">{p.name}<span className="block text-xs text-muted-foreground">{p.pos} · {p.excluded ? "IR / TAXI — EXCLUDED FROM BENCH SWAPS" : "BENCH"}</span></TableCell><TableCell className="text-right tabular-nums">{money(p.points)}</TableCell></TableRow>)}</TableBody></Table>
        </>}
      </SheetContent>
    </Sheet>
  </>;
}
