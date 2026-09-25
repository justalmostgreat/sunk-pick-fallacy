// Turns a pasted group-chat blurb into the week's recap: a headline, then one story per game.
// It expects what the blurbs already look like:
//
//   WEEK 3 RECAP 🚨                                  ← opening line (optional) becomes the headline
//
//   ALL-CAPS HOOK 💀 Then the story in normal case…  ← one paragraph per game, matched by the names in it
//
// Optional lines anywhere:  "meme: Jag - caption" puts the reaction photo on that game,
//                           "cover: meme" puts it on this week's cover.

export type Parsed = {
  headline: string | null;
  games: { matchup: number; hook: string; body: string }[];
  meme: { rosterId: number; caption: string } | null;
  cover: boolean;
  problems: string[];
};

type Team = { id: number; names: string[] }; // every name a blurb might use for this roster
type Final = { matchup: number; winner: number; loser: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, names: string[]) =>
  names.reduce((n, name) => n + (text.match(new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, "giu"))?.length ?? 0), 0);

// The hook is the ALL-CAPS opening, up to its last ".", "!", "?" or emoji before the first lowercase word.
export function splitHook(paragraph: string) {
  let end = 0, cut = 0;
  for (const token of paragraph.split(/(\s+)/)) {
    if (/\p{Ll}/u.test(token)) break;
    end += token.length;
    if (/(?:[.!?…]|\p{Extended_Pictographic}️?[\u{1F3FB}-\u{1F3FF}]?)$/u.test(token)) cut = end;
  }
  const at = cut || end;
  return { hook: paragraph.slice(0, at).trim(), body: paragraph.slice(at).trim() };
}

export function parseBlurb(text: string, teams: Team[], finals: Final[]): Parsed {
  const problems: string[] = [];
  let meme: Parsed["meme"] = null;
  let cover = false;
  const lines = text.replace(/\r/g, "").split("\n").filter(line => {
    const m = line.match(/^\s*meme:\s*(.+)$/i);
    if (m) {
      const [who, ...caption] = m[1].split(/\s+[-–—:]\s+/);
      const team = teams.find(t => mentions(who, t.names));
      if (team) meme = { rosterId: team.id, caption: caption.join(" - ").trim() || "Reaction photo." };
      else problems.push(`“meme:” names nobody in the league: ${who.trim()}`);
      return false;
    }
    if (/^\s*cover:\s*meme\s*$/i.test(line)) return !(cover = true);
    return true;
  });

  let paragraphs = lines.join("\n").split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  if (paragraphs.length <= 2) paragraphs = lines.map(l => l.trim()).filter(Boolean); // pasted without blank lines between games

  let headline: string | null = null;
  const games: Parsed["games"] = [];
  const used = new Set<number>();
  paragraphs.forEach((p, i) => {
    const best = finals
      .filter(f => !used.has(f.matchup))
      .map(f => ({ f, n: teams.filter(t => t.id === f.winner || t.id === f.loser).reduce((n, t) => n + mentions(p, t.names), 0) }))
      .sort((a, b) => b.n - a.n)[0];
    if (best?.n) {
      used.add(best.f.matchup);
      games.push({ matchup: best.f.matchup, ...splitHook(p) });
    } else if (i === 0) headline = p;
    else problems.push(`Couldn’t tell which game this is about; name a coach or team in it: “${p.slice(0, 70)}…”`);
  });
  if (!games.length) problems.push("No games found. Give each game its own paragraph, starting with an ALL-CAPS hook.");
  return { headline, games, meme, cover, problems };
}
