type Properties = Record<string, string | number>;
type Capture = (name: string, properties: Properties) => void;
type Item = { element: HTMLElement; key: string; properties: Properties; story: boolean; seconds: number; sent: number; seen: boolean; progress: number; milestones: Set<number> };

/** One actual page navigation. A live-score refresh never starts another visit. */
export function trackVisit(path: string, capture: Capture) {
  const match = /^\/week\/(\d+)$/.exec(path);
  const base: Properties = { page_path: path, page_type: match ? "back_issue" : "home", ...(match ? { week: Number(match[1]) } : {}) };
  const items = new Map<string, Item>();
  let active = 0, sent = 0, maxScroll = 0, lastTick = performance.now(), lastActivity = lastTick;
  let stopped = false;
  const depths = new Set<number>();
  const errors = new Set<string>();
  const emit = (name: string, properties: Properties = {}) => capture(name, { ...base, ...properties });

  // Re-discover after server refreshes; retain counters by content identity, not DOM node.
  const discover = () => {
    for (const element of document.querySelectorAll<HTMLElement>("[data-track-section], [data-track-story]")) {
      const story = !!element.dataset.trackStory;
      const id = story ? element.dataset.trackStory! : element.dataset.trackSection!;
      const week = Number(element.dataset.trackWeek) || 0;
      const key = `${story ? "story" : "section"}:${week}:${id}`;
      const existing = items.get(key);
      if (existing) { existing.element = element; continue; }
      const properties: Properties = story
        ? { story_id: `week-${week}-${id}`, matchup: Number(element.dataset.trackMatchup), week }
        : { section: id, ...(week ? { week } : {}) };
      items.set(key, { element, key, properties, story, seconds: 0, sent: 0, seen: false, progress: 0, milestones: new Set() });
    }
  };
  const activeNow = (now: number) => document.visibilityState === "visible" && document.hasFocus() && now - lastActivity < 60000;
  const update = () => {
    if (stopped) return;
    const now = performance.now();
    const elapsed = Math.max(0, Math.min(2, (now - lastTick) / 1000));
    lastTick = now;
    if (!activeNow(now)) return;
    active += elapsed;
    const height = Math.max(document.documentElement.scrollHeight, innerHeight);
    maxScroll = Math.max(maxScroll, Math.min(100, Math.round((scrollY + innerHeight) / height * 100)));
    for (const depth of [25, 50, 75, 100]) {
      if (maxScroll >= depth && !depths.has(depth)) { depths.add(depth); emit("scroll_depth", { progress_percent: depth }); }
    }
    for (const item of items.values()) {
      if (!item.element.isConnected) continue;
      const rect = item.element.getBoundingClientRect();
      const visible = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      if (rect.height <= 0 || visible < Math.min(160, rect.height * .5)) continue;
      item.seconds += elapsed;
      if (!item.seen && item.seconds >= 1) {
        item.seen = true;
        emit(item.story ? "story_viewed" : "section_viewed", item.properties);
      }
      if (!item.story) continue;
      for (const milestone of [10, 30, 60]) {
        if (item.seconds >= milestone && !item.milestones.has(milestone)) {
          item.milestones.add(milestone);
          emit("story_engaged", { ...item.properties, milestone_seconds: milestone });
        }
      }
      const progress = Math.min(100, Math.max(0, Math.floor((innerHeight - rect.top) / rect.height * 4) * 25));
      // Reaching the bottom is an exposure measure, not a claim that the story was read.
      if (item.seen && progress > item.progress) {
        item.progress = progress;
        emit("story_read_progress", { ...item.properties, progress_percent: progress });
      }
    }
    if (active - sent >= 30) flush();
  };
  const flush = () => {
    const delta = Math.floor(active - sent);
    if (delta >= 1) { emit("page_engagement", { active_seconds: delta, total_active_seconds: Math.floor(active), max_scroll_percent: maxScroll }); sent += delta; }
    for (const item of items.values()) {
      const seconds = Math.floor(item.seconds - item.sent);
      if (item.story && seconds >= 1) {
        emit("story_engagement", { ...item.properties, active_seconds: seconds, total_active_seconds: Math.floor(item.seconds) });
        item.sent += seconds;
      }
    }
  };
  const activity = () => { update(); lastActivity = performance.now(); };
  const pause = () => { update(); flush(); };
  const focus = () => { lastTick = performance.now(); lastActivity = lastTick; };
  const visibility = () => document.visibilityState === "hidden" ? pause() : focus();
  const click = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-track-link]") : null;
    if (!target) return;
    const kind = target.dataset.trackLink;
    if (!kind || !["story", "final", "back_issue", "home", "sleeper", "coach_text"].includes(kind)) return;
    const properties: Properties = { target_kind: kind };
    if (/^\d+$/.test(target.dataset.trackId ?? "")) properties.target_id = Number(target.dataset.trackId);
    if (/^\d+$/.test(target.dataset.trackWeek ?? "")) properties.target_week = Number(target.dataset.trackWeek);
    // Never read href, text content, names, SMS destinations, or input values.
    emit("link_clicked", properties);
  };
  const error = (event: Event) => {
    const kind = event.type === "unhandledrejection" ? "unhandled_rejection" : event.target instanceof HTMLImageElement ? "image" : "script";
    if (!errors.has(kind)) { errors.add(kind); emit("site_error", { error_kind: kind }); }
  };
  discover();
  const observer = new MutationObserver(discover);
  observer.observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
  const timer = window.setInterval(update, 1000);
  for (const name of ["pointerdown", "keydown", "scroll", "touchstart"]) window.addEventListener(name, activity, { passive: true });
  document.addEventListener("click", click);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", pause);
  window.addEventListener("focus", focus);
  window.addEventListener("pagehide", pause);
  window.addEventListener("error", error, true);
  window.addEventListener("unhandledrejection", error);
  return () => {
    update(); flush(); stopped = true;
    clearInterval(timer); observer.disconnect();
    for (const name of ["pointerdown", "keydown", "scroll", "touchstart"]) window.removeEventListener(name, activity);
    document.removeEventListener("click", click);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("blur", pause);
    window.removeEventListener("focus", focus);
    window.removeEventListener("pagehide", pause);
    window.removeEventListener("error", error, true);
    window.removeEventListener("unhandledrejection", error);
  };
}
