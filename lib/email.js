import "server-only";
import nodemailer from "nodemailer";
import { renderEmail } from "@/lib/email-layout";
import { BRAND } from "@/lib/brand";

// Which email settings the server can see (names only, never values).
// Sign-up and reset codes are sent through Brevo only when all of these are set;
// otherwise Supabase sends its own plain emails.
export function emailStatus() {
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

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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

export async function sendEmail({ to, subject, html, text, replyTo, fromName }) {
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  // MAIL_FROM like: Usetally <hello@usetally.cc> (the address must be verified in Brevo)
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const address = from.match(/<(.+)>/)?.[1] || from;
  const name = fromName || from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] || BRAND.name;
  try {
    await transporter().sendMail({ from: `"${name.replace(/"/g, "")}" <${address}>`, to, subject, html, text: text || undefined, replyTo: replyTo || undefined });
    return { sent: true };
  } catch (error) {
    console.error("email.send_failed", { message: error?.message });
    // detail is the mail server's own reply (e.g. "535 Authentication failed"); only shown to platform admins
    return { sent: false, reason: "failed", detail: String(error?.message || "").slice(0, 300) };
  }
}
