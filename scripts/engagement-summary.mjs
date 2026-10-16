const DEFAULT_TRACKING_STARTED_DATE = "2026-10-14";
const STORY_ID_PATTERN = /^week-([1-9]\d*)-game-([1-9]\d*)$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_LABEL_LENGTH = 80;

const USEFUL_CLICK_LABELS = new Map([
  ["back_issue", "older recaps"],
  ["older_recap", "older recaps"],
  ["older_recaps", "older recaps"],
  ["sleeper", "Sleeper"],
  ["coach_text", "coach-text"],
  ["coach-text", "coach-text"],
]);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function invalid(path, message) {
  throw new TypeError(`Invalid engagement summary ${path}: ${message}`);
}

function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function required(record, key, path) {
  if (!Object.hasOwn(record, key)) invalid(`${path}.${key}`, "is required");
  return record[key];
}

function nonNegativeNumber(value, path, { integer = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    invalid(path, "must be a finite nonnegative number");
  }
  if (integer && !Number.isSafeInteger(value)) invalid(path, "must be a nonnegative integer");
  return value;
}

function safeAdd(left, right, path) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) invalid(path, "sum is too large");
  return sum;
}

function validStoryId(value, path) {
  if (typeof value !== "string") invalid(path, "must match week-N-game-M");
  const match = STORY_ID_PATTERN.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2]))) {
    invalid(path, "must match week-N-game-M with sensible numbers");
  }
  return match;
}

function parseDate(value, path) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    invalid(path, "must use YYYY-MM-DD format");
  }
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (Number.isNaN(timestamp) || date.toISOString().slice(0, 10) !== value) {
    invalid(path, "must be a real calendar date");
  }
  return { value, year, month, day, timestamp };
}

function validateMetricBlock(value, path, keys) {
  if (!isRecord(value)) invalid(path, "must be an object");
  const block = {};
  for (const key of keys) {
    block[key] = nonNegativeNumber(required(value, key, path), `${path}.${key}`, { integer: key !== "activeSeconds" });
  }
  if (keys.includes("activeSeconds") && block.visits === 0 && (block.browsers !== 0 || block.activeSeconds !== 0)) {
    invalid(path, "zero visits cannot have browsers or active seconds");
  }
  if (block.browsers > block.visits) invalid(`${path}.browsers`, "cannot exceed visits");
  return block;
}

function validateData(data) {
  if (!isRecord(data)) invalid("data", "must be an object");

  const current = validateMetricBlock(
    required(data, "current", "data"),
    "data.current",
    ["browsers", "visits", "activeSeconds", "recapBrowsers", "engagedBrowsers", "errors"],
  );
  const previous = validateMetricBlock(
    required(data, "previous", "data"),
    "data.previous",
    ["browsers", "visits"],
  );

  if (current.recapBrowsers > current.browsers) invalid("data.current.recapBrowsers", "cannot exceed browsers");
  if (current.engagedBrowsers > current.recapBrowsers) {
    invalid("data.current.engagedBrowsers", "cannot exceed recapBrowsers");
  }

  const returnedBrowsers = nonNegativeNumber(required(data, "returnedBrowsers", "data"), "data.returnedBrowsers", { integer: true });
  if (returnedBrowsers > current.browsers) invalid("data.returnedBrowsers", "cannot exceed current.browsers");
  if (returnedBrowsers > previous.browsers) invalid("data.returnedBrowsers", "cannot exceed previous.browsers");

  const rawStories = required(data, "stories", "data");
  if (!Array.isArray(rawStories)) invalid("data.stories", "must be an array");
  const storyIds = new Set();
  const stories = rawStories.map((story, index) => {
    const path = `data.stories[${index}]`;
    if (!isRecord(story)) invalid(path, "must be an object");
    const storyId = required(story, "storyId", path);
    validStoryId(storyId, `${path}.storyId`);
    if (storyIds.has(storyId)) invalid(`${path}.storyId`, `duplicate story ID ${storyId}`);
    storyIds.add(storyId);
    const browsers = nonNegativeNumber(required(story, "browsers", path), `${path}.browsers`, { integer: true });
    if (browsers > current.recapBrowsers) invalid(`${path}.browsers`, "cannot exceed current.recapBrowsers");
    return { storyId, browsers };
  });

  const rawClicks = required(data, "clicks", "data");
  if (!Array.isArray(rawClicks)) invalid("data.clicks", "must be an array");
  const clicks = new Map();
  rawClicks.forEach((click, index) => {
    const path = `data.clicks[${index}]`;
    if (!isRecord(click)) invalid(path, "must be an object");
    const kind = required(click, "kind", path);
    if (typeof kind !== "string") invalid(`${path}.kind`, "must be a string");
    const count = nonNegativeNumber(required(click, "count", path), `${path}.count`, { integer: true });
    const label = USEFUL_CLICK_LABELS.get(kind);
    if (!label) return;
    clicks.set(label, safeAdd(clicks.get(label) ?? 0, count, `${path}.count`));
  });

  return { current, previous, returnedBrowsers, stories, clicks };
}

function validateContext(context) {
  if (!isRecord(context)) invalid("context", "must be an object");
  const startDate = parseDate(required(context, "startDate", "context"), "context.startDate");
  const endDate = parseDate(required(context, "endDate", "context"), "context.endDate");
  if (endDate.timestamp < startDate.timestamp) invalid("context.endDate", "cannot be before startDate");
  const currentComplete = required(context, "currentComplete", "context");
  const previousComplete = required(context, "previousComplete", "context");
  if (typeof currentComplete !== "boolean") invalid("context.currentComplete", "must be boolean");
  if (typeof previousComplete !== "boolean") invalid("context.previousComplete", "must be boolean");

  const rawLabels = required(context, "storyLabels", "context");
  if (!isRecord(rawLabels)) invalid("context.storyLabels", "must be an object");
  const storyLabels = new Map();
  for (const [storyId, label] of Object.entries(rawLabels)) {
    if (typeof label !== "string") invalid(`context.storyLabels.${storyId}`, "must be a string");
    storyLabels.set(storyId, label);
  }

  const trackingStartedDate = context.trackingStartedDate === undefined
    ? parseDate(DEFAULT_TRACKING_STARTED_DATE, "context.trackingStartedDate")
    : parseDate(context.trackingStartedDate, "context.trackingStartedDate");

  return { startDate, endDate, currentComplete, previousComplete, storyLabels, trackingStartedDate };
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Formatter received an invalid number");
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function formatShortDate(date) {
  return `${MONTHS[date.month - 1]} ${date.day}`;
}

function formatDateRange(startDate, endDate) {
  if (startDate.value === endDate.value) return `${MONTHS[startDate.month - 1]} ${startDate.day}`;
  if (startDate.year === endDate.year && startDate.month === endDate.month) {
    return `${MONTHS[startDate.month - 1]} ${startDate.day}–${endDate.day}`;
  }
  if (startDate.year === endDate.year) {
    return `${MONTHS[startDate.month - 1]} ${startDate.day}–${MONTHS[endDate.month - 1]} ${endDate.day}`;
  }
  return `${MONTHS[startDate.month - 1]} ${startDate.day}, ${startDate.year}–${MONTHS[endDate.month - 1]} ${endDate.day}, ${endDate.year}`;
}

function escapePublicLabel(value) {
  const compact = value
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";

  const withoutPrivateText = compact
    .replace(/\b(?:https?|javascript|data|mailto):[^\s)]+/gi, "[link omitted]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[contact omitted]")
    .replace(/\+?\d[\d().\s-]{6,}\d/g, "[contact omitted]");
  const truncated = [...withoutPrivateText].length > MAX_LABEL_LENGTH
    ? `${[...withoutPrivateText].slice(0, MAX_LABEL_LENGTH).join("")}…`
    : withoutPrivateText;

  return truncated
    .replace(/\\/g, "\\\\")
    .replace(/([`*_\[\]{}()#+.!|<>~])/g, "\\$1")
    .replace(/@/g, "@\u200b");
}

function storyLabel(storyId, labels) {
  const match = validStoryId(storyId, "storyId");
  const fallback = `Week ${match[1]}, matchup ${match[2]}`;
  const label = labels.get(storyId);
  if (label === undefined) return fallback;
  const escaped = escapePublicLabel(label);
  return escaped || fallback;
}

function compareStoryIds(left, right) {
  const leftMatch = STORY_ID_PATTERN.exec(left);
  const rightMatch = STORY_ID_PATTERN.exec(right);
  if (!leftMatch || !rightMatch) throw new Error("Formatter received an invalid story ID");
  return Number(leftMatch[1]) - Number(rightMatch[1]) || Number(leftMatch[2]) - Number(rightMatch[2]);
}

function retentionLine(data, context) {
  if (!context.currentComplete || !context.previousComplete) {
    const started = `Tracking began ${formatShortDate(context.trackingStartedDate)}`;
    if (context.trackingStartedDate.timestamp > context.endDate.timestamp) {
      return `${started} after this reporting window`;
    }
    return !context.currentComplete
      ? `${started}; this week is partial`
      : `${started}; prior window is partial, so retention is unavailable`;
  }
  if (data.previous.browsers === 0) return "Weekly retention: unavailable (no prior-week browsers recorded)";
  const percentage = (data.returnedBrowsers / data.previous.browsers) * 100;
  return `Weekly retention: ${formatInteger(data.returnedBrowsers)} of ${formatInteger(data.previous.browsers)} prior-week browsers returned (${formatDecimal(percentage)}%)`;
}

function usefulClicksLine(clicks) {
  const order = ["older recaps", "Sleeper", "coach-text"];
  const parts = order
    .filter(label => (clicks.get(label) ?? 0) > 0)
    .map(label => `${label} ${formatInteger(clicks.get(label))}`);
  return `Useful clicks: ${parts.length ? parts.join(" · ") : "none recorded"}`;
}

/**
 * Render an aggregate, privacy-safe weekly PostHog engagement report.
 * The function accepts only already-aggregated counts; it never emits IDs,
 * URLs, event payloads, or provider error text.
 */
export function formatEngagementSummary(data, context) {
  const normalizedData = validateData(data);
  const normalizedContext = validateContext(context);
  const range = formatDateRange(normalizedContext.startDate, normalizedContext.endDate);
  const { current, previous, stories, returnedBrowsers } = normalizedData;

  const average = current.visits === 0 ? null : current.activeSeconds / current.visits;
  if (average !== null && (!Number.isFinite(average) || average < 0)) {
    invalid("data.current.activeSeconds", "average active time is invalid");
  }
  const traffic = [
    `Browsers: ${formatInteger(current.browsers)}`,
    `Visits: ${formatInteger(current.visits)}`,
    `Avg active time per visit: ${average === null ? "unavailable" : `${formatDecimal(average)}s`}`,
  ];
  if (current.visits === 0) traffic.push("No tracked visits recorded");

  const topStories = [...stories]
    .sort((left, right) => right.browsers - left.browsers || compareStoryIds(left.storyId, right.storyId))
    .slice(0, 3);
  const mostReached = topStories.length
    ? topStories.map(story => `${storyLabel(story.storyId, normalizedContext.storyLabels)} (${formatInteger(story.browsers)} browsers)`).join(", ")
    : "none recorded";

  const lines = [
    `**Engagement, ${range}** (Eastern time; excludes opt-outs)`,
    traffic.join(" · "),
    retentionLine({ previous, returnedBrowsers }, normalizedContext),
    `Recap reach: ${formatInteger(current.recapBrowsers)} browsers · Engaged (10s+): ${formatInteger(current.engagedBrowsers)} browsers · Most reached: ${mostReached}`,
    usefulClicksLine(normalizedData.clicks),
  ];
  if (current.errors > 0) {
    lines.push(`Errors: ${formatInteger(current.errors)} error report${current.errors === 1 ? "" : "s"}`);
  }
  return lines.join("  \n");
}

export { DEFAULT_TRACKING_STARTED_DATE };
