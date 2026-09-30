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
  meme: { rosterId: number; caption: string; src?: string; alt?: string } | null;
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
  const tail = paragraph.slice(cut, end).trim();
  const at = cut && /^(?:I|A|AN|THE|[\d][\d.,–-]*)$/.test(tail) ? cut : end;
  return { hook: paragraph.slice(0, at).trim(), body: paragraph.slice(at).trim() };
}

export function cleanReply(text: string) {
  const normalized = text.replace(/\r/g, "");
  // Gmail can wrap the sender's address onto another line. Only cut a real reply header.
  const header = /^\s*On [^\n]*(?:\n[^\n]*){0,3}?wrote:\s*$/im;
  const match = normalized.match(header);
  return (match && /<|@/.test(match[0]) ? normalized.slice(0, match.index) : normalized)
    .split("\n").filter(line => !/^\s*>/.test(line)).join("\n").trim();
}

export function parseBlurb(text: string, teams: Team[], finals: Final[]): Parsed {
  const problems: string[] = [];
  let meme: Parsed["meme"] = null;
  let cover = false;
  let src: string | undefined, alt: string | undefined;
  const reply = cleanReply(text);
  const lines: string[] = [];
  for (const line of reply.split("\n")) {
    if (/^\s*\[image:\s*.+\]\s*$/i.test(line)) {
      problems.push("GitHub drops email image attachments. Send the picture and blurb together in Codex so the image can be added to the site.");
      continue;
    }
    const image = line.match(/^\s*meme[- ]image:\s*(.+)$/i);
    if (image) {
      if (/^\/assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|gif)$/.test(image[1].trim())) src = image[1].trim();
      else problems.push("The meme image must be a saved /assets/ image. Send the picture with your blurb in Codex to add it.");
      continue;
    }
    const imageAlt = line.match(/^\s*meme-alt:\s*(.+)$/i);
    if (imageAlt) { alt = imageAlt[1].trim(); continue; }
    const m = line.match(/^\s*meme:\s*(.+)$/i);
    if (m) {
      const [who, ...caption] = m[1].split(/\s+[-–—:]\s+/);
      const team = teams.find(t => mentions(who, t.names));
      if (team) meme = { rosterId: team.id, caption: caption.join(" - ").trim() || "Reaction photo." };
      else problems.push(`“meme:” names nobody in the league: ${who.trim()}`);
      continue;
    }
    if (/^\s*cover:\s*meme\s*$/i.test(line)) { cover = true; continue; }
    lines.push(line);
  }
  if ((cover || src || alt) && !meme) problems.push("Add a line like 'meme: Jag - caption' to choose the game for the picture.");
  if (meme && src) meme = { ...meme, src, ...(alt && { alt }) };

  let paragraphs = lines.join("\n").split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const nonempty = lines.map(l => l.trim()).filter(Boolean);
  // Unseparated one-line game blurbs are allowed; soft-wrapped email paragraphs must stay together.
  if (paragraphs.length === 1 && nonempty.length > 1 && nonempty.slice(1).every(line => {
    const { hook, body } = splitHook(line);
    return hook && body;
  })) paragraphs = nonempty;

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
