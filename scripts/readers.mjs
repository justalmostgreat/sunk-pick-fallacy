// Last week's readers, from Cloudflare's analytics for sunkpick.com. The Tuesday scout adds them to its weekly issue.
//   node scripts/readers.mjs              print the numbers
//   node scripts/readers.mjs report.txt   put them in the scout's report, above its "---" line
// Needs CLOUDFLARE_API_TOKEN with Zone · Analytics · Read. Never fails the Tuesday job: if Cloudflare can't be read,
// the section says so in one line instead.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ZONE = "51485ff2589c350c201cd0dc3735abb6"; // sunkpick.com
const DAY = 86400000;
// US page views that loaded a real page. Phones are the cleanest count of league readers: the bots and scanners
// that hit every public site mostly show up as computers abroad, and their probes get 404s.
const QUERY = `query($zone: String!, $from: Time!, $to: Time!) { viewer { zones(filter: {zoneTag: $zone}) {
  httpRequestsAdaptiveGroups(limit: 2000, filter: {datetime_geq: $from, datetime_lt: $to, requestSource: "eyeball",
    edgeResponseContentTypeName: "html", edgeResponseStatus: 200, clientCountryName: "US"}) {
    count dimensions { date clientDeviceType clientRequestPath } } } } }`;

const day = (iso, opts) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(`${iso}T00:00:00Z`));
const page = path => path === "/" ? "front page" : path.replace(/^\/week\/(\d+)$/, "Week $1");

/** Rows from Cloudflare → the section's lines, for the 7 full UTC days before `today` (a midnight-UTC Date). */
export function summarize(rows, today) {
  const start = new Date(today - 7 * DAY).toISOString().slice(0, 10), end = new Date(today - DAY).toISOString().slice(0, 10);
  const span = day(start, { month: "short" }) === day(end, { month: "short" })
    ? `${day(start, { month: "short", day: "numeric" })}–${day(end, { day: "numeric" })}`
    : `${day(start, { month: "short", day: "numeric" })}–${day(end, { month: "short", day: "numeric" })}`;
  const now = rows.filter(r => r.dimensions.date >= start), before = rows.filter(r => r.dimensions.date < start);
  const phone = r => ["mobile", "tablet"].includes(r.dimensions.clientDeviceType);
  const sum = list => list.reduce((n, r) => n + r.count, 0);
  const phones = sum(now.filter(phone)), computers = sum(now) - phones, was = sum(before.filter(phone));
  if (!phones && !computers) return [`**Readers, ${span}:** no US page views recorded.`];
  const change = was ? `, ${phones >= was ? "up" : "down"} ${Math.round(Math.abs(phones - was) / was * 100)}% on the week before` : "";
  const by = (list, key) => [...list.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + r.count), new Map())].sort((a, b) => b[1] - a[1]);
  const pages = by(now, r => page(r.dimensions.clientRequestPath)).slice(0, 4).map(([p, n]) => `${p} ${n}`).join(" · ");
  const [busiest] = by(now.filter(phone), r => r.dimensions.date);
  return [
    `**Readers, ${span}** (US page views)`,
    `Phones ${phones}${change} · computers ${computers}`,
    `Most read: ${pages}${busiest ? ` · busiest day ${day(busiest[0], { weekday: "short", month: "short", day: "numeric" })}` : ""}`,
  ];
}

async function readers() {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const token = process.env.CLOUDFLARE_API_TOKEN;
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ query: QUERY, variables: { zone: ZONE, from: new Date(today - 14 * DAY).toISOString(), to: today.toISOString() } }),
      signal: AbortSignal.timeout(30000),
    });
    const json = await res.json().catch(() => ({}));
    const rows = json.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
    if (!rows) throw new Error(json.errors?.[0]?.message ?? `Cloudflare answered ${res.status}`);
    return summarize(rows, today).join("  \n");
  } catch (error) {
    const hint = /auth|permission|token/i.test(error.message) ? " Give the CLOUDFLARE_API_TOKEN secret Zone · Analytics · Read in Cloudflare." : "";
    return `_Reader numbers unavailable this week: ${error.message}.${hint}_`;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const section = await readers();
  const file = process.argv[2];
  if (!file) console.log(section);
  else {
    const report = readFileSync(file, "utf8").split("\n");
    const at = report.indexOf("---");
    report.splice(at < 0 ? report.length : at, 0, section, "");
    writeFileSync(file, report.join("\n"));
  }
}
