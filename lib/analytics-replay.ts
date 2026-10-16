import type { CapturedNetworkRequest, SessionRecordingOptions } from "posthog-js";

const SITE = "https://sunkpick.com";
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "poster", "data", "xlink:href", "background", "cite", "longdesc", "manifest", "profile"]);
const TIMINGS = ["startTime", "endTime", "duration", "timeOrigin", "timestamp", "fetchStart", "requestStart", "responseStart", "responseEnd", "connectStart", "connectEnd", "domainLookupStart", "domainLookupEnd", "secureConnectionStart", "transferSize", "encodedBodySize", "decodedBodySize"];

/** The event hook can gate replay envelopes, but these hooks sanitize the rrweb payload. */
export function replayUrl(value: string): string {
  try {
    const url = new URL(value, SITE);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    if (url.pathname === "/privacy") return `${url.origin}/`;
    // The site's page and asset paths are public. Never retain query/hash data.
    return `${url.origin}${url.pathname}`;
  } catch { return ""; }
}

export function replayText(value: string): string {
  return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, _quote, url) => `url("${replayUrl(url)}")`)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contact]")
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[contact]");
}

export function replayAttribute(name: string, value: string, element?: Element): string {
  const key = name.toLowerCase();
  if (key.startsWith("on") || key === "value" || key === "srcdoc" || key === "nonce" || key === "integrity" || key === "ping") return "";
  if (key.startsWith("data-") && !/^data-track-(?:section|story|week|matchup|link|id)$/.test(key)) return "";
  if (URL_ATTRIBUTES.has(key)) return replayUrl(value);
  if (key === "srcset" || key === "imagesrcset") return value.split(",").map(part => {
    const [url, descriptor] = part.trim().split(/\s+/);
    const safe = replayUrl(url);
    return safe ? `${safe}${/^\d+(?:\.\d+)?[wx]$/.test(descriptor ?? "") ? ` ${descriptor}` : ""}` : "";
  }).filter(Boolean).join(", ");
  if (key === "content" && element?.tagName.toLowerCase() === "meta") return "";
  if (key === "style" || key === "_cssText") return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, _quote, url) => `url("${replayUrl(url)}")`);
  return replayText(value);
}

export function replayNetwork(request: CapturedNetworkRequest): CapturedNetworkRequest | null {
  const name = replayUrl(request.name);
  if (!name) return null;
  const clean: Record<string, string | number | boolean> = { name, entryType: "resource", startTime: 0, duration: 0 };
  for (const key of TIMINGS) {
    const value = (request as unknown as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) clean[key] = value;
  }
  if (["navigation", "resource"].includes(request.entryType)) clean.entryType = request.entryType;
  if (request.initiatorType && /^[a-z][a-z_-]{0,30}$/i.test(request.initiatorType)) clean.initiatorType = request.initiatorType;
  if (request.method && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(request.method)) clean.method = request.method.toUpperCase();
  if (Number.isInteger(request.status) && request.status! >= 0 && request.status! <= 599) clean.status = request.status!;
  if (typeof request.isInitial === "boolean") clean.isInitial = request.isInitial;
  return clean as unknown as CapturedNetworkRequest;
}

export const replayOptions: SessionRecordingOptions = {
  maskAllInputs: true,
  maskAllElementAttributes: false,
  maskTextSelector: "*",
  maskTextFn: replayText,
  blockSelector: "a[href^='tel:' i], a[href^='sms:' i], a[href^='mailto:' i], input, textarea, select, [contenteditable], [data-analytics-private], [data-ph-no-capture], .ph-no-capture, script, noscript, iframe",
  maskAttributeFn: replayAttribute,
  maskCapturedNetworkRequestFn: replayNetwork,
  recordHeaders: false,
  recordBody: false,
  captureJsonLd: false,
  recordCrossOriginIframes: false,
  captureCanvas: { recordCanvas: false },
  sampling: { mouseInteraction: true, mousemove: 100 },
  session_idle_threshold_ms: 300_000,
};
