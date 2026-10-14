export type AnalyticsConsent = "loading" | "unset" | "allowed" | "declined" | "blocked";

const PREFERENCE = "spf_analytics_v1";
const CHANGED = "spf:analytics-choice";
export const OPEN_ANALYTICS_SETTINGS = "spf:analytics-settings";

export function analyticsBlocked() {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
    || navigator.doNotTrack === "1";
}

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof document === "undefined") return "loading";
  if (analyticsBlocked()) return "blocked";
  try {
    const cookie = document.cookie.split("; ").find(value => value.startsWith(`${PREFERENCE}=`))?.split("=")[1];
    const value = cookie ?? localStorage.getItem(PREFERENCE);
    return value === "allowed" || value === "declined" ? value : "unset";
  } catch {
    return "unset";
  }
}

export function saveAnalyticsConsent(value: "allowed" | "declined") {
  const domain = /^(www\.)?sunkpick\.com$/.test(location.hostname) ? "; Domain=sunkpick.com" : "";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFERENCE}=${value}; Path=/; Max-Age=15552000; SameSite=Lax${domain}${secure}`;
  try { localStorage.setItem(PREFERENCE, value); } catch { /* Cookie remains the fallback. */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function subscribeAnalyticsConsent(callback: () => void) {
  window.addEventListener(CHANGED, callback);
  window.addEventListener("storage", callback);
  window.addEventListener("focus", callback);
  window.addEventListener("pageshow", callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener("storage", callback);
    window.removeEventListener("focus", callback);
    window.removeEventListener("pageshow", callback);
  };
}

export const serverAnalyticsConsent = (): AnalyticsConsent => "loading";
