import assert from "node:assert/strict";
import { easternMidnight, engagementWindow, engagementQueries, decodeEngagementResults, engagementReport } from "./engagement.mjs";

assert.equal(easternMidnight("2026-10-20").toISOString(), "2026-10-20T04:00:00.000Z");
assert.equal(easternMidnight("2026-11-03").toISOString(), "2026-11-03T05:00:00.000Z");
assert.throws(() => easternMidnight("2026-02-30"));
assert.throws(() => easternMidnight("2026-10-20'; DROP"));
const first = engagementWindow(new Date("2026-10-20T14:00:00Z"));
assert.equal(first.startDate, "2026-10-13"); assert.equal(first.endDate, "2026-10-19");
assert.equal(first.currentComplete, false); assert.equal(first.previousComplete, false);
const second = engagementWindow(new Date("2026-10-27T14:00:00Z"));
assert.equal(second.currentComplete, true); assert.equal(second.previousComplete, false);
const fall = engagementWindow(new Date("2026-11-03T14:00:00Z"));
assert.equal((fall.end - fall.start) / 3600000, 169); assert.equal(fall.previousComplete, true);
const spring = engagementWindow(new Date("2027-03-16T14:00:00Z"));
assert.equal((spring.end - spring.start) / 3600000, 167);
const midnight = engagementWindow(new Date("2026-10-20T02:00:00Z"));
assert.equal(midnight.endDate, "2026-10-18", "UTC midnight must not prematurely end an Eastern day");

const queries = engagementQueries(fall);
for (const sql of Object.values(queries)) {
  assert.match(sql, /setup-check/); assert.match(sql, /analytics-launch/);
  assert.match(sql, /2026-11-03 05:00:00/); assert.match(sql, /timestamp </);
}
assert.match(queries.totals, /event = 'page_engagement'/);
assert.doesNotMatch(queries.totals, /total_active_seconds/);
assert.match(queries.stories, /LIMIT 3/);
assert.match(queries.clicks, /'back_issue', 'sleeper', 'coach_text'/);
assert.throws(() => decodeEngagementResults([], [], []));
assert.throws(() => decodeEngagementResults([["private@example.com", 1, 0, 0, 0, 0, 0, 0, 0]], [], []));
const totals = [[4, 6, 480, 3, 2, 0, 5, 7, 2]];
const stories = [["week-5-game-3", 3]], clicks = [["back_issue", 2]];
const fixture = decodeEngagementResults(totals, stories, clicks);
assert.equal(fixture.current.activeSeconds, 480);
assert.equal(fixture.previous.browsers, 5);
assert.equal(fixture.returnedBrowsers, 2);

const seen = [];
const fakeFetch = async (url, options) => {
  const body = JSON.parse(options.body); seen.push({ url, body, options });
  const results = body.name.endsWith("totals") ? totals : body.name.endsWith("stories") ? stories : clicks;
  return { ok: true, status: 200, json: async () => ({ results, hasMore: false }) };
};
const text = await engagementReport({ now: new Date("2026-11-03T14:00:00Z"), apiKey: "test-secret", fetcher: fakeFetch });
assert.doesNotMatch(text, /unavailable|test-secret|distinct_id|posthog\.com/);
assert.match(text, /Arjun.*Jag/);
assert.equal(seen.length, 3);
assert.ok(seen.every(call => call.url === "https://us.posthog.com/api/projects/665153/query/"));
assert.ok(seen.every(call => call.options.redirect === "error" && call.options.signal instanceof AbortSignal));
assert.ok(seen.every(call => call.body.query.kind === "HogQLQuery" && call.body.async === false));

let contacted = false;
const missing = await engagementReport({ apiKey: "", fetcher: async () => { contacted = true; } });
assert.equal(contacted, false); assert.match(missing, /not configured/);
for (const response of [
  { ok: false, status: 403 }, { ok: false, status: 429 }, { ok: false, status: 500 },
  { ok: true, status: 200, json: async () => ({ results: [], query_status: { complete: false } }) },
  { ok: true, status: 200, json: async () => ({ results: totals, hasMore: true }) },
  { ok: true, status: 200, json: async () => { throw new Error("phx_private phone secret"); } },
]) {
  const report = await engagementReport({ apiKey: "phx_private", fetcher: async () => response });
  assert.match(report, /unavailable/); assert.doesNotMatch(report, /phx_private|phone secret/);
}
const outage = await engagementReport({ apiKey: "phx_private", fetcher: async () => { throw new Error("https://private.example/?token=phx_private"); } });
assert.match(outage, /unavailable/); assert.doesNotMatch(outage, /private.example|phx_private/);
console.log("engagement API and reporting-window checks passed");
