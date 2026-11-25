// The WhatsApp community email: written like a short note from a person, with
// a WhatsApp-style invite card. No illustration, no emoji rows, no gradients.
import { BRAND } from "./brand.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const INK = "#1b1a17", BODY = "#4a4740", MUTED = "#8a867c", PAPER = "#f6f3ec", LINE = "#e6e1d6";
const WA = "#25d366", WA_DARK = "#0b7a3e", WA_TINT = "#e7f6ec";

// paragraphs: plain strings; signoff: { name, role }; rules: text or ""
export function renderCommunityNote({ preheader, origin, greeting, heading, paragraphs = [], groupName, joinUrl, rules, signoff, footer, footerLink }) {
  const p = (t) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.65;color:${BODY}">${esc(t)}</p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAPER}" style="background:${PAPER}">
  <tr><td align="center" style="padding:36px 18px 32px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px">
      <tr><td style="padding:0 4px 28px"><img src="${esc(origin)}/email/logo.png" alt="${BRAND.name}" width="113" height="32" style="display:block;width:113px;height:32px;border:0"></td></tr>
      <tr><td style="padding:0 4px">
        <p style="margin:0 0 10px;font-family:${SANS};font-size:14px;color:${MUTED}">${esc(greeting)}</p>
        <h1 style="margin:0 0 22px;font-family:${SERIF};font-size:34px;line-height:1.15;font-weight:400;letter-spacing:-0.4px;color:${INK}">${esc(heading)}</h1>
        ${paragraphs.map(p).join("")}
      </td></tr>

      <!-- invite card, like WhatsApp's own group invite -->
      <tr><td style="padding:10px 0 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${LINE};border-radius:16px">
          <tr><td style="padding:18px 18px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td width="52" valign="middle" style="width:52px">
                <div style="width:52px;height:52px;line-height:52px;border-radius:999px;background:${WA_TINT};text-align:center;font-family:${SANS};font-size:20px;font-weight:700;color:${WA_DARK}">U</div>
              </td>
              <td valign="middle" style="padding-left:14px">
                <p style="margin:0;font-family:${SANS};font-size:12px;letter-spacing:0.4px;color:${MUTED}">WhatsApp group invite</p>
                <p style="margin:2px 0 0;font-family:${SANS};font-size:17px;font-weight:600;color:${INK}">${esc(groupName)}</p>
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:0 18px 18px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td align="center" bgcolor="${WA}" style="border-radius:10px;background:${WA}">
                <a href="${esc(joinUrl)}" target="_blank" style="display:block;padding:15px 18px;font-family:${SANS};font-size:16px;font-weight:600;line-height:1;color:#0b3d20;text-decoration:none;border-radius:10px">Join group</a>
              </td>
            </tr></table>
            <p style="margin:12px 0 0;font-family:${SANS};font-size:12.5px;line-height:1.5;color:${MUTED};text-align:center">Best opened on your phone. Or copy this link: <a href="${esc(joinUrl)}" style="color:${MUTED};word-break:break-all">${esc(joinUrl)}</a></p>
          </td></tr>
        </table>
      </td></tr>

      ${rules ? `<tr><td style="padding:18px 4px 0">
        <p style="margin:0 0 6px;font-family:${SANS};font-size:13px;font-weight:600;color:${INK}">A few house rules</p>
        <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${BODY}">${esc(rules)}</p>
      </td></tr>` : ""}

      <tr><td style="padding:26px 4px 0">
        <p style="margin:0;font-family:${SANS};font-size:16px;line-height:1.5;color:${BODY}">See you inside,</p>
        <p style="margin:4px 0 0;font-family:${SERIF};font-size:20px;font-style:italic;color:${INK}">${esc(signoff.name)}</p>
        ${signoff.role ? `<p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${MUTED}">${esc(signoff.role)}</p>` : ""}
      </td></tr>

      <tr><td style="padding:34px 4px 0">
        <p style="margin:0;padding-top:18px;border-top:1px solid ${LINE};font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED}">${esc(footer)}${footerLink?.url ? ` <a href="${esc(footerLink.url)}" style="color:${MUTED};text-decoration:underline">${esc(footerLink.text)}</a>` : ""}<br><a href="https://${BRAND.domain}" style="color:${MUTED};text-decoration:underline">${BRAND.domain}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  const text = [
    greeting, "", heading, "", ...paragraphs.flatMap((t) => [t, ""]),
    `Join the WhatsApp group (${groupName}): ${joinUrl}`, "",
    rules ? `A few house rules: ${rules}\n` : null,
    "See you inside,", signoff.name, signoff.role || null, "",
    "--", footer, footerLink?.url ? `${footerLink.text}: ${footerLink.url}` : null,
  ].filter((x) => x !== null).join("\n");
  return { html, text };
}
