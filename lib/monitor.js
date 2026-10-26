import "server-only";
import { resolveTxt } from "node:dns/promises";
import { createSupabaseService } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/url";
import { decryptSecret } from "@/lib/crypto";
import { siteUrl } from "@/lib/site";

// Health monitoring. Checks run every few minutes (an outside pinger calls
// /api/monitor) and on the daily job. You're alerted when a check changes
// (broken, or working again), with a reminder every 6 hours while it stays
// broken, and straight away the first time a real user hits a failure.
// Alerts go to a Telegram, Slack or Discord webhook first, because a broken
// email provider can't be trusted to tell you it's broken; email is a backup.

const LABELS = { "live:payments": "Payments failing", email: "Email sending", email_dns: "Email domain records", database: "Database", auth: "Sign-in service", storage: "File storage", "live:email": "Emails failing for users", "live:storage": "Uploads failing for users" };
export const labelOf = (key) => LABELS[key] || key;
const timed = (ms) => AbortSignal.timeout(ms);

// ---------------------------------------------------------------- checks
async function checkEmail() {
  const mail = await import("@/lib/email");
  const cfg = await mail.emailConfig();
  if (!cfg) return { status: "down", detail: "No email provider is set up, so sign-up codes can't be sent." };
  const name = { sendbyte: "Sendbyte", sendhiiv: "Sendhiiv", brevo: "Brevo", "brevo-smtp": "Brevo SMTP", smtp: "SMTP" }[cfg.kind];
  let r;
  if (cfg.kind === "sendbyte") r = await mail.checkSendbyte(cfg.key, cfg.fromAddress);
  else if (cfg.kind === "sendhiiv") r = await mail.checkSendhiiv(cfg.key);
  else if (cfg.kind === "brevo") r = await mail.checkBrevo(cfg.key, cfg.fromAddress);
  else if (cfg.kind === "brevo-smtp") r = await mail.checkBrevoSmtp(cfg.user, cfg.pass);
  else return { status: "ok", detail: "SMTP from Vercel (can't be checked without sending)." };
  if (!r.ok) return { status: "down", detail: `${name}: ${r.error}` };
  if (r.senderNote) return { status: "warn", detail: `${name}: ${r.senderNote}` };
  return { status: "ok", detail: `${name} is answering${cfg.fromAddress ? ` · sending as ${cfg.fromAddress}` : ""}.` };
}

// the sending domain's DNS: SPF must include the provider, Sendbyte needs DKIM
async function checkEmailDns() {
  const mail = await import("@/lib/email");
  const cfg = await mail.emailConfig();
  const domain = String(cfg?.fromAddress || "").split("@")[1];
  if (!cfg || !domain) return { status: "ok", detail: "No custom sending domain to check." };
  const txt = async (name) => (await resolveTxt(name).catch(() => [])).map((parts) => parts.join(""));
  const problems = [];
  const spf = (await txt(domain)).filter((t) => /^v=spf1/i.test(t));
  const needs = { sendbyte: "spf.sendbyte.africa", sendhiiv: "spf.mail.sendhiiv.com", brevo: "spf.brevo.com", "brevo-smtp": "spf.brevo.com" }[cfg.kind];
  if (spf.length > 1) problems.push(`${domain} has ${spf.length} SPF records; there must be exactly one`);
  else if (!spf.length) problems.push(`${domain} has no SPF record`);
  else if (needs && !spf[0].includes(needs)) problems.push(`the SPF record doesn't include ${needs}`);
  else if (!/[~-]all$/.test(spf[0].trim())) problems.push("the SPF record doesn't end with ~all");
  if (cfg.kind === "sendbyte") {
    const dkim = await txt(`sb._domainkey.${domain}`);
    if (!dkim.some((t) => /^v=DKIM1/i.test(t))) problems.push(`sb._domainkey.${domain} doesn't hold Sendbyte's DKIM key${dkim.length ? ` (it holds "${dkim[0].slice(0, 30)}…")` : ""}`);
  }
  if (problems.length) return { status: cfg.kind === "sendbyte" && problems.some((p) => /DKIM/.test(p)) ? "down" : "warn", detail: `Fix in your DNS (e.g. Namecheap → Advanced DNS): ${problems.join("; ")}.` };
  return { status: "ok", detail: `${domain}: SPF${cfg.kind === "sendbyte" ? " and DKIM" : ""} look right.` };
}

async function checkDatabase() {
  const t = Date.now();
  const q = createSupabaseService().from("platform_settings").select("id").limit(1);
  const { error } = await (q.abortSignal ? q.abortSignal(timed(8000)) : q);
  if (error) return { status: "down", detail: `Supabase didn't answer: ${error.message}` };
  const ms = Date.now() - t;
  return ms > 3000 ? { status: "warn", detail: `Slow: ${ms} ms to answer.` } : { status: "ok", detail: `Answering in ${ms} ms.` };
}

async function checkAuth() {
  try {
    const res = await fetch(`${supabaseUrl()}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" }, signal: timed(8000), cache: "no-store" });
    if (!res.ok) return { status: "down", detail: `Supabase Auth answered ${res.status}.` };
    const s = await res.json().catch(() => ({}));
    if (s.external && s.external.email === false) return { status: "warn", detail: "Email sign-in is switched off in Supabase." };
    return { status: "ok", detail: "Supabase Auth is answering." };
  } catch (e) { return { status: "down", detail: `Supabase Auth didn't answer: ${e?.message || e}` }; }
}

async function checkStorage() {
  const { r2Check } = await import("@/lib/storage");
  const r = await r2Check().catch((e) => ({ ready: false, note: e?.message }));
  return r.ready ? { status: "ok", detail: "Cloudflare R2 is answering." } : { status: r.note?.startsWith("Not set up") ? "warn" : "down", detail: r.note || "Cloudflare R2 didn't answer." };
}

const CHECKS = { email: checkEmail, email_dns: checkEmailDns, database: checkDatabase, auth: checkAuth, storage: checkStorage };

// runs every check, saves the results and alerts on changes
export async function runChecks() {
  const service = createSupabaseService();
  const results = await Promise.all(Object.entries(CHECKS).map(async ([key, fn]) => {
    const r = await fn().catch((e) => ({ status: "down", detail: `The check itself failed: ${String(e?.message || e).slice(0, 200)}` }));
    return { key, ...r };
  }));
  const { data: before, error } = await service.from("monitor_state").select("*");
  if (error) return { results, saved: false, note: "Run RUN_NEW_2026-10-26e.sql to save results and get alerts." };
  const prev = Object.fromEntries((before || []).map((r) => [r.check_key, r]));
  const now = new Date().toISOString();
  const alerts = [];
  for (const r of results) {
    const old = prev[r.key];
    const changed = !old || old.status !== r.status;
    const remind = !changed && r.status === "down" && (!old.alerted_at || Date.now() - Date.parse(old.alerted_at) > 6 * 3600_000);
    const row = { check_key: r.key, status: r.status, detail: r.detail.slice(0, 1000), checked_at: now, changed_at: changed ? now : old.changed_at, alerted_at: old?.alerted_at || null };
    // first ever run: only report what's wrong
    if ((changed && (old || r.status !== "ok")) || remind) { alerts.push({ ...r, recovered: r.status === "ok", remind }); row.alerted_at = now; }
    if (changed && (old || r.status !== "ok")) await service.from("monitor_events").insert({ kind: `check:${r.key}`, detail: `${r.status === "ok" ? "Working" : r.status === "warn" ? "Warning" : "Broken"}: ${r.detail}`.slice(0, 1000) });
    await service.from("monitor_state").upsert(row);
  }
  if (alerts.length) await sendAlert(alerts.map((a) => `${a.recovered ? "✅" : a.status === "warn" ? "⚠️" : "🔴"} ${labelOf(a.key)}${a.remind ? " (still broken)" : a.recovered ? " is working again" : ""}: ${a.detail}`));
  return { results, saved: true, alerted: alerts.length };
}

// ---------------------------------------------------------------- real failures
// called when a real user's email or upload fails: logged, and you're told at
// once (then at most every 30 minutes while it keeps happening)
export async function reportFailure(kind, detail, { alert = true } = {}) {
  try {
    const service = createSupabaseService();
    await service.from("monitor_events").insert({ kind, detail: String(detail || "").slice(0, 1000) });
    if (!alert) return;
    const key = `live:${kind}`;
    const { data: s } = await service.from("monitor_state").select("alerted_at").eq("check_key", key).maybeSingle();
    if (s?.alerted_at && Date.now() - Date.parse(s.alerted_at) < 30 * 60_000) return;
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await service.from("monitor_events").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", since);
    const now = new Date().toISOString();
    await service.from("monitor_state").upsert({ check_key: key, status: "down", detail: String(detail || "").slice(0, 1000), checked_at: now, changed_at: now, alerted_at: now });
    await sendAlert([`🔴 ${labelOf(key)}: ${detail}${count > 1 ? ` (${count} times in the last hour)` : ""}`]);
  } catch (e) { console.error("monitor.report_failed", { message: e?.message }); }
}

// ---------------------------------------------------------------- alerts
async function webhookUrl() {
  try {
    const { data } = await createSupabaseService().from("platform_settings").select("alert_webhook_enc").eq("id", true).maybeSingle();
    if (data?.alert_webhook_enc) return decryptSecret(data.alert_webhook_enc);
  } catch {}
  return String(process.env.ALERT_WEBHOOK_URL || "").trim() || null;
}

// Telegram, Slack and Discord each want the text under a different name
export async function postToWebhook(url, text) {
  const u = new URL(url);
  const body = /discord(app)?\.com$/.test(u.hostname) ? { content: text.slice(0, 1900) }
    : u.hostname === "api.telegram.org" ? { text: text.slice(0, 4000), chat_id: u.searchParams.get("chat_id") || undefined, disable_web_page_preview: true }
    : { text };
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: timed(8000) });
  if (!res.ok) throw new Error(`${u.hostname} answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
}

export async function sendAlert(lines) {
  const text = [`Usetally (${siteUrl().replace(/^https?:\/\//, "")})`, ...lines, `Details: ${siteUrl()}/admin/health`].join("\n");
  let delivered = false;
  const url = await webhookUrl();
  if (url) { try { await postToWebhook(url, text); delivered = true; } catch (e) { console.error("monitor.webhook_failed", { message: e?.message }); } }
  // email as a backup (it may be the thing that's broken)
  try {
    const { notifyAdmins } = await import("@/lib/admin-alerts");
    const r = await notifyAdmins({ subject: lines[0].replace(/^\S+\s/, "").slice(0, 90), heading: "Something needs your attention", lines, link: "/admin/health" });
    delivered ||= Boolean(r?.sent);
  } catch {}
  if (!delivered) console.error("monitor.alert_undelivered", { lines });
  return delivered;
}
