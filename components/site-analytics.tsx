"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PostHog } from "posthog-js";
import { safeAttribution, safePagePath, sanitizeEvent } from "@/lib/analytics";
import { analyticsEnabled, OPEN_ANALYTICS_SETTINGS, readAnalyticsConsent, saveAnalyticsConsent, serverAnalyticsConsent, subscribeAnalyticsConsent } from "@/lib/analytics-consent";
import { trackVisit } from "@/lib/track-visit";
import { replayOptions } from "@/lib/analytics-replay";

// Project tokens are public ingestion identifiers, never personal/admin API keys.
const projectToken = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const testMode = process.env.NEXT_PUBLIC_ANALYTICS_TEST_MODE === "true";
const configured = /^phc_[a-zA-Z0-9]+$/.test(projectToken);
let sdk: PostHog | undefined;
let loading: Promise<PostHog | null> | undefined;
let trackingActive = false;

function stopAnalytics() {
  if (!sdk || !trackingActive) return;
  sdk.stopSessionRecording();
  sdk.opt_out_capturing();
  sdk.reset(true);
  sdk.opt_out_capturing();
  trackingActive = false;
}

function permittedHost() {
  return /^(www\.)?sunkpick\.com$/.test(location.hostname)
    || (testMode && ["localhost", "127.0.0.1"].includes(location.hostname));
}

function loadAnalytics(): Promise<PostHog | null> {
  if (!configured || !permittedHost() || !analyticsEnabled(readAnalyticsConsent())) return Promise.resolve(null);
  if (sdk) {
    sdk.opt_in_capturing({ captureEventName: false });
    sdk.startSessionRecording();
    trackingActive = true;
    return Promise.resolve(sdk);
  }
  loading ??= import("posthog-js").then(({ default: posthog }) => {
    if (!analyticsEnabled(readAnalyticsConsent())) return null;
    posthog.init(projectToken, {
      api_host: apiHost,
      ui_host: apiHost.includes("eu.i.posthog.com") ? "https://eu.posthog.com" : "https://us.posthog.com",
      defaults: "2026-05-30",
      persistence: "localStorage+cookie",
      persistence_save_debounce_ms: 0,
      cross_subdomain_cookie: true,
      cookie_expiration: 180,
      secure_cookie: location.protocol === "https:",
      person_profiles: "always",
      autocapture: {
        dom_event_allowlist: ["click"],
        element_allowlist: ["a", "button"],
        css_selector_ignorelist: [".ph-no-capture", ".ph-no-autocapture", "[data-ph-no-autocapture]", "a[href^='sms:' i]", "a[href^='tel:' i]", "a[href^='mailto:' i]", "input", "textarea", "select", "[contenteditable]", "[data-analytics-private]", ".analytics-choice"],
      },
      capture_pageview: false,
      // Native session duration is elapsed time; custom engagement events measure active time.
      capture_pageleave: true,
      capture_heatmaps: true,
      capture_dead_clicks: {
        capture_dead_swipes: false,
        css_selector_ignorelist: [".ph-no-deadclick", ".ph-no-capture", "a[href^='sms:' i]", "a[href^='tel:' i]", "a[href^='mailto:' i]", "input", "textarea", "select", "[contenteditable]", "[data-analytics-private]", ".analytics-choice"],
      },
      capture_performance: { web_vitals: true, web_vitals_attribution: false, network_timing: true },
      capture_exceptions: false,
      disable_session_recording: false,
      session_recording: replayOptions,
      enable_recording_console_log: false,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      disable_compression: testMode,
      advanced_disable_flags: false,
      advanced_disable_feature_flags_on_first_load: true,
      disable_capture_url_hashes: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      save_campaign_params: false,
      save_referrer: false,
      respect_dnt: true,
      opt_out_capturing_by_default: false,
      // Automatic collection is enabled above; an actual opt-out still clears storage.
      opt_out_persistence_by_default: true,
      before_send: event => {
        const path = safePagePath(location.pathname);
        if (!analyticsEnabled(readAnalyticsConsent()) || !path || path === "/privacy") return null;
        return sanitizeEvent(event);
      },
    });
    sdk = posthog;
    posthog.opt_in_capturing({ captureEventName: false });
    trackingActive = true;
    return posthog;
  }).catch(() => null).finally(() => { loading = undefined; });
  return loading;
}

export function AnalyticsSettingsButton() {
  return <button type="button" className="analytics-settings" onClick={() => window.dispatchEvent(new Event(OPEN_ANALYTICS_SETTINGS))}>Analytics choices</button>;
}

export function SiteAnalytics() {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, readAnalyticsConsent, serverAnalyticsConsent);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener(OPEN_ANALYTICS_SETTINGS, open);
    return () => window.removeEventListener(OPEN_ANALYTICS_SETTINGS, open);
  }, []);

  useEffect(() => {
    if (!analyticsEnabled(consent)) {
      stopAnalytics();
      return;
    }
    const path = safePagePath(location.pathname);
    if (!path || path === "/privacy") return;
    let cancelled = false;
    let visitRun = 0;
    let stop: (() => void) | undefined;
    const startVisit = () => {
      const run = ++visitRun;
      void loadAnalytics().then(posthog => {
        if (cancelled || run !== visitRun || !posthog || !analyticsEnabled(readAnalyticsConsent())) return;
        stop?.();
        const attribution = safeAttribution(location.href, document.referrer);
        posthog.capture("$pageview", {
          $current_url: `https://sunkpick.com${path}`, page_path: path, ...attribution,
          $referrer: attribution.referrer_origin ?? "$direct",
          $referring_domain: attribution.referrer_origin ? new URL(attribution.referrer_origin).hostname : "$direct",
        });
        stop = trackVisit(path, (name, properties) => {
          if (analyticsEnabled(readAnalyticsConsent())) posthog.capture(name, { ...properties, $current_url: `https://sunkpick.com${path}` });
        });
      });
    };
    // Every route uses normal document links. A browser-cache restoration is a new visit too.
    const restore = (event: PageTransitionEvent) => { if (event.persisted) startVisit(); };
    window.addEventListener("pageshow", restore);
    startVisit();
    return () => { cancelled = true; stop?.(); window.removeEventListener("pageshow", restore); };
  }, [consent]);

  if (consent === "loading") return null;
  const enabled = analyticsEnabled(consent);
  const choose = (value: "allowed" | "declined") => {
    // Stop synchronously before reset can flush the recorder's buffer.
    if (value === "declined") stopAnalytics();
    saveAnalyticsConsent(value);
    setSettingsOpen(false);
  };
  // A visible notice, with no sign-in or accept step. Existing opt-outs and
  // browser privacy signals take precedence over this site's default setting.
  if (!settingsOpen) return configured && enabled ? <aside className="analytics-notice" data-analytics-private="true">
    <span>Visit stats and replays are on.</span>
    <button type="button" onClick={() => choose("declined")}>Turn off</button>
  </aside> : null;
  return <aside className="analytics-choice" aria-labelledby="analytics-title">
    <div>
      <h2 id="analytics-title">Help improve the site</h2>
      <p>{consent === "blocked"
        ? "Your browser’s privacy signal has turned visit analytics off."
        : !configured
          ? "Detailed visit analytics is not enabled yet."
          : `Visit stats and replays are ${enabled ? "on" : "off"}.`}</p>
    </div>
    <div className="analytics-actions">
      {configured && consent !== "blocked" && <>
        <button type="button" onClick={() => choose("declined")}>{enabled ? "Turn off" : "Keep off"}</button>
        <button type="button" onClick={() => choose("allowed")}>{enabled ? "Keep on" : "Turn on"}</button>
      </>}
      {settingsOpen && <button type="button" onClick={() => setSettingsOpen(false)}>Close</button>}
    </div>
  </aside>;
}
