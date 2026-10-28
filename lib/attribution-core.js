// Which ad brought a visitor: pure helpers shared by the browser
// (components/marketing-tags.js) and the server (lib/attribution.js).

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

// the ad details in a landing URL, or null when it has none
export function parseAttribution(href, now = Date.now()) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const out = {};
  for (const k of [...UTM_KEYS, "fbclid"]) {
    const v = (url.searchParams.get(k) || "").trim().slice(0, 200);
    if (v) out[k] = v;
  }
  if (!Object.keys(out).length) return null;
  out.first_landing_url = `${url.origin}${url.pathname}${url.search}`.slice(0, 500);
  out.landed_at = new Date(now).toISOString();
  return out;
}

// first touch wins: an existing cookie is never replaced
export const firstTouch = (existing, incoming) => existing || incoming || null;

// Meta's click cookie, built from fbclid the way the Pixel does
export const fbcFrom = (fbclid, now = Date.now()) => (fbclid ? `fb.1.${now}.${fbclid}` : null);

// where cookies for ads need a yes first (EU, EEA, UK, Switzerland)
const CONSENT = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH"]);
export const consentRequired = (country) => CONSENT.has(String(country || "").toUpperCase());

// pages that never load ad tags: the app itself, admin, and anything a
// business's own customer sees (documents, payment, receipts)
const PRIVATE = ["/app", "/admin", "/d/", "/pay", "/r/", "/print", "/consultant", "/offline", "/invite", "/media", "/api"];
export const adTagsAllowed = (path) => !PRIVATE.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path === p);

// "ng_test_1" → NG, "uk_test_1" → UK (the country is the campaign's prefix)
export function countryFromCampaign(campaign) {
  const m = /^([a-z]{2})(?:[_\-\s]|$)/i.exec(String(campaign || "").trim());
  return m ? m[1].toUpperCase() : null;
}

// pulls utm_content / utm_campaign out of an ad's url_tags or link
export function utmFromAdCreative(creative) {
  const found = {};
  const take = (q) => {
    const p = new URLSearchParams(String(q || "").replace(/^[^?]*\?/, ""));
    for (const k of ["utm_content", "utm_campaign"]) if (!found[k] && p.get(k)) found[k] = p.get(k);
  };
  take(creative?.url_tags);
  const spec = creative?.object_story_spec || {};
  take(spec.link_data?.link);
  take(spec.link_data?.call_to_action?.value?.link);
  take(spec.video_data?.call_to_action?.value?.link);
  for (const a of spec.template_data?.child_attachments || spec.link_data?.child_attachments || []) take(a?.link);
  return found;
}
