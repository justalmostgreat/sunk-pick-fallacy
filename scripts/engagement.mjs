// Private PostHog queries return aggregates only. Never log the key, raw events or provider error bodies.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { firstNames } from "../lib/managers.ts";
import { formatEngagementSummary } from "./engagement-summary.mjs";

export const POSTHOG_PROJECT_ID = "665153";
const QUERY_URL = `https://us.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/`;
const TRACKING_STARTED = new Date("2026-10-14T18:35:00Z");
const TIME_ZONE = "America/New_York";
const DAY = 86400000;
const isoDay = date => date.toISOString().slice(0, 10);
const moveDay = (date, days) => isoDay(new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY));
const partsAt = (date, timeZone) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
}).formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, p.value]));

export function easternMidnight(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isoDay(new Date(`${day}T00:00:00Z`)) !== day) throw new Error("Invalid calendar date");
  const target = Date.parse(`${day}T00:00:00Z`);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = partsAt(new Date(guess), TIME_ZONE);
    const wallClock = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    guess += target - wallClock;
  }
  return new Date(guess);
}

export function engagementWindow(now = new Date()) {
  const p = partsAt(now, TIME_ZONE);
  const today = `${p.year}-${p.month}-${p.day}`;
  const startDate = moveDay(today, -7), endDate = moveDay(today, -1);
  const start = easternMidnight(startDate), end = easternMidnight(today), previousStart = easternMidnight(moveDay(today, -14));
  return { start, end, previousStart, startDate, endDate,
    currentComplete: start >= TRACKING_STARTED, previousComplete: previousStart >= TRACKING_STARTED,
    trackingStartedDate: "2026-10-14" };
}

const sqlDate = value => `toDateTime('${value.toISOString().slice(0, 19).replace("T", " ")}', 'UTC')`;

/** Includes only site events; known setup browsers are excluded inside PostHog, never downloaded. */
export function engagementQueries(window) {
  const from = sqlDate(window.previousStart), current = sqlDate(window.start), until = sqlDate(window.end);
  const setupFrom = sqlDate(TRACKING_STARTED);
  const scope = `timestamp >= ${from} AND timestamp < ${until}
    AND event IN ('$pageview', 'page_engagement', 'story_viewed', 'story_engaged', 'link_clicked', 'site_error')
    AND (properties.$current_url = 'https://sunkpick.com/' OR match(toString(properties.$current_url), '^https://sunkpick[.]com/week/[1-9][0-9]*$'))
    AND distinct_id NOT IN (
      SELECT distinct_id FROM events WHERE timestamp >= ${setupFrom} AND timestamp < ${until}
      AND (properties.utm_source = 'setup-check' OR properties.$session_entry_utm_source = 'setup-check'
        OR properties.utm_campaign = 'analytics-launch' OR properties.$session_entry_utm_campaign = 'analytics-launch')
    )`;
  return {
    totals: `SELECT countIf(current_events > 0), sum(current_visits), sum(active_seconds),
      countIf(story_views > 0), countIf(engaged_stories > 0), sum(error_reports),
      countIf(previous_events > 0), sum(previous_visits), countIf(current_events > 0 AND previous_events > 0)
    FROM (
      SELECT distinct_id,
        countIf(timestamp >= ${current}) AS current_events,
        countIf(timestamp < ${current}) AS previous_events,
        uniqExactIf(properties.$session_id, timestamp >= ${current} AND properties.$session_id IS NOT NULL AND properties.$session_id != '') AS current_visits,
        uniqExactIf(properties.$session_id, timestamp < ${current} AND properties.$session_id IS NOT NULL AND properties.$session_id != '') AS previous_visits,
        sumIf(coalesce(toFloat(properties.active_seconds), 0), event = 'page_engagement' AND timestamp >= ${current}) AS active_seconds,
        countIf(event = 'story_viewed' AND timestamp >= ${current}) AS story_views,
        countIf(event = 'story_engaged' AND toFloat(properties.milestone_seconds) >= 10 AND timestamp >= ${current}) AS engaged_stories,
        countIf(event = 'site_error' AND timestamp >= ${current}) AS error_reports
      FROM events WHERE ${scope} GROUP BY distinct_id
    )`,
    stories: `SELECT toString(properties.story_id), uniqExact(distinct_id)
      FROM events WHERE ${scope} AND timestamp >= ${current} AND event = 'story_viewed'
      AND match(toString(properties.story_id), '^week-[1-9][0-9]*-game-[1-9][0-9]*$')
      GROUP BY properties.story_id ORDER BY uniqExact(distinct_id) DESC, toString(properties.story_id) ASC LIMIT 3`,
    clicks: `SELECT toString(properties.target_kind), count()
      FROM events WHERE ${scope} AND timestamp >= ${current} AND event = 'link_clicked'
      AND properties.target_kind IN ('back_issue', 'sleeper', 'coach_text')
      GROUP BY properties.target_kind ORDER BY properties.target_kind LIMIT 3`,
  };
}

class ReportError extends Error {
  constructor(code) { super(code); this.code = code; }
}

async function queryPosthog(query, name, apiKey, fetcher) {
  const res = await fetcher(QUERY_URL, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name: `sunkpick-weekly-${name}`, refresh: "blocking", async: false }),
    signal: AbortSignal.timeout(25000), redirect: "error",
  });
  if (res.status === 401 || res.status === 403) throw new ReportError("authorization");
  if (res.status === 429) throw new ReportError("rate_limit");
  if (!res.ok) throw new ReportError("service");
  const body = await res.json();
  if (!Array.isArray(body.results) || body.error || body.hasMore || body.has_more || body.next
    || body.query_status?.error || body.query_status?.complete === false) throw new ReportError("response");
  return body.results;
}

function numeric(value) {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < 0) throw new ReportError("response");
  return number;
}

export function decodeEngagementResults(totals, stories, clicks) {
  if (totals.length !== 1 || !Array.isArray(totals[0]) || totals[0].length !== 9 || stories.length > 3 || clicks.length > 3) throw new ReportError("response");
  const [browsers, visits, activeSeconds, recapBrowsers, engagedBrowsers, errors, previousBrowsers, previousVisits, returnedBrowsers] = totals[0].map(numeric);
  const pairs = (rows, key) => rows.map(row => {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string") throw new ReportError("response");
    return { [key]: row[0], [key === "storyId" ? "browsers" : "count"]: numeric(row[1]) };
  });
  return { current: { browsers, visits, activeSeconds, recapBrowsers, engagedBrowsers, errors },
    previous: { browsers: previousBrowsers, visits: previousVisits }, returnedBrowsers,
    stories: pairs(stories, "storyId"), clicks: pairs(clicks, "kind") };
}

function storyLabels(stories) {
  const labels = {};
  for (const { storyId } of stories) {
    const match = /^week-([1-9]\d*)-game-([1-9]\d*)$/.exec(storyId);
    if (!match) continue;
    try {
      const snap = JSON.parse(readFileSync(new URL(`../lib/weeks/${match[1]}.json`, import.meta.url), "utf8"));
      const game = snap.finals.find(game => game.matchup === Number(match[2]));
      if (game) labels[storyId] = `Week ${match[1]}: ${firstNames[game.winner] ?? `Team ${game.winner}`}–${firstNames[game.loser] ?? `Team ${game.loser}`}`;
    } catch { /* Older/missing snapshots use the safe week-and-matchup fallback. */ }
  }
  return labels;
}

export async function engagementReport({ now = new Date(), apiKey = process.env.POSTHOG_QUERY_API_KEY, fetcher = fetch } = {}) {
  if (!apiKey) return "_Engagement stats unavailable: the read-only PostHog reporting key is not configured._";
  try {
    const window = engagementWindow(now);
    const queries = engagementQueries(window);
    const [totals, stories, clicks] = await Promise.all(Object.entries(queries).map(([name, query]) => queryPosthog(query, name, apiKey, fetcher)));
    const data = decodeEngagementResults(totals, stories, clicks);
    return formatEngagementSummary(data, { ...window, storyLabels: storyLabels(data.stories) });
  } catch (error) {
    const reason = error instanceof ReportError && error.code === "authorization" ? "PostHog reporting access needs attention"
      : error instanceof ReportError && error.code === "rate_limit" ? "PostHog's query limit was reached"
      : "PostHog could not return a complete report";
    return `_Engagement stats unavailable this week: ${reason}. The weekly scout is unaffected._`;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(await engagementReport());
