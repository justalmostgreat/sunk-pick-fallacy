import assert from "node:assert/strict";
import { cloudflareReaders, readersReport, insertReaderSection, summarize } from "./readers.mjs";
import { laterNotes } from "./later.mjs";

const instant = new Date("2026-10-20T14:00:00Z");
const summary = summarize([{ count: 10, dimensions: { date: "2026-10-19", clientDeviceType: "mobile", clientRequestPath: "/" } }], new Date("2026-10-20T00:00:00Z")).join("\n");
assert.match(summary, /Phones 10/); assert.match(summary, /UTC days/);
const combined = await readersReport({ now: instant,
  cloudflare: async ({ now }) => { assert.equal(now, instant); return "Cloudflare counts"; },
  posthog: async ({ now }) => { assert.equal(now, instant); return "PostHog aggregates"; },
});
assert.equal(combined, "Cloudflare counts\n\nPostHog aggregates");
for (const failing of ["cloudflare", "posthog"]) {
  const report = await readersReport({ cloudflare: async () => "Cloudflare counts", posthog: async () => "PostHog aggregates",
    [failing]: async () => { throw new Error("phx_private raw visitor records"); },
  });
  assert.match(report, /unavailable/); assert.doesNotMatch(report, /phx_private|raw visitor/);
  assert.match(report, failing === "posthog" ? /Cloudflare counts/ : /PostHog aggregates/);
}
const unavailable = await cloudflareReaders({ now: instant, token: "test", fetcher: async () => ({ json: async () => ({ errors: [{ message: "phx_private secret error body" }] }) }) });
assert.match(unavailable, /unavailable/); assert.doesNotMatch(unavailable, /phx_private|secret error body/);
const input = "6\nWeek 6 is final\n\nScouting notes\n\n---\nReply with your blurb\n";
const output = insertReaderSection(input, combined);
assert.equal(output.split("\n")[0], "6", "The weekly job reads the first line as its week number");
assert.ok(output.indexOf("Scouting notes") < output.indexOf("Cloudflare counts"));
assert.ok(output.indexOf("PostHog aggregates") < output.indexOf("---"));
assert.match(output, /Reply with your blurb/);
assert.equal(insertReaderSection("6\nReport", "Stats"), "6\nReport\nStats\n");
// Reminders the commissioner asked for: only in their weeks, quoted, and never a "---" line that would
// pull the reader numbers above the scout's ranking.
assert.equal(laterNotes(10), ""); assert.equal(laterNotes(13), "");
for (const week of [11, 12]) {
  const note = laterNotes(week);
  assert.match(note, /^> \*\*Later:/); assert.match(note, /trade deadline/);
  assert.ok(note.split("\n").every(l => l.startsWith(">") && l.trim() !== "---"));
}
assert.equal(laterNotes(4, [{ weeks: [4], lines: ["a", "b"] }, { weeks: [4], lines: ["c"] }]), "> a\n>\n> b\n\n> c");
console.log("combined readers report checks passed");
