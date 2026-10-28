import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { marketingSettings } from "@/lib/meta";
import { GRAPH_VERSION } from "@/lib/meta-core";
import { countryFromCampaign, utmFromAdCreative } from "@/lib/attribution-core";
import { metrics, verdict, revenueIn, spendDeltaByAd, headline, VERDICT } from "@/lib/marketing-core";
import { sendEmail } from "@/lib/email";
import { moneyIn } from "@/lib/marketing-format";
import { siteUrl } from "@/lib/site";

// Admin → Marketing: pulls each Meta ad's results, matches sign-ups and
// payments in our own database to the ad (by utm_content, then campaign),
// gives each ad a verdict and emails a report. Run every 6 hours by Vercel
// Cron (/api/cron/marketing) and by "Sync now". Never throws.

const day = (d) => d.toISOString().slice(0, 10);
const graph = (path, token, params = {}) => {
  const q = new URLSearchParams({ ...params, access_token: token });
  return fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}?${q}`, { signal: AbortSignal.timeout(20000) }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error?.message ? `Meta: ${j.error.message}` : `Meta answered ${r.status}`);
    return j;
  });
};
const action = (list, ...types) => (list || []).filter((a) => types.includes(a.action_type)).reduce((t, a) => t + Number(a.value || 0), 0);

// 1. Meta → ad_insights (last 7 days, one row per ad per day)
export async function syncInsights(service, cfg) {
  if (!cfg.accessToken || !cfg.adAccountId) return { rows: 0, skipped: "Add the Meta access token and ad account ID in Admin → Marketing." };
  const fields = "ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,inline_link_clicks,actions,account_currency";
  let page = await graph(`act_${cfg.adAccountId}/insights`, cfg.accessToken, { level: "ad", time_increment: "1", date_preset: "last_7d", fields, limit: "500" });
  const raw = [];
  for (let i = 0; i < 20; i++) {
    raw.push(...(page.data || []));
    if (!page.paging?.next) break;
    page = await fetch(page.paging.next, { signal: AbortSignal.timeout(20000) }).then((r) => r.json());
  }
  // each ad's utm_content / utm_campaign from its link (fetched once, then cached)
  const ids = [...new Set(raw.map((r) => r.ad_id))];
  const { data: known } = ids.length ? await service.from("ad_insights").select("ad_id, utm_content, utm_campaign").in("ad_id", ids).not("utm_content", "is", null) : { data: [] };
  const utm = Object.fromEntries((known || []).map((k) => [k.ad_id, { utm_content: k.utm_content, utm_campaign: k.utm_campaign }]));
  for (const id of ids.filter((id) => !utm[id])) {
    try { utm[id] = utmFromAdCreative((await graph(id, cfg.accessToken, { fields: "creative{url_tags,object_story_spec}" })).creative); } catch { utm[id] = {}; }
  }
  const now = new Date().toISOString();
  const rows = raw.map((r) => {
    const u = utm[r.ad_id] || {};
    return {
      date: r.date_start, ad_id: r.ad_id, ad_name: r.ad_name || "", adset_name: r.adset_name || "", campaign_name: r.campaign_name || "",
      utm_content: u.utm_content || null, utm_campaign: u.utm_campaign || null,
      country: countryFromCampaign(u.utm_campaign) || countryFromCampaign(r.campaign_name) || countryFromCampaign(r.adset_name),
      spend: Number(r.spend || 0), currency: r.account_currency || "", impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0),
      link_clicks: Number(r.inline_link_clicks || 0), landing_page_views: action(r.actions, "landing_page_view", "omni_landing_page_view"),
      meta_registrations: action(r.actions, "complete_registration", "offsite_conversion.fb_pixel_complete_registration", "omni_complete_registration"),
      synced_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await service.from("ad_insights").upsert(rows.slice(i, i + 200), { onConflict: "date,ad_id" });
    if (error) throw new Error(`Saving ad results: ${error.message}`);
  }
  return { rows: rows.length };
}

// today's (and yesterday's) spend per ad, for working out "last 6h" later
export async function spendSnapshot(service) {
  const today = day(new Date()), yesterday = day(new Date(Date.now() - 86400000));
  const { data } = await service.from("ad_insights").select("date, ad_id, spend").in("date", [today, yesterday]);
  const snap = { date: today, today: {}, yesterday: {} };
  for (const r of data || []) snap[r.date === today ? "today" : "yesterday"][r.ad_id] = Number(r.spend);
  return snap;
}

export const PERIODS = { "6h": "Last 6 hours", today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" };
function windowOf(period) {
  const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "6h") return { since: new Date(now - 6 * 3600_000), fromDate: day(start) };
  if (period === "7d") return { since: new Date(start - 6 * 86400000), fromDate: day(new Date(start - 6 * 86400000)) };
  if (period === "30d") return { since: new Date(start - 29 * 86400000), fromDate: day(new Date(start - 29 * 86400000)) };
  return { since: start, fromDate: day(start) };
}

// 2. The numbers for one period (and country): per ad, plus totals
export async function periodReport(service, cfg, period = "today", { country = "all", prevSnapshot = null } = {}) {
  const { since, fromDate } = windowOf(period);
  const [{ data: ins }, { data: biz }, { data: pays }] = await Promise.all([
    service.from("ad_insights").select("*").gte("date", fromDate).limit(20000),
    service.from("businesses").select("id, created_at, utm_content, utm_campaign, trial_ends_at, subscription_status").gte("created_at", since.toISOString()).limit(20000),
    service.from("subscription_payments").select("business_id, amount_minor, currency, created_at, businesses(utm_content, utm_campaign)").gt("amount_minor", 0).gte("created_at", since.toISOString()).limit(20000),
  ]);
  const accountCurrency = (ins || []).find((r) => r.currency)?.currency || "NGN";
  const delta = period === "6h" && prevSnapshot ? spendDeltaByAd(prevSnapshot, await spendSnapshot(service)) : null;

  // ads, summed over the days in the window
  const ads = {};
  for (const r of ins || []) {
    const a = (ads[r.ad_id] ||= { ad_id: r.ad_id, name: r.ad_name || r.ad_id, campaign: r.campaign_name, country: r.country || null, utm_content: r.utm_content, utm_campaign: r.utm_campaign, spend: 0, link_clicks: 0, landing_page_views: 0, meta_registrations: 0 });
    if (r.date >= a.lastDate || !a.lastDate) { a.name = r.ad_name || a.name; a.lastDate = r.date; }
    a.spend += Number(r.spend); a.link_clicks += Number(r.link_clicks); a.landing_page_views += Number(r.landing_page_views); a.meta_registrations += Number(r.meta_registrations);
  }
  if (delta) for (const a of Object.values(ads)) a.spend = delta[a.ad_id] || 0; // 6h: spend since the last sync
  // match a business to an ad: utm_content first (one per ad), then the campaign
  const byContent = {}, byCampaign = {};
  for (const a of Object.values(ads)) { if (a.utm_content) byContent[a.utm_content] ||= a; if (a.utm_campaign) (byCampaign[a.utm_campaign] ||= []).push(a); }
  const adFor = (u) => (u?.utm_content && byContent[u.utm_content]) || (u?.utm_campaign && byCampaign[u.utm_campaign]?.length === 1 ? byCampaign[u.utm_campaign][0] : null);
  let otherSignups = 0;
  for (const b of biz || []) {
    const a = adFor(b);
    if (!a) { otherSignups += 1; continue; }
    a.signups = (a.signups || 0) + 1;
    if (b.trial_ends_at || b.subscription_status === "trialing") a.trials = (a.trials || 0) + 1;
  }
  const paidBy = {};
  for (const p of pays || []) {
    const a = adFor(p.businesses);
    if (!a) continue;
    (paidBy[a.ad_id] ||= { payments: [], businesses: new Set() }).payments.push(p);
    paidBy[a.ad_id].businesses.add(p.business_id);
  }
  const rows = Object.values(ads).map((a) => {
    const pb = paidBy[a.ad_id];
    const m = metrics({ ...a, signups: a.signups || 0, trials: a.trials || 0, paid: pb ? pb.businesses.size : 0, revenue: pb ? revenueIn(accountCurrency, pb.payments, cfg.thresholds.ngn_per_usd) : 0 });
    return { ...a, ...m, meta_registrations: a.meta_registrations, verdict: verdict(m, cfg.thresholds) };
  }).filter((r) => country === "all" || (r.country || "") === country)
    .filter((r) => r.spend > 0 || r.signups > 0 || r.paid > 0)
    .sort((a, b) => b.spend - a.spend);
  const sum = (k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const totals = metrics({ spend: sum("spend"), link_clicks: sum("link_clicks"), landing_page_views: sum("landing_page_views"), signups: sum("signups"), trials: sum("trials"), paid: sum("paid"), revenue: sum("revenue") });
  return { period, label: PERIODS[period] || period, accountCurrency, rows, totals, otherSignups: country === "all" ? otherSignups : null, spendKnown: period !== "6h" || Boolean(delta) };
}

// daily spend and sign-ups, last 14 days (dashboard chart)
export async function trend(service, { country = "all" } = {}) {
  const from = new Date(Date.now() - 13 * 86400000);
  const [{ data: ins }, { data: biz }] = await Promise.all([
    service.from("ad_insights").select("date, spend, country, utm_content").gte("date", day(from)).limit(20000),
    service.from("businesses").select("created_at, utm_content").gte("created_at", `${day(from)}T00:00:00Z`).not("utm_content", "is", null).limit(20000),
  ]);
  const contentCountry = Object.fromEntries((ins || []).filter((r) => r.utm_content).map((r) => [r.utm_content, r.country]));
  const days = Array.from({ length: 14 }, (_, i) => day(new Date(from.getTime() + i * 86400000)));
  const out = Object.fromEntries(days.map((d) => [d, { date: d, spend: 0, signups: 0 }]));
  for (const r of ins || []) if (out[r.date] && (country === "all" || r.country === country)) out[r.date].spend += Number(r.spend);
  for (const b of biz || []) {
    const d = String(b.created_at).slice(0, 10);
    if (out[d] && contentCountry[b.utm_content] !== undefined && (country === "all" || contentCountry[b.utm_content] === country)) out[d].signups += 1;
  }
  return days.map((d) => out[d]);
}

// 3. The report email
export function reportEmail({ reports, rows, accountCurrency }) {
  const money = moneyIn(accountCurrency);
  const [six, today, week] = reports;
  const best = [...rows].filter((r) => r.signups > 0).sort((a, b) => (a.cost_per_signup ?? 1e12) - (b.cost_per_signup ?? 1e12))[0];
  const subject = `Usetally ads · last 6h: ${six.spendKnown ? money(six.totals.spend) : "—"} spent · ${six.totals.signups} sign-up${six.totals.signups === 1 ? "" : "s"} · best: ${best?.name || "none yet"}`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const block = (r) => `<td style="padding:10px;border:1px solid #e3ded2;border-radius:10px;vertical-align:top;width:33%">
    <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#86837a;text-transform:uppercase">${esc(r.label)}</div>
    <div style="font-size:18px;font-weight:700;margin-top:4px">${r.spendKnown ? money(r.totals.spend) : "—"}</div>
    <div style="font-size:12px;color:#5d5b53;line-height:1.6">${r.totals.signups} sign-ups<br>${r.totals.cost_per_signup != null ? `${money(r.totals.cost_per_signup)} each` : "—"}<br>${r.totals.paid} paid · ${money(r.totals.revenue)}</div></td>`;
  const tr = rows.map((r) => `<tr><td style="padding:8px 6px;border-bottom:1px solid #eee">${VERDICT[r.verdict].emoji} <b>${esc(r.name)}</b>${r.country ? ` <span style="color:#86837a">${esc(r.country)}</span>` : ""}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right">${money(r.spend)}</td><td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right">${r.signups}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right">${r.cost_per_signup != null ? money(r.cost_per_signup) : "—"}</td><td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right">${r.paid}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#151513">
  <div style="max-width:600px;margin:0 auto;padding:20px 14px">
    <div style="background:#fff;border-radius:16px;padding:20px">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#175cd3;text-transform:uppercase">Usetally ads</div>
      <p style="font-size:17px;font-weight:600;line-height:1.45;margin:8px 0 16px">${esc(headline(rows, money))}</p>
      <table role="presentation" width="100%" cellspacing="6" style="border-collapse:separate"><tr>${reports.map(block).join("")}</tr></table>
      <p style="font-size:12px;font-weight:700;letter-spacing:1px;color:#86837a;text-transform:uppercase;margin:18px 0 6px">Ads · last 7 days</p>
      ${rows.length ? `<table width="100%" cellspacing="0" style="font-size:13px;border-collapse:collapse"><tr style="color:#86837a;font-size:11px;text-align:right"><th style="text-align:left;padding:4px 6px">Ad</th><th style="padding:4px 6px">Spend</th><th style="padding:4px 6px">Sign-ups</th><th style="padding:4px 6px">Each</th><th style="padding:4px 6px">Paid</th></tr>${tr}</table>` : `<p style="font-size:14px;color:#5d5b53">No ad data yet.</p>`}
      <p style="font-size:12px;color:#86837a;margin:10px 0 0">❌ Kill · ⚠️ Watch · ✅ Scale${today ? "" : ""}${week.otherSignups ? ` · ${week.otherSignups} sign-ups this week came from outside your ads` : ""}</p>
      <a href="${siteUrl()}/admin/marketing" style="display:block;margin-top:18px;background:#175cd3;color:#fff;text-decoration:none;text-align:center;font-weight:700;font-size:15px;padding:14px;border-radius:12px">Open dashboard</a>
    </div>
  </div></body></html>`;
  return { subject, html };
}

// 4. The whole job: sync, report, email, log
export async function runMarketingSync({ trigger = "cron", email = true } = {}) {
  const service = createSupabaseService();
  const cfg = await marketingSettings();
  if (!cfg.ready) return { ok: false, error: "Run the marketing SQL (RUN_NEW_2026-10-28a.sql) in Supabase first." };
  let syncError = null, synced = null;
  try { synced = await syncInsights(service, cfg); } catch (e) { syncError = String(e?.message || e).slice(0, 300); }
  const now = new Date().toISOString();
  await service.from("marketing_settings").update({ last_sync_at: synced?.rows != null ? now : cfg.row.last_sync_at, last_sync_error: syncError || synced?.skipped || null }).eq("id", true);

  let status = syncError ? "error" : "sent", summary = { trigger, error: syncError, skipped: synced?.skipped || null, rows: synced?.rows ?? 0 };
  try {
    const { data: prev } = await service.from("marketing_reports").select("summary").not("summary->snapshot", "is", null).order("sent_at", { ascending: false }).limit(1);
    const prevSnapshot = prev?.[0]?.summary?.snapshot || null;
    const reports = [await periodReport(service, cfg, "6h", { prevSnapshot }), await periodReport(service, cfg, "today"), await periodReport(service, cfg, "7d")];
    const week = reports[2];
    summary = { ...summary, snapshot: await spendSnapshot(service), currency: week.accountCurrency,
      periods: Object.fromEntries(reports.map((r) => [r.period, { ...r.totals, spendKnown: r.spendKnown, other: r.otherSignups }])),
      ads: week.rows.slice(0, 40).map((r) => ({ name: r.name, country: r.country, spend: r.spend, signups: r.signups, paid: r.paid, verdict: r.verdict })) };
    if (email && cfg.reportsEnabled && cfg.reportEmail) {
      const msg = syncError
        ? { subject: "Usetally ads · sync failed", html: `<p style="font-family:Arial,sans-serif">The 6-hourly ad sync couldn't reach Meta:</p><p style="font-family:Arial,sans-serif"><b>${String(syncError).replace(/</g, "&lt;")}</b></p><p style="font-family:Arial,sans-serif"><a href="${siteUrl()}/admin/marketing">Open the dashboard</a> to check the Meta connection.</p>` }
        : reportEmail({ reports, rows: week.rows, accountCurrency: week.accountCurrency });
      const sent = await sendEmail({ to: cfg.reportEmail, ...msg, fromName: "Usetally ads", fromAddress: "reports@usetally.cc", noReport: true });
      if (!sent.sent) { status = "error"; summary.emailError = sent.reason === "not_configured" ? "Email isn't set up yet (Admin → Integrations → Email)." : `The report couldn't be emailed: ${sent.detail || sent.reason}`; }
    } else if (status !== "error") status = "skipped";
  } catch (e) {
    status = "error"; summary.error = [summary.error, String(e?.message || e).slice(0, 300)].filter(Boolean).join(" · ");
  }
  await service.from("marketing_reports").insert({ period: "6h", summary, status });
  return { ok: status !== "error", status, rows: synced?.rows ?? 0, error: summary.error || summary.emailError || null, skipped: summary.skipped };
}
