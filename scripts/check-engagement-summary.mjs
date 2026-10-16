import assert from "node:assert/strict";
import { formatEngagementSummary } from "./engagement-summary.mjs";

const context = {
  startDate: "2026-10-13",
  endDate: "2026-10-19",
  currentComplete: true,
  previousComplete: true,
  storyLabels: {
    "week-5-game-3": "Week 5: Arjun–Jag",
    "week-5-game-1": "Week 5: Mateo–Pranav",
  },
};

const baseData = {
  current: {
    browsers: 10,
    visits: 25,
    activeSeconds: 325,
    recapBrowsers: 8,
    engagedBrowsers: 5,
    errors: 0,
  },
  previous: { browsers: 8, visits: 16 },
  returnedBrowsers: 3,
  stories: [
    { storyId: "week-5-game-3", browsers: 8 },
    { storyId: "week-5-game-1", browsers: 5 },
    { storyId: "week-5-game-2", browsers: 4 },
    { storyId: "week-5-game-4", browsers: 3 },
  ],
  clicks: [
    { kind: "back_issue", count: 4 },
    { kind: "sleeper", count: 2 },
    { kind: "coach_text", count: 1 },
    { kind: "story", count: 99 },
  ],
};

const report = formatEngagementSummary(baseData, context);
assert.match(report, /^\*\*Engagement, Oct 13–19\*\* \(Eastern time; excludes opt-outs\)  $/m);
assert.match(report, /Browsers: 10 · Visits: 25 · Avg active time per visit: 13s/);
assert.match(report, /Weekly retention: 3 of 8 prior-week browsers returned \(37\.5%\)/);
assert.match(report, /Recap reach: 8 browsers · Engaged \(10s\+\): 5 browsers/);
assert.match(report, /Most reached: Week 5: Arjun–Jag \(8 browsers\), Week 5: Mateo–Pranav \(5 browsers\), Week 5, matchup 2 \(4 browsers\)/);
assert.match(report, /Useful clicks: older recaps 4 · Sleeper 2 · coach-text 1/);
assert.doesNotMatch(report, /story/);
assert.doesNotMatch(report, /read/);
assert.equal(report.split("\n").length, 5);
assert.match(report, /opt-outs\)  \nBrowsers:/);

const errorReport = formatEngagementSummary({ ...baseData, current: { ...baseData.current, errors: 2 } }, context);
assert.match(errorReport, /Errors: 2 error reports/);
assert.equal(errorReport.split("\n").length, 6);

const launchPartial = formatEngagementSummary(baseData, {
  ...context,
  currentComplete: false,
  trackingStartedDate: "2026-10-14",
});
assert.match(launchPartial, /Tracking began Oct 14; this week is partial/);
assert.doesNotMatch(launchPartial, /retention/i);
assert.doesNotMatch(launchPartial, /%/);

const beforeLaunch = formatEngagementSummary(baseData, {
  ...context,
  startDate: "2026-10-07",
  endDate: "2026-10-13",
  currentComplete: false,
  trackingStartedDate: "2026-10-14",
});
assert.match(beforeLaunch, /Tracking began Oct 14 after this reporting window/);
assert.doesNotMatch(beforeLaunch, /this week is partial/);

const priorPartial = formatEngagementSummary(baseData, { ...context, previousComplete: false });
assert.match(priorPartial, /prior window is partial, so retention is unavailable/);
assert.doesNotMatch(priorPartial, /37\.5%/);

const zero = formatEngagementSummary({
  current: { browsers: 0, visits: 0, activeSeconds: 0, recapBrowsers: 0, engagedBrowsers: 0, errors: 0 },
  previous: { browsers: 0, visits: 0 },
  returnedBrowsers: 0,
  stories: [],
  clicks: [{ kind: "unknown", count: 4 }],
}, context);
assert.match(zero, /Avg active time per visit: unavailable/);
assert.match(zero, /No tracked visits recorded/);
assert.match(zero, /Weekly retention: unavailable \(no prior-week browsers recorded\)/);
assert.match(zero, /Useful clicks: none recorded/);
assert.doesNotMatch(zero, /Errors:/);

const injected = formatEngagementSummary({
  ...baseData,
  stories: [{ storyId: "week-5-game-3", browsers: 1 }],
}, {
  ...context,
  storyLabels: {
    "week-5-game-3": "[Click](https://private.example/dashboard) @everyone\n<script>alert(1)</script> contact@private.example +1 (555) 123-4567 " + "x".repeat(200),
  },
});
assert.doesNotMatch(injected, /https:\/\/private\.example/);
assert.doesNotMatch(injected, /@everyone/);
assert.doesNotMatch(injected, /<script>/);
assert.doesNotMatch(injected, /contact@private\.example/);
assert.doesNotMatch(injected, /555\) 123-4567/);
assert.ok(injected.length < 1200, "editorial labels must be truncated");

assert.throws(() => formatEngagementSummary({ ...baseData, current: { ...baseData.current, visits: Number.NaN } }, context), /finite nonnegative/);
assert.throws(() => formatEngagementSummary({ ...baseData, previous: { browsers: -1, visits: 0 } }, context), /nonnegative/);
assert.throws(() => formatEngagementSummary({ ...baseData, stories: [{ storyId: "story/private", browsers: 1 }] }, context), /week-N-game-M/);
assert.throws(() => formatEngagementSummary({ ...baseData, stories: [{ storyId: "week-5-game-3", browsers: 1 }, { storyId: "week-5-game-3", browsers: 1 }] }, context), /duplicate story ID/);
assert.throws(() => formatEngagementSummary({ ...baseData, returnedBrowsers: 9 }, context), /cannot exceed previous\.browsers/);
assert.throws(() => formatEngagementSummary({ ...baseData, returnedBrowsers: 11 }, context), /cannot exceed current\.browsers/);
assert.throws(() => formatEngagementSummary({ ...baseData, current: { ...baseData.current, visits: 0 } }, context), /zero visits/);
assert.throws(() => formatEngagementSummary(baseData, { ...context, startDate: "2026-02-30" }), /real calendar date/);

console.log("engagement summary checks passed");
