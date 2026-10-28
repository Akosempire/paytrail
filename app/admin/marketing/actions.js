"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { encryptSecret, hint } from "@/lib/crypto";
import { forgetMarketingSettings, marketingSettings } from "@/lib/meta";
import { GRAPH_VERSION } from "@/lib/meta-core";

const SQL = "Run RUN_NEW_2026-10-28a.sql in Supabase first, then try again.";
const done = () => { forgetMarketingSettings(); revalidatePath("/admin/marketing"); revalidatePath("/site-config.json"); };
const ask = async (path, token, params = {}) => {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}?${q}`, { signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || `Meta answered ${r.status}`);
  return j;
};

// Meta connection: tokens checked with Meta before saving, stored encrypted.
// An empty token box keeps the saved one.
export async function saveMetaConnection(form) {
  await requirePlatformAdmin();
  const cfg = await marketingSettings();
  if (!cfg.ready) return { error: SQL };
  const account = String(form.adAccountId || "").trim().replace(/^act_/, "");
  const pixel = String(form.pixelId || "").trim();
  const token = String(form.accessToken || "").trim(), capi = String(form.capiToken || "").trim();
  if (account && !/^\d{5,20}$/.test(account)) return { error: "The ad account ID is the number in Ads Manager (act_ is optional)." };
  if (pixel && !/^\d{8,20}$/.test(pixel)) return { error: "The Pixel ID is a long number (Events Manager → Data sources)." };
  const useToken = token || cfg.accessToken;
  let note = "";
  if (token || (account && account !== cfg.adAccountId && useToken)) {
    try {
      const a = await ask(`act_${account || cfg.adAccountId}`, useToken, { fields: "name,currency" });
      note = ` Connected to "${a.name}" (${a.currency}).`;
    } catch (e) { return { error: `Meta didn't accept the access token for this ad account: ${e.message}` }; }
  }
  if (capi && (pixel || cfg.pixelId)) {
    try { await ask(pixel || cfg.pixelId, capi, { fields: "id" }); }
    catch (e) { return { error: `Meta didn't accept the Conversions API token for this Pixel: ${e.message}` }; }
  }
  const row = { meta_ad_account_id: account || null, meta_pixel_id: pixel || null, updated_at: new Date().toISOString() };
  if (token) { row.meta_access_token_enc = encryptSecret(token); row.meta_access_token_hint = hint(token); }
  if (capi) { row.meta_capi_token_enc = encryptSecret(capi); row.meta_capi_token_hint = hint(capi); }
  if (form.clearAccessToken) { row.meta_access_token_enc = null; row.meta_access_token_hint = null; }
  if (form.clearCapiToken) { row.meta_capi_token_enc = null; row.meta_capi_token_hint = null; }
  const { error } = await createSupabaseService().from("marketing_settings").update(row).eq("id", true);
  if (error) return { error: error.message };
  done();
  return { message: `Meta connection saved.${note} The Pixel starts loading on the live site within 5 minutes.` };
}

// thresholds, report email, reports on/off
export async function saveMarketingSettings(form) {
  await requirePlatformAdmin();
  const num = (v, min, max) => { const n = Number(String(v ?? "").replace(/[, ]/g, "")); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
  const row = {
    kill_spend_no_signup: num(form.kill, 0, 1e9), max_cost_per_signup: num(form.maxCps, 0, 1e9),
    scale_min_signups: num(form.scaleMin, 1, 1e6), ngn_per_usd: num(form.rate, 1, 1e6),
  };
  for (const [k, v] of Object.entries(row)) if (v == null) return { error: `Check "${{ kill_spend_no_signup: "Kill after spending", max_cost_per_signup: "Most per sign-up", scale_min_signups: "Scale after", ngn_per_usd: "₦ per $1" }[k]}". Use a number.` };
  row.scale_min_signups = Math.round(row.scale_min_signups);
  const email = String(form.reportEmail || "").trim().toLowerCase();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid report email." };
  Object.assign(row, { report_email: email || null, reports_enabled: Boolean(form.reportsEnabled), updated_at: new Date().toISOString() });
  const { error } = await createSupabaseService().from("marketing_settings").update(row).eq("id", true);
  if (error) return { error: /relation|schema cache/i.test(error.message) ? SQL : error.message };
  done();
  return { message: email && row.reports_enabled ? `Saved. Reports go to ${email} every 6 hours.` : "Saved." };
}

// "Sync now": the same job as the 6-hourly one, run here (admin only)
export async function syncNow() {
  await requirePlatformAdmin();
  const { runMarketingSync } = await import("@/lib/marketing");
  const r = await runMarketingSync({ trigger: "admin" }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
  done();
  if (!r.ok) return { error: [r.skipped, r.error].filter(Boolean).join(" ") || "The sync didn't finish." };
  if (r.skipped) return { message: r.skipped };
  return { message: `Synced ${r.rows} ad-day row${r.rows === 1 ? "" : "s"}.${r.status === "sent" ? " Report emailed." : ""}` };
}
