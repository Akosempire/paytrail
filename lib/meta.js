import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { GRAPH_VERSION, capiEvent } from "@/lib/meta-core";

// Admin → Marketing settings: thresholds, report email and the Meta
// connection (tokens stored encrypted, set in the dashboard). Vercel
// variables META_* are only a fallback. Read with the service key, kept 30s.
let cache = null;
export function forgetMarketingSettings() { cache = null; }

export async function marketingSettings() {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  let row = null;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { data } = await createSupabaseService().from("marketing_settings").select("*").eq("id", true).maybeSingle();
      row = data || null;
    } catch { row = null; }
  }
  const dec = (v) => { try { return v ? decryptSecret(v) : ""; } catch { return ""; } };
  const value = {
    ready: Boolean(row), // the marketing SQL has run
    row: row || {},
    thresholds: {
      kill_spend_no_signup: Number(row?.kill_spend_no_signup ?? 3000), max_cost_per_signup: Number(row?.max_cost_per_signup ?? 1500),
      scale_min_signups: Number(row?.scale_min_signups ?? 3), ngn_per_usd: Number(row?.ngn_per_usd ?? 1500),
    },
    reportEmail: row?.report_email || "",
    reportsEnabled: row ? row.reports_enabled !== false : false,
    adAccountId: String(row?.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, ""),
    pixelId: String(row?.meta_pixel_id || process.env.META_PIXEL_ID || ""),
    accessToken: dec(row?.meta_access_token_enc) || process.env.META_ACCESS_TOKEN || "",
    capiToken: dec(row?.meta_capi_token_enc) || process.env.META_CAPI_TOKEN || "",
  };
  cache = { at: Date.now(), value };
  return value;
}

// Sends events to the Conversions API. Never throws and never blocks sign-up
// or payment: a failure is logged and kept as the last error.
export async function sendMetaEvents(events) {
  const list = (events || []).filter(Boolean);
  if (!list.length) return { sent: false, reason: "nothing" };
  const cfg = await marketingSettings().catch(() => null);
  if (!cfg?.pixelId || !cfg?.capiToken) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(cfg.pixelId)}/events?access_token=${encodeURIComponent(cfg.capiToken)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: list.map(capiEvent) }), signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error("meta.capi_failed", { status: res.status, detail, events: list.map((e) => e.name) });
      return { sent: false, reason: `Meta answered ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("meta.capi_failed", { message: e.message, events: list.map((e) => e.name) });
    return { sent: false, reason: e.message };
  }
}
