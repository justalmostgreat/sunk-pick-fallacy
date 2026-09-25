# Sunk Pick Fallacy site: notes for AI assistants

The league site for Sunk Pick Fallacy, a 10-team superflex dynasty league on Sleeper (league `1392799570517303296`).
One page: live standings, dynasty power rankings, the latest weekly recap, and back issues at `/week/N`.
Standings, rankings and scout's notes pull from Sleeper and FantasyCalc on every visit; nothing to maintain there.

## The weekly routine (automatic except the blurb)

1. Tuesday 9 AM Central, `.github/workflows/tuesday.yml` freezes the finished week into `lib/weeks/<N>.json`
   and opens a "Week N is final" GitHub issue with the scout's ranking of every game.
2. The commissioner writes the group-chat blurb, then either replies to that issue with it (`.github/workflows/blurb.yml`
   puts it on the site, commits, and closes the issue) or asks an assistant to add it.

## Adding a blurb when asked

1. Save the blurb as given (tighten it only if asked) to a file and run `npm run blurb -- <week> <file>`,
   or pipe it: `pbpaste | npm run blurb -- <week>`.
2. It understands the usual format: an optional first line becomes the headline; each game gets its own paragraph
   that opens with an ALL-CAPS hook; paragraphs are matched to games by the coach or team names in them.
   Optional lines: `meme: <name> - <caption>` puts the reaction photo on that game; `cover: meme` puts it on the
   cover for that week only.
3. If it can't place a paragraph, add the coach's first name to it and rerun. Rerunning replaces the recap.
4. Run `npm run check`, commit `lib/weeks/`, and push.

## Rules

- Facts come from Sleeper; never invent scores, picks or first names. First names and nicknames live in
  `lib/managers.ts`, keyed by Sleeper roster id; leave a team without one if it's unknown.
- Injury and bust jokes are fine; keep them true.
- Don't change hosting config (`.openai/`) or publish without the commissioner asking.

## Knobs

- `lib/managers.ts`: first names and the nicknames blurbs use ("Commish", "Aditya").
- `lib/dynasty.ts`: `CUTS`, the commissioner's injury discounts. Remove Jaxson Dart's once he's back.
- `components/price.tsx`: the cover's rotating prices; add new league lore here.

## Checks

`npm run check` (model and parser self-check), `npm run lint`, `npx tsc --noEmit`, `npm run build`.
