import assert from "node:assert/strict";
import { test } from "node:test";
import { trackVisit } from "../lib/track-visit.ts";
import { analyticsEnabled, readAnalyticsConsent, saveAnalyticsConsent } from "../lib/analytics-consent.ts";

// A deterministic browser surface tests timing, consent, and refresh behavior without
// transmitting data or depending on the production analytics account.
function browser() {
  let now = 0, interval, mutate, focused = true;
  const saved = new Map();
  const install = (name, value) => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  class Element extends EventTarget {
    constructor(dataset, rect = { top: 50, bottom: 550, height: 500 }) { super(); this.dataset = dataset; this.rect = rect; this.isConnected = true; }
    getBoundingClientRect() { return this.rect; }
    closest(selector) {
      if (selector === "[data-track-link]") return this.dataset.trackLink ? this : null;
      if (selector.includes("data-track-link='coach_text'")) return this.dataset.trackLink === "coach_text" ? this : null;
      if (selector.includes("[data-track-story]") && this.dataset.trackStory) return this;
      if (selector.includes("[data-track-section]") && this.dataset.trackSection) return this;
      return null;
    }
    get href() { throw new Error("Tracking must not read a link destination"); }
    get textContent() { throw new Error("Tracking must not read names or page text"); }
  }
  const story = new Element({ trackStory: "game-3", trackWeek: "5", trackMatchup: "3" });
  const section = new Element({ trackSection: "recap", trackWeek: "5" });
  let nodes = [story, section];
  const doc = new EventTarget();
  const win = new EventTarget();
  const local = new Map(), cookies = new Map();
  Object.assign(doc, { visibilityState: "visible", documentElement: { scrollHeight: 2000 }, hasFocus: () => focused, querySelectorAll: () => nodes, querySelector: () => section, body: section });
  Object.defineProperty(doc, "cookie", { get: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), set: value => { const [name, data] = value.split(";")[0].split("="); cookies.set(name, data); } });
  win.setInterval = callback => { interval = callback; return 1; };
  install("window", win); install("document", doc); install("Element", Element); install("HTMLElement", Element); install("HTMLImageElement", class extends Element {});
  install("navigator", { doNotTrack: null, globalPrivacyControl: false });
  install("location", { hostname: "sunkpick.com", protocol: "https:" });
  install("localStorage", { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) });
  install("performance", { now: () => now }); install("innerHeight", 700); install("scrollY", 0); install("clearInterval", () => { interval = undefined; });
  install("MutationObserver", class { constructor(callback) { mutate = callback; } observe() {} disconnect() {} });
  return {
    doc, win, story, section, Element,
    tick(seconds) { for (let i = 0; i < seconds; i++) { now += 1000; interval?.(); } },
    refresh() { mutate?.(); },
    replace(kind) {
      const replacement = kind === "story"
        ? new Element({ trackStory: "game-3", trackWeek: "5", trackMatchup: "3" })
        : new Element({ trackSection: "recap", trackWeek: "5" });
      nodes[kind === "story" ? 0 : 1] = replacement;
      mutate?.();
      return replacement;
    },
    focus(value) { focused = value; win.dispatchEvent(new Event(value ? "focus" : "blur")); },
    click(element) { const event = new Event("click"); Object.defineProperty(event, "target", { value: element }); doc.dispatchEvent(event); },
    copy(element) { const event = new Event("copy"); Object.defineProperty(event, "target", { value: element }); doc.dispatchEvent(event); },
    restore() { for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } },
  };
}

test("a story records reach once across live-score refreshes and reports active-time deltas", () => {
  const env = browser(), events = [];
  const stop = trackVisit("/", (name, props) => events.push({ name, props }));
  try {
    env.tick(12); env.refresh(); env.tick(20); stop();
    assert.equal(events.filter(e => e.name === "story_viewed").length, 1);
    assert.equal(events.filter(e => e.name === "section_viewed").length, 1);
    assert.deepEqual(events.filter(e => e.name === "story_engaged").map(e => e.props.milestone_seconds), [10, 30]);
    assert.equal(events.filter(e => e.name === "page_engagement").reduce((n, e) => n + e.props.active_seconds, 0), 32);
    assert.equal(events.filter(e => e.name === "story_engagement").reduce((n, e) => n + e.props.active_seconds, 0), 32);
    assert.equal(events.filter(e => e.name === "section_engagement").reduce((n, e) => n + e.props.active_seconds, 0), 32);
    assert.equal(events.find(e => e.name === "section_engagement").props.section, "recap");
    assert.equal(events.find(e => e.name === "story_viewed").props.story_id, "week-5-game-3");
  } finally { stop(); env.restore(); }
});

test("section timing survives rediscovery without double counting", () => {
  const env = browser(), events = [];
  const stop = trackVisit("/", (name, props) => events.push({ name, props }));
  try {
    env.tick(12); env.replace("section"); env.tick(20); stop();
    assert.equal(events.filter(e => e.name === "section_viewed").length, 1);
    assert.equal(events.filter(e => e.name === "section_engagement").reduce((n, e) => n + e.props.active_seconds, 0), 32);
    assert.deepEqual(events.filter(e => e.name === "section_engagement").map(e => e.props.total_active_seconds), [30, 32]);
  } finally { stop(); env.restore(); }
});

test("hidden, unfocused and idle pages do not inflate viewing time", () => {
  const env = browser(), events = [];
  const stop = trackVisit("/week/5", (name, props) => events.push({ name, props }));
  try {
    env.tick(5);
    env.doc.visibilityState = "hidden"; env.doc.dispatchEvent(new Event("visibilitychange")); env.tick(120);
    env.doc.visibilityState = "visible"; env.doc.dispatchEvent(new Event("visibilitychange")); env.tick(5);
    env.focus(false); env.tick(120); env.focus(true); env.tick(5); stop();
    assert.equal(events.filter(e => e.name === "page_engagement").reduce((n, e) => n + e.props.active_seconds, 0), 15);
    assert.equal(events[0].props.week, 5);
  } finally { stop(); env.restore(); }
  const idle = browser(), idleEvents = [];
  const stopIdle = trackVisit("/", (name, props) => idleEvents.push({ name, props }));
  try {
    idle.tick(180); stopIdle();
    const seconds = idleEvents.filter(e => e.name === "page_engagement").reduce((n, e) => n + e.props.active_seconds, 0);
    assert.ok(seconds >= 58 && seconds <= 60, `Idle page counted ${seconds} seconds`);
  } finally { stopIdle(); idle.restore(); }
});

test("coach-link tracking never reads a phone number, link URL or name", () => {
  const env = browser(), events = [];
  const stop = trackVisit("/", (name, props) => events.push({ name, props }));
  try {
    env.click(new env.Element({ trackLink: "coach_text", trackId: "7" }));
    assert.deepEqual(events, [{ name: "link_clicked", props: { page_path: "/", page_type: "home", target_kind: "coach_text", target_id: 7 } }]);
    env.click(new env.Element({ trackLink: "unapproved", trackId: "email@example.com" }));
    assert.equal(events.length, 1);
  } finally { stop(); env.restore(); }
});

test("content copy records only existing story or section identifiers", () => {
  const env = browser(), events = [];
  const stop = trackVisit("/week/5", (name, props) => events.push({ name, props }));
  try {
    env.copy(env.story); env.copy(env.section);
    env.copy(new env.Element({ trackLink: "coach_text", trackId: "7", trackStory: "game-3", trackWeek: "5", trackMatchup: "3" }));
    assert.deepEqual(events.filter(e => e.name === "content_copied"), [
      { name: "content_copied", props: { page_path: "/week/5", page_type: "back_issue", week: 5, story_id: "week-5-game-3", matchup: 3 } },
      { name: "content_copied", props: { page_path: "/week/5", page_type: "back_issue", week: 5, section: "recap" } },
    ]);
  } finally { stop(); env.restore(); }
});

test("cleanup stops timing and copy listeners without a second flush", () => {
  const env = browser(), events = [];
  const stop = trackVisit("/", (name, props) => events.push({ name, props }));
  env.tick(5); stop();
  const count = events.length;
  try {
    env.tick(20); env.copy(env.story); env.focus(false); env.focus(true);
    assert.equal(events.length, count);
  } finally { stop(); env.restore(); }
});

test("notice-and-opt-out defaults on, preserves old declines, and honors browser privacy signals", () => {
  const env = browser();
  try {
    assert.equal(readAnalyticsConsent(), "automatic");
    assert.equal(analyticsEnabled(readAnalyticsConsent()), true);
    document.cookie = "spf_analytics_v1=declined";
    assert.equal(readAnalyticsConsent(), "declined");
    assert.equal(analyticsEnabled(readAnalyticsConsent()), false);
    saveAnalyticsConsent("allowed"); assert.equal(readAnalyticsConsent(), "allowed");
    navigator.globalPrivacyControl = true; assert.equal(readAnalyticsConsent(), "blocked");
    navigator.globalPrivacyControl = false; navigator.doNotTrack = "1"; assert.equal(readAnalyticsConsent(), "blocked");
    navigator.doNotTrack = null; saveAnalyticsConsent("declined"); assert.equal(readAnalyticsConsent(), "declined");
    for (const blocked of ["loading", "declined", "blocked"]) assert.equal(analyticsEnabled(blocked), false);
  } finally { env.restore(); }
});
