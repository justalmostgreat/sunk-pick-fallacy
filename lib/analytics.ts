import type { CaptureResult, Properties } from "posthog-js";

/**
 * Analytics is intentionally a small, allowlisted boundary.  The browser
 * integration may pass PostHog's event object through `sanitizeEvent` as its
 * `before_send` hook; this module never reads the DOM, cookies, or location.
 *
 * The only URL values this module emits are canonical Sunk Pick paths, or an
 * external referrer's origin.  Event properties are copied into new objects,
 * so the PostHog event that the SDK gives us is never mutated.
 */

const CANONICAL_ORIGIN = "https://sunkpick.com";
const SITE_HOSTS = new Set(["sunkpick.com", "www.sunkpick.com"]);
const SAFE_VALUE = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_IDENTIFIER = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_URL_LENGTH = 2048;
const MAX_PATH_LENGTH = 128;
const MAX_HEATMAP_PATHS = 16;
const MAX_HEATMAP_POINTS = 512;
const MAX_HEATMAP_COORDINATE = 1_000_000;
const MAX_SAFE_SECONDS = 86_400;

const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type SafeAttribution = Partial<Record<AttributionKey, string>> & {
  referrer_origin?: string;
};

type UnknownRecord = Record<string, unknown>;

const ALLOWED_EVENTS = new Set([
  "$snapshot",
  "$autocapture",
  "$rageclick",
  "$dead_click",
  "$dead_swipe",
  "$pageview",
  "$pageleave",
  "$$heatmap",
  "$web_vitals",
  "section_viewed",
  "section_engagement",
  "content_copied",
  "story_viewed",
  "story_engaged",
  "story_engagement",
  "story_read_progress",
  "link_clicked",
  "page_engagement",
  "scroll_depth",
  "site_error",
]);

const INTERACTION_EVENTS = new Set(["$autocapture", "$rageclick", "$dead_click", "$dead_swipe"]);

function structuralElementChain(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 20_000) return null;
  const parts = value.split(";").slice(0, 24).map(part => {
    const tag = /^([a-z][a-z0-9-]{0,30})(?=[:.]|$)/i.exec(part)?.[1]?.toLowerCase();
    const child = /\bnth-child="(\d{1,5})"/.exec(part)?.[1];
    const type = /\bnth-of-type="(\d{1,5})"/.exec(part)?.[1];
    if (!tag || !child || !type) return null;
    return `${tag}:nth-child="${Number(child)}"nth-of-type="${Number(type)}"`;
  });
  return parts.length && parts.every(Boolean) ? parts.join(";") : null;
}

const ANONYMOUS_ID_KEYS = new Set([
  "distinct_id",
  "$anon_distinct_id",
  "$device_id",
  "$session_id",
  "$window_id",
  "$insert_id",
  "$pageview_id",
  "$prev_pageview_id",
]);

const INTERNAL_STRING_KEYS = new Set([
  "$lib",
  "$lib_version",
  "$config_defaults",
  "$os",
  "$os_name",
  "$os_version",
  "$browser",
  "$browser_version",
  "$browser_language",
  "$browser_language_prefix",
  "$device",
  "$device_type",
  "$webview_app",
  "$webview_app_version",
  "$timezone",
]);

const INTERNAL_NUMBER_KEYS = new Set([
  "$timezone_offset",
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$time",
  "$duration",
  "$prev_pageview_duration",
  "$prev_pageview_last_scroll",
  "$prev_pageview_last_scroll_percentage",
  "$prev_pageview_max_scroll",
  "$prev_pageview_max_scroll_percentage",
  "$prev_pageview_last_content",
  "$prev_pageview_last_content_percentage",
  "$prev_pageview_max_content",
  "$prev_pageview_max_content_percentage",
]);

const INTERNAL_BOOLEAN_KEYS = new Set([
  "$cookieless_mode",
]);

const GEO_KEYS = new Set([
  "$geoip_city_name",
  "$geoip_country_name",
  "$geoip_country_code",
  "$geoip_subdivision_1_code",
  "$geoip_subdivision_1_name",
]);

const PAGE_TYPES = new Set(["home", "week", "back_issue", "privacy"]);
const TARGET_KINDS = new Set(["story", "final", "back_issue", "home", "sleeper", "coach_text"]);
const ERROR_KINDS = new Set(["script", "image", "unhandled_rejection"]);
const HEATMAP_TYPES = new Set(["click", "mousemove", "rageclick", "deadclick"]);

/** Return only the three public page shapes used by the site. */
export function safePagePath(pathname: unknown): string | null {
  if (typeof pathname !== "string" || pathname.length === 0 || pathname.length > MAX_PATH_LENGTH) return null;
  if (pathname === "/" || pathname === "/privacy") return pathname;
  return /^\/week\/[1-9]\d*$/.test(pathname) ? pathname : null;
}

function parseHttpUrl(value: unknown, allowRelative = false): URL | null {
  const text = typeof value === "string" ? value : typeof URL !== "undefined" && value instanceof URL ? value.toString() : null;
  if (!text || text.length > MAX_URL_LENGTH || text.includes("\u0000")) return null;
  try {
    const url = allowRelative ? new URL(text, CANONICAL_ORIGIN) : new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function isSiteHost(hostname: string): boolean {
  return SITE_HOSTS.has(hostname.toLowerCase());
}

function isDefaultPort(url: URL): boolean {
  return !url.port || (url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80");
}

/**
 * Canonicalize a Sunk Pick URL to the HTTPS production origin and a safe page
 * path.  Query strings, fragments, credentials, foreign hosts, and unknown
 * routes are discarded by returning null.
 */
function canonicalSiteUrl(value: unknown, allowRelative = true): string | null {
  const url = parseHttpUrl(value, allowRelative);
  if (!url || url.username || url.password || !isSiteHost(url.hostname) || !isDefaultPort(url)) return null;
  const path = safePagePath(url.pathname);
  return path ? `${CANONICAL_ORIGIN}${path}` : null;
}

/** Keep an external origin while removing credentials, path, query, and hash. */
function externalReferrerOrigin(value: unknown): string | null {
  const url = parseHttpUrl(value);
  if (!url || url.origin === "null" || isSiteHost(url.hostname)) return null;
  return url.origin;
}

/** Keep only a parsed hostname for native source/referrer properties. */
function referrerHost(value: unknown): string | null {
  if (value === "$direct") return "$direct";
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  const url = parseHttpUrl(value) ?? parseHttpUrl(`https://${value}`);
  if (!url || url.origin === "null" || url.username || url.password) return null;
  return url.hostname;
}

function safeReferrer(value: unknown): string | null {
  return value === "$direct" ? "$direct" : externalReferrerOrigin(value);
}

function canonicalSiteHost(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) return null;
  const text = value.includes("://") ? value : `https://${value}`;
  const url = parseHttpUrl(text);
  if (!url || url.username || url.password || !isSiteHost(url.hostname) || !isDefaultPort(url) || url.pathname !== "/" || url.search || url.hash) return null;
  return "sunkpick.com";
}

/**
 * Read campaign parameters from a URL and an external referrer.  Values use
 * the same deliberately small token grammar as event identifiers.  `utm_term`
 * and every other query parameter are intentionally ignored.
 */
export function safeAttribution(url: unknown, referrer: unknown): SafeAttribution {
  const result: SafeAttribution = {};
  const parsedUrl = parseHttpUrl(url, true);
  if (parsedUrl) {
    for (const key of ATTRIBUTION_KEYS) {
      const value = parsedUrl.searchParams.get(key);
      if (value !== null && SAFE_VALUE.test(value)) result[key] = value;
    }
  }
  const origin = externalReferrerOrigin(referrer);
  if (origin) result.referrer_origin = origin;
  return result;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeIdentifier(value: unknown): string | number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return null;
  if (value === "$posthog_cookieless" || SAFE_IDENTIFIER.test(value)) return value;
  return null;
}

function safeTelemetryString(value: unknown, maxLength = 128): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return null;
  // This covers raw e-mail addresses, phone-like inputs, and URL-bearing text
  // even if a future internal property is added to the allowlist.
  if (/https?:\/\//i.test(value) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value) || /(?:^|\D)\+?\d[\d\s().-]{6,}\d(?:$|\D)/.test(value)) return null;
  if ([...value].some(char => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) return null;
  return value;
}

function safeInternalString(value: unknown, maxLength = 256): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return null;
  if ([...value].some(char => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) return null;
  return value;
}

function safeNonNegativeNumber(value: unknown, max = MAX_SAFE_SECONDS): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

function safeBoundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function safePercentage(value: unknown): number | null {
  return safeNonNegativeNumber(value, 100);
}

function safePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function safeAttributionProperty(key: string, value: unknown): string | null {
  return (ATTRIBUTION_KEYS as readonly string[]).includes(key) && typeof value === "string" && SAFE_VALUE.test(value) ? value : null;
}

function sanitizeHeatmapData(value: unknown): UnknownRecord | null {
  if (!isRecord(value)) return null;
  const result: UnknownRecord = {};
  let pathCount = 0;
  for (const [rawUrl, rawPoints] of Object.entries(value)) {
    if (pathCount >= MAX_HEATMAP_PATHS || !Array.isArray(rawPoints)) continue;
    const canonicalUrl = canonicalSiteUrl(rawUrl, false);
    if (!canonicalUrl || canonicalUrl === `${CANONICAL_ORIGIN}/privacy`) continue;
    const points: UnknownRecord[] = [];
    for (const rawPoint of rawPoints) {
      if (points.length >= MAX_HEATMAP_POINTS || !isRecord(rawPoint)) continue;
      const x = safeNonNegativeNumber(rawPoint.x, MAX_HEATMAP_COORDINATE);
      const y = safeNonNegativeNumber(rawPoint.y, MAX_HEATMAP_COORDINATE);
      const type = typeof rawPoint.type === "string" && HEATMAP_TYPES.has(rawPoint.type) ? rawPoint.type : null;
      if (x === null || y === null || typeof rawPoint.target_fixed !== "boolean" || type === null) continue;
      points.push({ x, y, target_fixed: rawPoint.target_fixed, type });
    }
    if (points.length === 0) continue;
    if (Array.isArray(result[canonicalUrl])) {
      const merged = result[canonicalUrl] as UnknownRecord[];
      merged.push(...points.slice(0, Math.max(0, MAX_HEATMAP_POINTS - merged.length)));
    } else {
      result[canonicalUrl] = points;
      pathCount++;
    }
  }
  return Object.keys(result).length ? result : null;
}

function sanitizeWebVitalProperty(key: string, value: unknown): number | null {
  if (!/^\$web_vitals_(?:LCP|CLS|FCP|INP)_value$/.test(key)) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 15 * 60 * 1000 ? value : null;
}

/**
 * Copy an event's properties through the same allowlist used by
 * `sanitizeEvent`.  The optional event name is used to make heatmap handling
 * explicit; callers may omit it when sanitizing a standalone property bag.
 */
export function sanitizeProperties(properties: unknown, eventName?: string): Properties {
  const result: UnknownRecord = {
    // Browser profiles support return/cohort analysis without names or logins.
    // No identify event or arbitrary person properties pass this boundary.
    $process_person_profile: eventName !== "$snapshot",
    $is_identified: false,
  };
  if (!isRecord(properties)) return result as Properties;
  const previousPath = typeof properties.$prev_pageview_pathname === "string" ? properties.$prev_pageview_pathname : "";
  const previousPrivacy = previousPath === "/privacy" || previousPath.startsWith("/privacy?") || previousPath.startsWith("/privacy#");

  for (const [key, raw] of Object.entries(properties)) {
    if (eventName && INTERACTION_EVENTS.has(eventName)) {
      if (key === "$elements_chain") {
        const chain = structuralElementChain(raw);
        if (chain) result[key] = chain;
        continue;
      }
      if (key === "$event_type" && (raw === "click" || raw === "touchend")) { result[key] = raw; continue; }
      if (key === "$ce_version" || /^\$(?:dead_click|dead_swipe|rageclick)_[a-z_]+$/.test(key)) {
        const number = safeNonNegativeNumber(raw, 1_000_000);
        if (number !== null) result[key] = number;
        continue;
      }
    }
    if (key === "$elements" || key === "$elements_chain" || key === "$raw_user_agent" || key === "$user_id" || key === "$groups") continue;
    if (key === "$process_person_profile" || key === "$is_identified") continue;
    if (previousPrivacy && key.startsWith("$prev_pageview_")) continue;
    if (key === "$heatmap_data") {
      if (eventName === "$$heatmap" || eventName === undefined) {
        const heatmap = sanitizeHeatmapData(raw);
        if (heatmap) result[key] = heatmap;
      }
      continue;
    }
    // Never forward person-property containers, including browser-derived
    // initial referrer/current URL and campaign fields nested inside them.
    if (key === "$set" || key === "$set_once") continue;
    if (key === "$session_entry_url") {
      const safe = canonicalSiteUrl(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (key === "$session_entry_pathname") {
      const safe = safePagePath(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (key === "$session_entry_host") {
      const safe = canonicalSiteHost(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (key === "$session_entry_referrer") {
      const safe = safeReferrer(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (key === "$session_entry_referring_domain" || key === "$referring_domain") {
      const safe = referrerHost(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (key.startsWith("$session_entry_utm_")) {
      const attribution = safeAttributionProperty(key.slice("$session_entry_".length), raw);
      if (attribution !== null) result[key] = attribution;
      continue;
    }
    if (key === "$current_url") {
      const safe = canonicalSiteUrl(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (key === "$pathname" || key === "page_path") {
      const safe = safePagePath(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (key === "$prev_pageview_pathname") {
      const safe = safePagePath(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (key === "$host") {
      const safe = canonicalSiteHost(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (key === "$referrer" || key === "referrer_origin") {
      const safe = safeReferrer(raw);
      if (safe) result[key] = safe;
      continue;
    }

    const attribution = safeAttributionProperty(key, raw);
    if (attribution !== null) {
      result[key] = attribution;
      continue;
    }
    // utm_term is intentionally not in safeAttributionProperty and should
    // never pass through.
    if (key === "utm_term" || key.startsWith("$initial_") || key.startsWith("initial_")) continue;

    const vital = sanitizeWebVitalProperty(key, raw);
    if (vital !== null) {
      result[key] = vital;
      continue;
    }
    if (key.startsWith("$web_vitals_") || key.startsWith("$elements")) continue;

    if (ANONYMOUS_ID_KEYS.has(key)) {
      const safe = safeIdentifier(raw);
      if (safe !== null) result[key] = safe;
      continue;
    }
    if (key === "token") {
      const safe = safeInternalString(raw, 256);
      if (safe) result[key] = safe;
      continue;
    }
    if (key === "$browser_version" && typeof raw === "number") {
      const safe = safeNonNegativeNumber(raw, 10_000);
      if (safe !== null) result[key] = safe;
      continue;
    }
    if (INTERNAL_STRING_KEYS.has(key)) {
      const safe = safeInternalString(raw);
      if (safe) result[key] = safe;
      continue;
    }
    if (INTERNAL_NUMBER_KEYS.has(key)) {
      const max = key.endsWith("_percentage") ? 1 : key === "$time" ? Number.MAX_SAFE_INTEGER : key.includes("duration") ? MAX_SAFE_SECONDS : 100_000;
      const safe = key === "$timezone_offset" ? safeBoundedNumber(raw, -24 * 60, 24 * 60) : safeNonNegativeNumber(raw, max);
      if (safe !== null) result[key] = safe;
      continue;
    }
    if (INTERNAL_BOOLEAN_KEYS.has(key)) {
      if (typeof raw === "boolean") result[key] = raw;
      continue;
    }
    if (GEO_KEYS.has(key)) {
      if (typeof raw === "number") {
        const safe = Number.isFinite(raw) && Math.abs(raw) <= 1_000_000 ? raw : null;
        if (safe !== null) result[key] = safe;
      } else if (typeof raw === "boolean") {
        result[key] = raw;
      } else {
        const safe = safeTelemetryString(raw);
        if (safe) result[key] = safe;
      }
      continue;
    }

    if (key === "page_type") {
      if (typeof raw === "string" && PAGE_TYPES.has(raw)) result[key] = raw;
      continue;
    }
    if (key === "target_kind") {
      if (typeof raw === "string" && TARGET_KINDS.has(raw)) result[key] = raw;
      continue;
    }
    if (key === "error_kind") {
      if (typeof raw === "string" && ERROR_KINDS.has(raw)) result[key] = raw;
      continue;
    }
    if (key === "week" || key === "target_week" || key === "matchup") {
      const safe = safePositiveInteger(raw);
      if (safe !== null) result[key] = safe;
      continue;
    }
    if (key === "active_seconds" || key === "total_active_seconds" || key === "milestone_seconds") {
      const safe = safeNonNegativeNumber(raw);
      if (safe !== null) result[key] = safe;
      continue;
    }
    if (key === "progress_percent" || key === "max_scroll_percent") {
      const safe = safePercentage(raw);
      if (safe !== null) result[key] = safe;
      continue;
    }
    if (key === "section" || key === "story_id" || key === "target_id" || key === "traffic_source" || key === "source") {
      if (key === "target_id") {
        // Link targets are roster/week IDs supplied by code.  Keeping this
        // numeric prevents a DOM label or coach name from becoming analytics.
        if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) result[key] = raw;
      } else if (typeof raw === "string" && SAFE_VALUE.test(raw)) {
        result[key] = raw;
      }
      continue;
    }
  }

  return result as Properties;
}

/**
 * Conservative PostHog `before_send` hook.  Unknown event names are dropped;
 * known events retain only the safe property contract above.  Top-level
 * `$set`/`$set_once` are deliberately dropped so an identify/plugin path
 * cannot inject identity or arbitrary person-property updates.
 */
export function sanitizeEvent(event: unknown): CaptureResult | null {
  if (!isRecord(event) || typeof event.event !== "string" || !ALLOWED_EVENTS.has(event.event)) return null;
  const result: UnknownRecord = {
    event: event.event,
    properties: sanitizeProperties(event.properties, event.event),
  };
  // rrweb data must remain intact for playback. It is already filtered by the
  // recorder hooks in analytics-replay.ts; only its envelope is sanitized here.
  if (event.event === "$snapshot") {
    const source = isRecord(event.properties) ? event.properties : {};
    if (!Array.isArray(source.$snapshot_data) || typeof source.$snapshot_bytes !== "number" || !Number.isFinite(source.$snapshot_bytes) || source.$snapshot_bytes < 1 || source.$snapshot_bytes > 1_000_000) return null;
    const properties = result.properties as UnknownRecord;
    properties.$snapshot_data = source.$snapshot_data;
    properties.$snapshot_bytes = source.$snapshot_bytes;
    if (source.$snapshot_host === "sunkpick.com" || source.$snapshot_host === "www.sunkpick.com") properties.$snapshot_host = "sunkpick.com";
  }
  if (typeof event.uuid === "string" && SAFE_IDENTIFIER.test(event.uuid)) result.uuid = event.uuid;
  if (event.timestamp instanceof Date && Number.isFinite(event.timestamp.getTime())) result.timestamp = new Date(event.timestamp.getTime());
  return result as unknown as CaptureResult;
}

