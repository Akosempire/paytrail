import "server-only";
import nodemailer from "nodemailer";
import { renderEmail } from "@/lib/email-layout";
import { BRAND } from "@/lib/brand";
import { decryptSecret } from "@/lib/crypto";
import { createSupabaseService } from "@/lib/supabase/server";

// Where email goes out from, in order:
//   1. Brevo API key saved in Admin → Settings (stored encrypted in the database)
//   2. SMTP_* settings in Vercel (the older way, still supported)
// With neither, Supabase sends its own plain sign-up emails and invoices
// can't be emailed.

// SMTP settings in Vercel: which are missing (names only, never values).
function smtpEnvStatus() {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((k) => !String(process.env[k] || "").trim());
  return {
    missing,
    hints: credentialHints(),
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    from: process.env.MAIL_FROM || "",
    ready: missing.length === 0,
  };
}

// Spots the usual reasons Brevo answers "535 Authentication failed", by the
// shape of each setting only. Never returns the values themselves.
export function credentialHints() {
  const raw = (k) => process.env[k] || "";
  const v = (k) => raw(k).trim();
  const bare = (k) => v(k).replace(/^["']|["']$/g, "");
  const hints = [];
  for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]) {
    if (raw(k) !== raw(k).trim()) hints.push(`${k} has a space or line break at the start or end. Remove it in Vercel.`);
    if (/^["'].*["']$/.test(v(k))) hints.push(`${k} is wrapped in quote marks. Paste it without the quotes.`);
  }
  const brevo = /brevo|sendinblue/i.test(v("SMTP_HOST"));
  if (/^\d+$/.test(bare("SMTP_HOST"))) hints.push(`SMTP_HOST is set to a number (${bare("SMTP_HOST").length <= 5 ? bare("SMTP_HOST") : "digits"}). It should be smtp-relay.brevo.com; the number belongs in SMTP_PORT.`);
  else if (v("SMTP_HOST") && !brevo) hints.push(`SMTP_HOST should be smtp-relay.brevo.com.`);
  if (brevo && v("SMTP_USER") && !/@smtp-brevo\.com$/i.test(bare("SMTP_USER")))
    hints.push("SMTP_USER isn't Brevo's SMTP login. It is not your account email: copy the \"Login\" shown in Brevo → SMTP & API → SMTP tab (it ends in @smtp-brevo.com).");
  if (/^xkeysib-/.test(bare("SMTP_PASS")))
    hints.push("SMTP_PASS is a Brevo API key (starts xkeysib-). Email sending needs an SMTP key instead: Brevo → SMTP & API → SMTP tab → Generate a new SMTP key (starts xsmtpsib-).");
  else if (brevo && v("SMTP_PASS") && !/^xsmtpsib-/.test(bare("SMTP_PASS")))
    hints.push("SMTP_PASS doesn't look like a Brevo SMTP key (they start xsmtpsib-). Your Brevo account password won't work here.");
  const port = Number(v("SMTP_PORT") || 587);
  if (![587, 465, 2525].includes(port)) hints.push("SMTP_PORT should be 587.");
  return hints;
}

const smtpEnvReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
export const BREVO_API = () => (process.env.BREVO_API_URL || "https://api.brevo.com/v3").replace(/\/$/, "");

// the dashboard settings, read with the service key and kept for 30 seconds
let cache = null;
export function forgetEmailConfig() { cache = null; }
async function dashboardConfig() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.APP_ENCRYPTION_KEY) return null;
  try {
    const { data, error } = await createSupabaseService().from("platform_settings")
      .select("email_api_key_enc, email_from_name, email_from_address").eq("id", true).maybeSingle();
    if (error || !data?.email_api_key_enc) return { ok: !error, value: null };
    const secret = decryptSecret(data.email_api_key_enc);
    const base = { fromName: data.email_from_name || BRAND.name, fromAddress: data.email_from_address };
    // an SMTP key is stored together with its login as "login\nkey"
    if (secret.includes("\n")) { const [user, pass] = secret.split("\n"); return { ok: true, value: { kind: "brevo-smtp", user, pass, ...base } }; }
    return { ok: true, value: { kind: "brevo", key: secret, ...base } };
  } catch { return { ok: false, value: null }; }
}
export async function emailConfig() {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const db = await dashboardConfig();
  const value = db?.value || (smtpEnvReady() ? { kind: "smtp" } : null);
  if (!db || db.ok) cache = { at: Date.now(), value }; // don't remember a failed lookup
  return value;
}
export async function emailConfigured() { return Boolean(await emailConfig()); }

// for the admin card
export async function emailStatus() {
  const cfg = await emailConfig();
  const env = smtpEnvStatus();
  let saved = null;
  try {
    const { data } = await createSupabaseService().from("platform_settings")
      .select("email_key_hint, email_from_name, email_from_address, email_account, email_checked_at").eq("id", true).maybeSingle();
    saved = data || null;
  } catch {}
  return {
    source: cfg?.kind === "brevo" || cfg?.kind === "brevo-smtp" ? "dashboard" : cfg?.kind === "smtp" ? "vercel" : null,
    ready: Boolean(cfg),
    saved: saved?.email_key_hint ? saved : null,
    fromName: saved?.email_from_name || BRAND.name,
    fromAddress: saved?.email_from_address || "",
    env: { from: env.from, host: env.host, hints: cfg?.kind === "smtp" ? env.hints : [] },
  };
}

let transport;
function transporter() {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS.trim().replace(/^["']|["']$/g, "") },
  });
  return transport;
}

// older helper kept for compatibility; new code uses the templates in lib/emails.js
export function brandedEmail({ brandName, brandColor, logo, heading, lines = [], buttonText, buttonUrl, footer }) {
  return renderEmail({ brand: { name: brandName, color: brandColor, logo }, heading, paragraphs: lines, button: buttonUrl ? { text: buttonText, url: buttonUrl } : null, footer }).html;
}

export const BREVO_SMTP = () => ({ host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com", port: Number(process.env.BREVO_SMTP_PORT || 587) });
const smtpTransports = new Map();
function brevoSmtp(user, pass) {
  const id = `${user}:${pass.slice(-8)}`;
  if (!smtpTransports.has(id)) smtpTransports.set(id, nodemailer.createTransport({ ...BREVO_SMTP(), secure: false, auth: { user, pass }, connectionTimeout: 15_000, greetingTimeout: 15_000 }));
  return smtpTransports.get(id);
}
export function explainSmtp(error) {
  const m = String(error?.message || error || "");
  if (/IP/i.test(m) && /(unauthori|unknown|block)/i.test(m)) return "Brevo blocked the connection because it came from a new IP address. In Brevo: your name (top right) → Settings → Security → Authorized IPs → Deactivate blocking, and confirm.";
  if (/535|auth/i.test(m)) return "Brevo didn't accept this SMTP login and key together. Copy the Login shown on Brevo → SMTP & API → SMTP tab (it ends @smtp-brevo.com) and paste it with the key. If both are right, Brevo's IP blocking may be on: Settings → Security → Authorized IPs → Deactivate blocking.";
  if (/sender|not valid|from/i.test(m)) return `Brevo won't send from this address yet: ${m.slice(0, 160)}. Authenticate the domain under Senders, Domains & Dedicated IPs → Domains.`;
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout/i.test(m)) return "Couldn't reach Brevo's mail server. Try again in a moment.";
  return `Brevo said: ${m.slice(0, 200)}`;
}
export async function checkBrevoSmtp(user, pass) {
  if (!/^[^\s@]+@smtp-brevo\.com$/i.test(user)) return { ok: false, error: "Paste the SMTP Login too. It's on Brevo → SMTP & API → SMTP tab, next to \"Login\", and ends @smtp-brevo.com. (It isn't your Brevo account email.)" };
  try { await brevoSmtp(user, pass).verify(); return { ok: true, account: user }; }
  catch (e) { return { ok: false, error: explainSmtp(e) }; }
}

// Brevo's reply in plain words (shown to platform admins only)
export function explainBrevo(status, body) {
  const msg = String(body?.message || body?.code || "").trim();
  if (/IP address/i.test(msg)) return "Brevo blocked the request because it came from a new IP address. In Brevo, open Security → Authorised IPs and turn off IP blocking (Vercel's servers don't have fixed addresses).";
  if (status === 401) return "Brevo didn't accept the API key. Check you copied the whole key, and that it hasn't been deleted in Brevo → SMTP & API → API Keys.";
  if (/sender/i.test(msg)) return `Brevo won't send from this address yet: ${msg}. Verify the address under Senders, or authenticate the domain under Domains.`;
  if (status === 402 || /credit|plan/i.test(msg)) return `Your Brevo account is out of email credits: ${msg}`;
  if (/not.*activated|account.*(suspend|block)/i.test(msg)) return `Brevo says: ${msg}. Contact Brevo support to activate sending.`;
  return `Brevo said: ${status} ${msg || "no reason given"}`;
}

async function sendWithBrevo(cfg, { to, subject, html, text, replyTo, fromName }) {
  const list = (Array.isArray(to) ? to : String(to).split(",")).map((e) => e.trim()).filter(Boolean).map((email) => ({ email }));
  const res = await fetch(`${BREVO_API()}/smtp/email`, {
    method: "POST",
    headers: { "api-key": cfg.key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: String(fromName || cfg.fromName || BRAND.name).replace(/["<>]/g, ""), email: cfg.fromAddress },
      to: list, subject, htmlContent: html, ...(text ? { textContent: text } : {}), ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return { sent: true };
  const body = await res.json().catch(() => ({}));
  return { sent: false, reason: "failed", detail: explainBrevo(res.status, body) };
}

export async function sendEmail({ to, subject, html, text, replyTo, fromName }) {
  const cfg = await emailConfig();
  if (!cfg) return { sent: false, reason: "not_configured" };
  try {
    if (cfg.kind === "brevo-smtp") {
      try {
        await brevoSmtp(cfg.user, cfg.pass).sendMail({ from: `"${String(fromName || cfg.fromName || BRAND.name).replace(/["<>]/g, "")}" <${cfg.fromAddress}>`, to, subject, html, text: text || undefined, replyTo: replyTo || undefined });
        return { sent: true };
      } catch (e) {
        const detail = explainSmtp(e);
        console.error("email.send_failed", { message: detail });
        return { sent: false, reason: "failed", detail };
      }
    }
    if (cfg.kind === "brevo") {
      const r = await sendWithBrevo(cfg, { to, subject, html, text, replyTo, fromName });
      if (!r.sent) console.error("email.send_failed", { message: r.detail });
      return r;
    }
    // MAIL_FROM like: Usetally <hello@usetally.cc> (the address must be verified in Brevo)
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    const address = from.match(/<(.+)>/)?.[1] || from;
    const name = fromName || from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] || BRAND.name;
    await transporter().sendMail({ from: `"${name.replace(/"/g, "")}" <${address}>`, to, subject, html, text: text || undefined, replyTo: replyTo || undefined });
    return { sent: true };
  } catch (error) {
    console.error("email.send_failed", { message: error?.message });
    // detail is the mail server's own reply (e.g. "535 Authentication failed"); only shown to platform admins
    return { sent: false, reason: "failed", detail: String(error?.message || "").slice(0, 300) };
  }
}

// Checks a Brevo API key and sender before saving: is the key real, and will
// Brevo send from this address?
export async function checkBrevo(key, fromAddress) {
  if (!/^xkeysib-[\w-]{20,}$/.test(key)) return { ok: false, error: "That doesn't look like a Brevo API key. It starts xkeysib- and is quite long; copy all of it." };
  const get = (path) => fetch(`${BREVO_API()}${path}`, { headers: { "api-key": key, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  let res;
  try { res = await get("/account"); } catch { return { ok: false, error: "Couldn't reach Brevo. Try again in a moment." }; }
  const account = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: explainBrevo(res.status, account) };
  const domain = fromAddress.split("@")[1]?.toLowerCase();
  const [senders, domains] = await Promise.all([
    get("/senders").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    get("/senders/domains").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  const sender = (senders.senders || []).find((s) => s.email?.toLowerCase() === fromAddress.toLowerCase());
  const dom = (domains.domains || []).find((d) => d.domain_name?.toLowerCase() === domain);
  let senderNote = null;
  if (!sender && !dom) senderNote = `${fromAddress} isn't set up in Brevo yet. Add ${domain} under Senders, Domains & Dedicated IPs → Domains and authenticate it, or add the address under Senders.`;
  else if (dom && !dom.authenticated && !sender?.active) senderNote = `${domain} is added in Brevo but not authenticated yet. Open it under Domains and click Authenticate (DNS changes can take up to an hour).`;
  else if (sender && !sender.active && !dom?.authenticated) senderNote = `${fromAddress} is waiting for verification in Brevo. Click the link Brevo emailed to that address.`;
  return { ok: true, account: account.email || account.companyName || "", senderNote };
}
