# Sunk Pick Fallacy site: notes for AI assistants

The league site for Sunk Pick Fallacy, a 10-team superflex dynasty league on Sleeper (league `1392799570517303296`).
One page: live standings, dynasty power rankings, the latest weekly recap, and back issues at `/week/N`.
Standings, rankings and scout's notes pull from Sleeper and FantasyCalc on every visit; nothing to maintain there.

## The weekly routine (automatic except the blurb)

1. Tuesday 9 AM Central, `.github/workflows/tuesday.yml` freezes the finished week into `lib/weeks/<N>.json`
   and opens a "Week N is final" GitHub issue with the scout's ranking of every game.
2. The commissioner writes the group-chat blurb, then either replies to that issue with it (`.github/workflows/blurb.yml`
   puts it on the site, commits, and closes the issue) or asks an assistant to add it.
3. `.github/workflows/publish.yml` checks, builds, and publishes `main` to the public Cloudflare Worker
   at `https://sunkpick.com` and `https://www.sunkpick.com`. The Tuesday and Blurb jobs explicitly start Publish
   after saving changes because commits made by GitHub Actions do not trigger push workflows.
4. Both data jobs use `scripts/save-week.mjs` to create and merge a data-only pull request, respecting protected
   `main`. Repository Actions settings must allow Actions to create pull requests. Retries reuse saved snapshots
   and create a missing weekly issue without duplicating an existing one.

## Publishing

- The commissioner approved public Cloudflare hosting on sunkpick.com. Production configuration is in `vite.config.ts`;
  `.openai/` is retained starter metadata, not the production host. Keep the site public without a sign-in wall.
- GitHub Actions needs the repository secret `CLOUDFLARE_API_TOKEN` scoped to the Cloudflare account and the
  sunkpick.com zone. Set repository variable `CLOUDFLARE_ACCOUNT_ID` to that account's ID.
- Pushes to `main` publish automatically. To retry a failed upload without changing content, run the Publish
  workflow from GitHub Actions (`gh workflow run publish.yml --ref main`). A saved recap and a successful
  deployment are separate results; check the Publish run before claiming the change is live.
- Local deployment check after building: `npx wrangler deploy --config dist/server/wrangler.json --dry-run`.
- Both custom domains are configured; workers.dev and version preview URLs are disabled. Search-engine indexing
  is discouraged by the existing robots metadata, but anyone with the public URL can read the site.

## Adding a blurb when asked

Use `examples/weekly-blurb.txt` as the input template. Text-only replies can use email. GitHub discards email
attachments, so for a new picture the commissioner should attach the blurb and image in Codex/Claude instead.
Preserve the supplied story copy. Save the image in `public/assets/`, add `meme-image: /assets/<filename>` and
`meme-alt: <description>` to the input, and include the image in the normal reviewed PR. Do not put private
GitHub attachment URLs on the public site. A text replacement on the same meme game preserves its saved image;
omitting `meme:` removes it. The parser strips quoted email history and reports discarded email images clearly.

1. Save the blurb as given (tighten it only if asked) to a file and run `npm run blurb -- <week> <file>`,
   or pipe it: `pbpaste | npm run blurb -- <week>`.
2. It understands the usual format: an optional first line becomes the headline; each game gets its own paragraph
   that opens with an ALL-CAPS hook; paragraphs are matched to games by the coach or team names in them.
   Optional lines: `meme: <name> - <caption>` puts the reaction photo on that game; `cover: meme` puts it on the
   cover for that week only.
3. If it can't place a paragraph, add the coach's first name to it and rerun. Rerunning replaces the recap.
4. Run `npm run check`, commit `lib/weeks/` on a branch, and open a pull request. Main requires a pull request;
   do not disable branch protection or push directly to it. After merge, verify the Publish run.

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
