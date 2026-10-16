import assert from "node:assert/strict";
import { replayAttribute, replayNetwork, replayOptions, replayText, replayUrl } from "../lib/analytics-replay.ts";

assert.equal(replayUrl("https://sunkpick.com/week/5?email=test@example.com#secret"), "https://sunkpick.com/week/5");
assert.equal(replayUrl("/assets/week-5.webp?token=secret"), "https://sunkpick.com/assets/week-5.webp");
for (const url of ["sms:+15555555555", "tel:+15555555555", "mailto:test@example.com", "javascript:alert(1)", "https://secret:password@sunkpick.com/"]) assert.equal(replayUrl(url), "");
assert.equal(replayAttribute("href", "sms:+15555555555"), "");
assert.equal(replayAttribute("value", "test@example.com"), "");
assert.equal(replayAttribute("data-phone", "+15555555555"), "");
assert.equal(replayAttribute("srcdoc", "private contents"), "");
assert.equal(replayAttribute("data-track-week", "5"), "5");
assert.equal(replayAttribute("srcset", "/assets/a.webp?secret=a 1x, /assets/b.webp?secret=b 2x"), "https://sunkpick.com/assets/a.webp 1x, https://sunkpick.com/assets/b.webp 2x");
assert.equal(replayAttribute("style", "background: url('/assets/a.webp?secret=hidden#hash')"), 'background: url("https://sunkpick.com/assets/a.webp")');
assert.equal(replayAttribute("content", "0;url=https://example.com/?private=123", { tagName: "META" }), "");
assert.equal(replayText("Week 5: 156.80–148.88"), "Week 5: 156.80–148.88");
assert.equal(replayText("test@example.com +1 (555) 555-5555"), "[contact] [contact]");

const source = { name: "https://sunkpick.com/week/5?secret=token#hash", entryType: "resource", startTime: 1, duration: 3,
  method: "get", initiatorType: "fetch", status: 200, responseEnd: 4, isInitial: true,
  requestHeaders: { Authorization: "Bearer private" }, responseHeaders: { "set-cookie": "secret" },
  requestBody: "private", responseBody: "private", serverTiming: [{ description: "private" }], extra: "private" };
const result = replayNetwork(source);
assert.deepEqual(result, { name: "https://sunkpick.com/week/5", entryType: "resource", startTime: 1, duration: 3, responseEnd: 4,
  initiatorType: "fetch", method: "GET", status: 200, isInitial: true });
assert.equal(source.requestBody, "private", "do not mutate the SDK's object");
assert.equal(replayNetwork({ ...source, name: "sms:+15555555555" }), null);
assert.equal(replayOptions.maskAllInputs, true);
assert.equal(replayOptions.recordHeaders, false);
assert.equal(replayOptions.recordBody, false);
for (const selector of ["sms:", "tel:", "input", "script", "iframe", "data-analytics-private"]) assert.ok(replayOptions.blockSelector.includes(selector));
console.log("replay privacy and timing checks passed");
