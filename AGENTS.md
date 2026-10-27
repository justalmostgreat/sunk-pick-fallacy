# Sunk Pick Fallacy site: notes for AI assistants

The league site for Sunk Pick Fallacy, a 10-team superflex dynasty league on Sleeper (league `1392799570517303296`).
One page: live standings, dynasty power rankings, the latest weekly recap, and back issues at `/week/N`.
Standings, rankings and scout's notes pull from Sleeper and FantasyCalc on every visit; nothing to maintain there.

## The weekly routine (automatic except the blurb)

1. Tuesday 9 AM Central, `.github/workflows/tuesday.yml` freezes the finished week into `lib/weeks/<N>.json`
   and opens a "Week N is final" GitHub issue with the scout's ranking of every game and last week's reader
   numbers from Cloudflare plus aggregate PostHog engagement (`scripts/readers.mjs`; the Readers workflow shows both on demand).
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
  sunkpick.com zone, with Zone · Analytics · Read for the reader numbers. Set repository variable
  `CLOUDFLARE_ACCOUNT_ID` to that account's ID.
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
`meme-alt: <description>` to the input, and include the image in the normal reviewed PR.
`npm run blurb` prints it in the program's two inks (like Week 2's photo) as `/assets/week-<N>.webp` and removes the
original. Keep any burned-in meme caption (the commissioner wants it); crop off only clutter below or around it,
like mics, logos or phone UI. Do not put private GitHub attachment URLs on the public site. A text replacement on the same meme game preserves its saved image;
omitting `meme:` removes it. The parser strips quoted email history and reports discarded email images clearly.

1. Save the blurb as given (tighten it only if asked) to a file and run `npm run blurb -- <week> <file>`,
   or pipe it: `pbpaste | npm run blurb -- <week>`.
2. It understands the usual format: an optional first line becomes the headline; each game gets its own paragraph
   that opens with an ALL-CAPS hook; paragraphs are matched to games by the coach or team names in them.
   Optional lines: `meme: <name> - <caption>` puts the reaction photo on that game; `cover: meme` puts it on the
   cover for that week only; `headline: <text>` sets a headline that names coaches but doesn't open "WEEK N RECAP"
   (as a plain first line it would be read as a story).
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

## Reader behavior analytics and replays

- PostHog project 665153 (US) provides the private reader dashboard. The Publish build reads the public
  ingestion token from repository variable `POSTHOG_PROJECT_TOKEN` into `NEXT_PUBLIC_POSTHOG_KEY`.
  Never put a personal/admin API key in that variable or the client bundle. An absent token disables tracking.
- The owner confirmed a U.S.-only league audience and authorized notice-and-opt-out analytics and visit replays.
  `components/site-analytics.tsx` starts automatically on site pages with an inline notice and Turn off control;
  no login or Allow popup. The existing spf_analytics_v1 declined choices, Global Privacy Control and DNT still
  block loading. Turning off stops replay before SDK reset; re-enabling starts a fresh browser identifier.
  Reassess this audience assumption if the service or audience changes; this is not a universal legal exemption.
- PostHog has unnamed browser profiles (`person_profiles: always`) for history/cohorts, but never calls identify
  or attaches names/contact details to browser profiles. Session replay records all eligible visits on the capped free plan (5k/month,
  30-day retention). Project recording is enabled, console capture off, network timing on, headers/bodies off.
  Inputs/contact links/iframes/private-marked elements are blocked; public recap text stays readable.
- `lib/analytics-replay.ts` separately sanitizes replay attributes and network timings, including all URL
  query/hash data. The before_send hook gates and sanitizes the replay envelope; recorder hooks protect its opaque rrweb payload.
  Keep maskAttributeFn active; do not enable session_recording.maskAllElementAttributes, which overrides it.
  Remote config must load (`advanced_disable_flags: false`); disable only feature flags on initial load.
  Surveys, experiments, canvas recording, console logs and request/response bodies stay off.
- Internal page links deliberately use ordinary document navigation: Vinext's production `next/link`
  bundle fails in its dynamic router helpers. Test actual clicks in the built Worker, not only the dev server.
  Browser-cache restorations start a fresh tracked visit and re-read the consent choice.
- Track page views on document navigation/cache restoration, not live-score refreshes. `lib/track-visit.ts` measures section/story
  reach, scroll progress and active viewing time (visible, focused, less than 60 seconds idle). Story IDs
  include week and matchup. `story_engagement.active_seconds` is a delta: sum it; don't sum the cumulative
  `total_active_seconds`. Native PostHog session/page duration is elapsed time and can include idle time;
  never label it active viewing time. `story_engaged` marks 10/30/60-second milestones. Scroll/reach are exposure proxies,
  never claims that a person read something. Visitors are distinct browsers, not verified people.
- Named safe link events cover stories/finals, back issues, home, Sleeper and coach-text clicks. Never
  collect SMS destinations, coach names or input values in event properties. Replays can show public site text. `lib/analytics.ts` sanitizes
  every outbound event, URL, attribution and heatmap bucket; keep its allowlist and regression checks in sync.
  `/privacy` and its buffered heatmap/previous-page data are excluded. Campaign labels may contain only
  letters, digits, underscores and hyphens (up to 64 chars); use e.g. `utm_source=league-chat&utm_campaign=week-6`.
- The public Tuesday report includes aggregate Cloudflare traffic and PostHog engagement. Never put visitor
  histories, IDs, raw provider errors, or private PostHog dashboard links into public issues. The free PostHog
  plan is capped, with no payment card required and one-year event retention.
- `scripts/engagement.mjs` queries project665153 using GitHub secret `POSTHOG_QUERY_API_KEY`: a private API key
  restricted to this project and `query:read` only. This is separate from the public ingestion token and must
  never be bundled into the site, printed, or stored as a repository variable. Queries return aggregate rows
  only; raw browser IDs stay in PostHog. Known setup-check/analytics-launch browsers are excluded server-side.
- Engagement covers the seven complete Eastern calendar days before the run, with daylight-saving-aware
  boundaries. Cloudflare retains its existing UTC-day window and US request population; the headings label
  the different populations and timezones. Never add Cloudflare pageviews to PostHog browser/visit counts.
  Browsers/visits are distinct browser IDs and browser-session pairs with reportable activity in the window.
- Weekly retention is returning browsers divided by prior-week browsers. Suppress it until both windows
  have complete tracking coverage (launch2026-10-14), and label the partial launch week. Active time uses only
  page_engagement.active_seconds deltas, not cumulative totals or story time summed on top. Story reach is
  exposure, not verified reading. Each provider fails independently with a short safe unavailable notice;
  neither can prevent the scout issue. `npm run check` includes windows/DST, format, failure, and insertion tests.
- For local QA only, set `NEXT_PUBLIC_ANALYTICS_TEST_MODE=true`, a fake `phc_` token and a loopback capture host.
  Production builds must not set test mode. Run `npm run check` for sanitization, opt-out, replay sanitization and engagement tests. Section timing emits section_engagement deltas; content_copied records only section/story IDs, never copied text.
