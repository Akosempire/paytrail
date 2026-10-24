import "server-only";
import nodemailer from "nodemailer";

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

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// a plain, branded email: business name and colour on top, one button
export function brandedEmail({ brandName, brandColor = "#1570EF", logo, heading, lines = [], buttonText, buttonUrl, footer }) {
  const body = lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#344054">${esc(l)}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Figtree,Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;border:1px solid #eaecf0;overflow:hidden">
    <tr><td style="height:6px;background:${esc(brandColor)}"></td></tr>
    <tr><td style="padding:28px 32px 8px">
      ${logo ? `<img src="${esc(logo)}" alt="${esc(brandName)}" height="40" style="display:block;max-height:40px;margin-bottom:16px">` : `<div style="font-size:18px;font-weight:700;color:#101828;margin-bottom:16px">${esc(brandName)}</div>`}
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#101828">${esc(heading)}</h1>
      ${body}
      ${buttonUrl ? `<p style="margin:24px 0"><a href="${esc(buttonUrl)}" style="display:inline-block;background:${esc(brandColor)};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${esc(buttonText)}</a></p>
      <p style="margin:0 0 20px;font-size:12px;color:#98a2b3;word-break:break-all">Or open: ${esc(buttonUrl)}</p>` : ""}
    </td></tr>
    <tr><td style="padding:16px 32px;background:#f8f9fb;border-top:1px solid #eaecf0;font-size:12px;color:#98a2b3">${esc(footer || `Sent with PayTrail on behalf of ${brandName}.`)}</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendEmail({ to, subject, html, replyTo, fromName }) {
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const address = from.match(/<(.+)>/)?.[1] || from;
  try {
    await transporter().sendMail({ from: fromName ? `"${fromName.replace(/"/g, "")}" <${address}>` : from, to, subject, html, replyTo: replyTo || undefined });
    return { sent: true };
  } catch (error) {
    console.error("email.send_failed", { message: error?.message });
    return { sent: false, reason: "failed" };
  }
}
