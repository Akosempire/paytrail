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
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    from: process.env.MAIL_FROM || "",
    ready: missing.length === 0,
  };
}

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport;
function transporter() {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
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
