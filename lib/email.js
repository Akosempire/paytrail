import "server-only";
import nodemailer from "nodemailer";
import { renderEmail } from "@/lib/email-layout";
import { BRAND } from "@/lib/brand";

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
    return { sent: false, reason: "failed" };
  }
}
