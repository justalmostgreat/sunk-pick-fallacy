"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { PostHog } from "posthog-js";
import { safeAttribution, safePagePath, sanitizeEvent } from "@/lib/analytics";
import { OPEN_ANALYTICS_SETTINGS, readAnalyticsConsent, saveAnalyticsConsent, serverAnalyticsConsent, subscribeAnalyticsConsent } from "@/lib/analytics-consent";
import { trackVisit } from "@/lib/track-visit";

// Project tokens are public ingestion identifiers, never personal/admin API keys.
const projectToken = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const testMode = process.env.NEXT_PUBLIC_ANALYTICS_TEST_MODE === "true";
const configured = /^phc_[a-zA-Z0-9]+$/.test(projectToken);
let sdk: PostHog | undefined;
let loading: Promise<PostHog | null> | undefined;
let trackingActive = false;

function permittedHost() {
  return /^(www\.)?sunkpick\.com$/.test(location.hostname)
    || (testMode && ["localhost", "127.0.0.1"].includes(location.hostname));
}

function loadAnalytics(): Promise<PostHog | null> {
  if (!configured || !permittedHost() || readAnalyticsConsent() !== "allowed") return Promise.resolve(null);
  if (sdk) { sdk.opt_in_capturing({ captureEventName: false }); trackingActive = true; return Promise.resolve(sdk); }
  loading ??= import("posthog-js").then(({ default: posthog }) => {
    if (readAnalyticsConsent() !== "allowed") return null;
    posthog.init(projectToken, {
      api_host: apiHost,
      ui_host: apiHost.includes("eu.i.posthog.com") ? "https://eu.posthog.com" : "https://us.posthog.com",
      defaults: "2026-05-30",
      persistence: "localStorage+cookie",
      cross_subdomain_cookie: true,
      cookie_expiration: 180,
      secure_cookie: location.protocol === "https:",
      person_profiles: "never",
      autocapture: false,
      capture_pageview: false,
      // Native session duration is elapsed time; custom engagement events measure active time.
      capture_pageleave: true,
      capture_heatmaps: true,
      capture_dead_clicks: false,
      capture_performance: testMode ? false : { web_vitals: true, web_vitals_attribution: false },
      capture_exceptions: false,
      disable_session_recording: true,
      enable_recording_console_log: false,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      disable_compression: testMode,
      advanced_disable_flags: true,
      disable_capture_url_hashes: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      save_campaign_params: false,
      save_referrer: false,
      respect_dnt: true,
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      before_send: event => {
        const path = safePagePath(location.pathname);
        if (readAnalyticsConsent() !== "allowed" || !path || path === "/privacy") return null;
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
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, readAnalyticsConsent, serverAnalyticsConsent);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener(OPEN_ANALYTICS_SETTINGS, open);
    return () => window.removeEventListener(OPEN_ANALYTICS_SETTINGS, open);
  }, []);

  useEffect(() => {
    if (consent !== "allowed") {
      if (sdk && trackingActive) {
        sdk.opt_out_capturing();
        // Reset while opted out: erase persisted IDs and start fresh if they later opt in.
        sdk.reset(true);
        sdk.opt_out_capturing();
        trackingActive = false;
      }
      return;
    }
    const path = safePagePath(pathname ?? "");
    if (!path || path === "/privacy") return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void loadAnalytics().then(posthog => {
      if (cancelled || !posthog || readAnalyticsConsent() !== "allowed") return;
      const attribution = safeAttribution(location.href, document.referrer);
      posthog.capture("$pageview", {
        $current_url: `https://sunkpick.com${path}`, page_path: path, ...attribution,
        $referrer: attribution.referrer_origin ?? "$direct",
        $referring_domain: attribution.referrer_origin ? new URL(attribution.referrer_origin).hostname : "$direct",
      });
      stop = trackVisit(path, (name, properties) => {
        if (readAnalyticsConsent() === "allowed") posthog.capture(name, { ...properties, $current_url: `https://sunkpick.com${path}` });
      });
    });
    return () => { cancelled = true; stop?.(); };
  }, [consent, pathname]);

  const visible = settingsOpen || (configured && consent === "unset");
  if (!visible || consent === "loading") return null;
  const choose = (value: "allowed" | "declined") => { saveAnalyticsConsent(value); setSettingsOpen(false); };
  return <aside className="analytics-choice" aria-labelledby="analytics-title">
    <div>
      <h2 id="analytics-title">Help improve the program</h2>
      <p>{consent === "blocked"
        ? "Your browser’s privacy signal has turned visit analytics off."
        : !configured
          ? "Detailed visit analytics is not enabled yet."
          : "Allow visit analytics to show which stories get attention and what could work better? We use an unnamed browser ID, clicks and scrolls. No session recordings."} <Link href="/privacy">Privacy details</Link></p>
    </div>
    <div className="analytics-actions">
      {configured && consent !== "blocked" && <>
        <button type="button" onClick={() => choose("declined")}>{consent === "allowed" ? "Turn analytics off" : "No thanks"}</button>
        <button type="button" onClick={() => choose("allowed")}>{consent === "allowed" ? "Keep analytics on" : "Allow analytics"}</button>
      </>}
      {settingsOpen && <button type="button" onClick={() => setSettingsOpen(false)}>Close</button>}
    </div>
  </aside>;
}
