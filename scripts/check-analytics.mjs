// Pure analytics checks: node scripts/check-analytics.mjs
import assert from "node:assert/strict";
import {
  safeAttribution,
  safePagePath,
  sanitizeEvent,
  sanitizeProperties,
} from "../lib/analytics.ts";

assert.equal(safePagePath("/"), "/");
assert.equal(safePagePath("/privacy"), "/privacy");
assert.equal(safePagePath("/week/1"), "/week/1");
assert.equal(safePagePath("/week/987654"), "/week/987654");
for (const path of [
  "",
  "/week/0",
  "/week/01",
  "/week/-1",
  "/week/1/",
  "/week/1?utm_source=bad",
  "/week/1#fragment",
  "/Week/1",
  "/coach/Jag",
  "/privacy?email=jag@example.com",
  null,
  1,
]) assert.equal(safePagePath(path), null, `blocked path: ${String(path)}`);

assert.deepEqual(
  safeAttribution(
    "https://sunkpick.com/week/5?utm_source=newsletter&utm_medium=email&utm_campaign=fall-back&utm_content=cover&utm_term=do-not-keep&fbclid=secret",
    "https://reader.example:8443/story/private?email=jag%40example.com#fragment",
  ),
  {
    utm_source: "newsletter",
    utm_medium: "email",
    utm_campaign: "fall-back",
    utm_content: "cover",
    referrer_origin: "https://reader.example:8443",
  },
);
assert.deepEqual(
  safeAttribution(
    "/?utm_source=has%20space&utm_medium=ok&utm_campaign=a%2Fb&utm_content=also.ok",
    "https://www.sunkpick.com/from?utm_source=internal",
  ),
  { utm_medium: "ok" },
);
assert.deepEqual(safeAttribution("https://sunkpick.com/?utm_term=ignored", "javascript:alert(1)"), {});
assert.deepEqual(safeAttribution("not a URL", "https://evil.example/path"), { referrer_origin: "https://evil.example" });

const source = {
  event: "story_engaged",
  uuid: "123e4567-e89b-12d3-a456-426614174000",
  properties: {
    token: "project-token",
    distinct_id: "anonymous-id",
    $device_id: "device-id",
    $session_id: "session-id",
    $window_id: "window-id",
    $pageview_id: "pageview-id",
    $process_person_profile: true,
    $is_identified: true,
    $browser_version: 145,
    $timezone_offset: -300,
    $geoip_country_code: "US",
    $geoip_city_name: "Austin",
    $geoip_subdivision_1_name: "Texas",
    $geoip_latitude: 30.2672,
    $geoip_postal_code: "78701",
    $session_entry_url: "https://www.sunkpick.com/week/4?utm_source=newsletter#top",
    $session_entry_pathname: "/week/4",
    $session_entry_host: "www.sunkpick.com",
    $session_entry_referrer: "https://reader.example/story/private?email=jag%40example.com#fragment",
    $session_entry_referring_domain: "https://reader.example/story/private?email=jag%40example.com",
    $session_entry_utm_source: "newsletter",
    $session_entry_utm_medium: "email",
    $session_entry_utm_campaign: "fall-back",
    $session_entry_utm_content: "cover",
    $session_entry_utm_term: "drop",
    $referring_domain: "https://another.example/private?email=jag%40example.com",
    page_path: "/week/5?utm_source=evil",
    page_type: "week",
    week: 5,
    story_id: "week-5-game-1",
    active_seconds: 12.5,
    utm_source: "newsletter",
    utm_term: "secret",
    email: "jag@example.com",
    phone: "+1 (512) 705-8862",
    name: "Jag",
    coach_name: "Jag",
    innerText: "Coach Jag",
    $current_url: "https://www.sunkpick.com/week/5?email=jag%40example.com#fragment",
    $referrer: "https://external.example/story/private?token=secret#fragment",
    $elements: [{ $el_text: "Coach Jag", attr__href: "https://evil.example/?email=jag" }],
    $elements_chain: "button > span Coach Jag",
    $set: {
      utm_content: "cover",
      $initial_referrer: "https://evil.example/private?email=jag%40example.com",
      $initial_current_url: "https://sunkpick.com/week/5?email=jag%40example.com",
      $initial_utm_source: "newsletter",
      email: "jag@example.com",
      arbitrary: "drop me",
    },
    $set_once: {
      utm_campaign: "fall-back",
      utm_term: "drop me",
      $initial_referring_domain: "evil.example",
    },
    arbitrary: { nested: "drop me" },
  },
};
const sanitized = sanitizeEvent(source);
assert.ok(sanitized);
assert.equal(sanitized.event, "story_engaged");
assert.equal(sanitized.properties.token, "project-token");
assert.equal(sanitized.properties.distinct_id, "anonymous-id");
assert.equal(sanitized.properties.$device_id, "device-id");
assert.equal(sanitized.properties.$session_id, "session-id");
assert.equal(sanitized.properties.$window_id, "window-id");
assert.equal(sanitized.properties.$pageview_id, "pageview-id");
assert.equal(sanitized.properties.$process_person_profile, true);
assert.equal(sanitized.properties.$is_identified, false);
assert.equal(sanitized.properties.$browser_version, 145);
assert.equal(sanitized.properties.$timezone_offset, -300);
assert.equal(sanitized.properties.$geoip_country_code, "US");
assert.equal(sanitized.properties.$geoip_city_name, "Austin");
assert.equal(sanitized.properties.$geoip_subdivision_1_name, "Texas");
assert.equal(sanitized.properties.$geoip_latitude, undefined);
assert.equal(sanitized.properties.$geoip_postal_code, undefined);
assert.equal(sanitized.properties.$geoip_email, undefined);
assert.equal(sanitized.properties.page_path, undefined); // query-bearing page paths are rejected
assert.equal(sanitized.properties.$current_url, "https://sunkpick.com/week/5");
assert.equal(sanitized.properties.$referrer, "https://external.example");
assert.equal(sanitized.properties.$referring_domain, "another.example");
assert.equal(sanitized.properties.$session_entry_url, "https://sunkpick.com/week/4");
assert.equal(sanitized.properties.$session_entry_pathname, "/week/4");
assert.equal(sanitized.properties.$session_entry_host, "sunkpick.com");
assert.equal(sanitized.properties.$session_entry_referrer, "https://reader.example");
assert.equal(sanitized.properties.$session_entry_referring_domain, "reader.example");
assert.equal(sanitized.properties.$session_entry_utm_source, "newsletter");
assert.equal(sanitized.properties.$session_entry_utm_medium, "email");
assert.equal(sanitized.properties.$session_entry_utm_campaign, "fall-back");
assert.equal(sanitized.properties.$session_entry_utm_content, "cover");
assert.equal(sanitized.properties.$session_entry_utm_term, undefined);
assert.equal(sanitizeProperties({ $session_entry_referrer: "$direct" }).$session_entry_referrer, "$direct");
assert.equal(sanitizeProperties({ $session_entry_referring_domain: "reader.example/path" }).$session_entry_referring_domain, "reader.example");
assert.equal(sanitized.properties.utm_source, "newsletter");
assert.equal(sanitized.properties.utm_term, undefined);
assert.equal(sanitized.properties.email, undefined);
assert.equal(sanitized.properties.phone, undefined);
assert.equal(sanitized.properties.name, undefined);
assert.equal(sanitized.properties.coach_name, undefined);
assert.equal(sanitized.properties.innerText, undefined);
assert.equal(sanitized.properties.$elements, undefined);
assert.equal(sanitized.properties.$elements_chain, undefined);
assert.equal(sanitized.properties.$set, undefined);
assert.equal(sanitized.properties.$set_once, undefined);
assert.equal(sanitized.properties.arbitrary, undefined);
assert.equal(sanitizeProperties({ page_type: "back_issue", target_id: 0 }).page_type, "back_issue");
assert.equal(sanitizeProperties({ page_type: "back_issue", target_id: 0 }).target_id, 0);
assert.equal(sanitizeProperties({ target_id: "Jag" }).target_id, undefined);
assert.equal(sanitizeProperties({ $host: "sunkpick.com:evil" }).$host, undefined);
assert.deepEqual(source.properties.$set, {
  utm_content: "cover",
  $initial_referrer: "https://evil.example/private?email=jag%40example.com",
  $initial_current_url: "https://sunkpick.com/week/5?email=jag%40example.com",
  $initial_utm_source: "newsletter",
  email: "jag@example.com",
  arbitrary: "drop me",
}); // before_send sanitation does not mutate the SDK object

const pageleave = sanitizeEvent({
  event: "$pageleave",
  properties: {
    $session_id: "session-id",
    $window_id: "window-id",
    $prev_pageview_id: "pageview-id",
    $prev_pageview_pathname: "/week/4",
    $prev_pageview_max_scroll_percentage: 0.75,
    $prev_pageview_duration: 18,
    $prev_pageview_last_scroll: 812,
    $prev_pageview_max_scroll: 1200,
    $prev_pageview_max_scroll_percentage: 1,
    $prev_pageview_pathname_bad: "/private",
  },
});
assert.ok(pageleave);
assert.equal(pageleave.properties.$prev_pageview_pathname, "/week/4");
assert.equal(pageleave.properties.$prev_pageview_max_scroll_percentage, 1);
assert.equal(pageleave.properties.$prev_pageview_duration, 18);
assert.equal(pageleave.properties.$prev_pageview_pathname_bad, undefined);

const returnedFromPrivacy = sanitizeEvent({
  event: "$pageview",
  properties: {
    $current_url: "https://sunkpick.com/",
    $prev_pageview_pathname: "/privacy",
    $prev_pageview_id: "privacy-pageview",
    $prev_pageview_duration: 22,
    $prev_pageview_max_scroll_percentage: 1,
    $prev_pageview_max_scroll: 900,
  },
});
assert.ok(returnedFromPrivacy);
for (const key of [
  "$prev_pageview_pathname",
  "$prev_pageview_id",
  "$prev_pageview_duration",
  "$prev_pageview_max_scroll_percentage",
  "$prev_pageview_max_scroll",
]) assert.equal(returnedFromPrivacy.properties[key], undefined, `privacy history leaked: ${key}`);

const heatmap = sanitizeEvent({
  event: "$$heatmap",
  properties: {
    distinct_id: "anonymous-id",
    $session_id: "session-id",
    $heatmap_data: {
      "https://www.sunkpick.com/week/1?utm_source=mail#top": [
        { x: 10, y: 20, target_fixed: false, type: "click", email: "drop" },
        { x: Number.NaN, y: 20, target_fixed: false, type: "click" },
        { x: 10, y: 20, target_fixed: false, type: "other" },
      ],
      "https://sunkpick.com/week/1?utm_campaign=mail": [
        { x: 30, y: 40, target_fixed: true, type: "mousemove" },
        { x: -1, y: 40, target_fixed: true, type: "click" },
        { x: 50, y: Infinity, target_fixed: true, type: "click" },
        { x: 50, y: 60, target_fixed: "yes", type: "click" },
      ],
      "https://sunkpick.com/privacy?email=jag%40example.com#top": [
        { x: 5, y: 6, target_fixed: false, type: "deadclick" },
      ],
      "https://evil.example/week/1": [
        { x: 1, y: 2, target_fixed: false, type: "click" },
      ],
      "https://sunkpick.com/week/0": [
        { x: 1, y: 2, target_fixed: false, type: "click" },
      ],
    },
    $elements_chain: "drop",
  },
});
assert.ok(heatmap);
assert.deepEqual(heatmap.properties.$heatmap_data, {
  "https://sunkpick.com/week/1": [
    { x: 10, y: 20, target_fixed: false, type: "click" },
    { x: 30, y: 40, target_fixed: true, type: "mousemove" },
  ],
});
assert.equal(heatmap.properties.$elements_chain, undefined);
const privacyHeatmap = sanitizeEvent({
  event: "$$heatmap",
  properties: {
    $heatmap_data: {
      "https://sunkpick.com/privacy?from=home#private": [
        { x: 1, y: 2, target_fixed: false, type: "click" },
      ],
    },
  },
});
assert.ok(privacyHeatmap);
assert.equal(privacyHeatmap.properties.$heatmap_data, undefined);

const vitals = sanitizeEvent({
  event: "$web_vitals",
  properties: {
    $current_url: "https://sunkpick.com/?utm_source=secret#fragment",
    $web_vitals_LCP_value: 1234,
    $web_vitals_LCP_event: { name: "LCP", value: 1234, attribution: { target: "Coach Jag" } },
    $web_vitals_INP_value: Infinity,
  },
});
assert.ok(vitals);
assert.equal(vitals.properties.$current_url, "https://sunkpick.com/");
assert.equal(vitals.properties.$web_vitals_LCP_value, 1234);
assert.equal(vitals.properties.$web_vitals_LCP_event, undefined);
assert.equal(vitals.properties.$web_vitals_INP_value, undefined);

assert.deepEqual(sanitizeProperties({ email: "jag@example.com", phone: "5127058862", safe: "drop" }), {
  $process_person_profile: true,
  $is_identified: false,
});
assert.deepEqual(sanitizeProperties(null), {
  $process_person_profile: true,
  $is_identified: false,
});
assert.equal(sanitizeEvent({ event: "$identify", properties: { distinct_id: "user" } }), null);
assert.equal(sanitizeEvent({ event: "arbitrary_event", properties: { page_path: "/" } }), null);



for (const event of ["section_engagement", "content_copied"]) {
  const result = sanitizeEvent({ event, properties: { section: "recap", week: 5, active_seconds: 12, clipboard: "private text", selection: "private text" } });
  assert.equal(result.event, event);
  assert.equal(result.properties.section, "recap");
  assert.equal(result.properties.clipboard, undefined);
  assert.equal(result.properties.selection, undefined);
}

const auto = sanitizeEvent({ event: '$autocapture', properties: { $event_type: 'click',
  $elements_chain: 'a.private:nth-child="2"nth-of-type="1"href="sms:+15555555555"text="Private";div:nth-child="1"nth-of-type="1"',
  $elements: [{ attr__href: 'sms:+15555555555' }], $el_text: 'Private', $external_click_url: 'https://example.com/?secret=123' } });
assert.equal(auto.properties.$elements_chain, 'a:nth-child="2"nth-of-type="1";div:nth-child="1"nth-of-type="1"');
assert.equal(auto.properties.$el_text, undefined);
assert.equal(auto.properties.$elements, undefined);
assert.equal(auto.properties.$external_click_url, undefined);
const snapshotData = [{ type: 4, data: { href: 'https://sunkpick.com/week/5' } }];
const replay = sanitizeEvent({ event: '$snapshot', $set: { email: 'private@example.com' }, properties: {
  $snapshot_data: snapshotData, $snapshot_bytes: 128, $snapshot_host: 'sunkpick.com',
  $current_url: 'https://sunkpick.com/week/5?secret=123', $session_id: 'test-session', token: 'test-token' } });
assert.equal(replay.properties.$snapshot_data, snapshotData, 'preserve recorder-filtered rrweb payload for playback');
assert.equal(replay.properties.$current_url, 'https://sunkpick.com/week/5');
assert.equal(replay.properties.$process_person_profile, false);
assert.equal(replay.$set, undefined);
assert.equal(sanitizeEvent({ event: '$snapshot', properties: { $snapshot_data: 'invalid', $snapshot_bytes: 1 } }), null);
assert.equal(sanitizeEvent({ event: '$snapshot', properties: { $snapshot_data: [], $snapshot_bytes: Infinity } }), null);

console.log("analytics checks passed");
