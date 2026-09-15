import league from '@/lib/league.json';
import copy from '@/lib/recap-copy.json';
import LeagueEdition from '@/components/league-edition';

export default function Home() {
  return <main className="edition mx-auto max-w-[1400px] px-5 md:px-12">
    <a href="#matchups" className="skip-link">Skip to matchups</a>
    <header className="masthead flex items-center justify-between gap-6 py-6 md:py-8">
      <a className="wordmark" href="#">SPF<span>SUNK PICK<br/>FALLACY</span></a>
      <nav className="flex items-center gap-5"><a href="#matchups">MATCHUPS</a><a href="#teams" className="hidden sm:inline">THE TEAMS</a><span className="hidden md:inline">VOL. 01 / 15 SEP 2026</span></nav>
    </header>
    <section className="cover grid items-center gap-4 md:grid-cols-[1.2fr_1fr]">
      <div className="cover-copy py-9 md:py-14"><p className="eyebrow">THE COMMISSIONER’S WEEKLY / WEEK 01</p><h1>THE DRAFT<br/>IS OVER.<br/><em>THE BULLSHIT<br/>ISN’T.</em></h1><p className="intro">Ten managers. Five matchups. One very expensive lesson in being full of shit.</p><a className="read-link" href="#matchups">READ THE DAMAGE REPORT <span>↓</span></a></div>
      <figure className="cover-art"><img src="/assets/football-engraving.png" alt="An antique ivory engraving of a football player in a leather helmet, holding a football" width="1122" height="1402" fetchPriority="high"/><figcaption>EST. 2026 / NO REFUNDS ON DRAFT TAKES</figcaption></figure>
    </section>
    <section className="numbers grid grid-cols-1 border-y md:grid-cols-3"><div><strong>10.38</strong><span>CLOSEST ESCAPE</span></div><div><strong>71.32</strong><span>BIGGEST ASS-KICKING</span></div><div><strong>0.66</strong><span>SEPARATED THE TOP TWO SCORES</span></div></section>
    <LeagueEdition copy={copy} />
    <footer className="flex flex-wrap justify-between gap-4 border-t py-8"><span>SUNK PICK FALLACY / THE WEEKLY</span><a href={league.source} target="_blank" rel="noreferrer">LEAGUE SCOREBOARD ↗</a></footer>
  </main>
}
