// The announcement email (Admin → Announcements): its own design, built the
// email-safe way (tables, inline styles). A dark hero with a small 3D render of
// an invoice (public/email/invoice-3d.jpg, the homepage film's last frame, on the
// same background colour), the title, the message, feature rows for lines
// starting "• ", and, when the news is about AI assistants, a small chat showing
// Usetally at work inside ChatGPT. Buttons and badges get a little depth.
import { BRAND } from "./brand.js";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const C = { page: "#f4f2ee", card: "#ffffff", line: "#ebe8e1", ink: "#151513", body: "#4a4843", muted: "#86837a", night: "#141211", nightLine: "#2b2825", nightText: "#aaa69e", blue: "#1570ef", violet: "#7a5af8" };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const isAiNews = ({ title = "", body = "" }) => /chatgpt|claude|grok|\bmcp\b|ai assistant/i.test(`${title} ${body}`);

// "• Title: rest" → feature rows; everything else → paragraphs
export function splitBody(body = "") {
  const blocks = String(body).replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const intro = blocks.length && !blocks[0].startsWith("•") ? blocks.shift() : "";
  const features = [];
  const rest = [];
  for (const b of blocks) {
    const lines = b.split("\n").map((l) => l.trim());
    if (lines.every((l) => l.startsWith("•"))) {
      for (const l of lines) {
        const t = l.replace(/^•\s*/, "");
        const m = /^([^:]{2,60}):\s*(.+)$/.exec(t);
        const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
        features.push(m ? { title: m[1], text: cap(m[2]) } : { title: t, text: "" });
      }
    } else rest.push(b);
  }
  return { intro, features, rest };
}

function chatDemo() {
  // an illustration of the flow, with sample numbers (₦300,000 + 7.5% VAT)
  return `
  <tr><td style="padding:22px 28px 30px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1b1917;border:1px solid ${C.nightLine};border-radius:14px">
      <tr><td style="padding:10px 14px;border-bottom:1px solid ${C.nightLine};font-family:${FONT};font-size:12px;color:${C.nightText}">
        <span style="display:inline-block;width:8px;height:8px;border-radius:8px;background:#3a3d45;margin-right:4px"></span><span style="display:inline-block;width:8px;height:8px;border-radius:8px;background:#3a3d45;margin-right:4px"></span><span style="display:inline-block;width:8px;height:8px;border-radius:8px;background:#3a3d45;margin-right:10px"></span>ChatGPT &middot; Usetally
      </td></tr>
      <tr><td style="padding:16px 14px 6px" align="right">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:82%"><tr><td bgcolor="${C.blue}" style="background:${C.blue};border-radius:14px 14px 4px 14px;padding:10px 13px;font-family:${FONT};font-size:13.5px;line-height:1.45;color:#ffffff;text-align:left">Invoice Obi Foods for 2 logo designs at &#8358;150,000 each</td></tr></table>
      </td></tr>
      <tr><td style="padding:8px 14px 16px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:88%"><tr><td style="background:#25221f;border-radius:14px 14px 14px 4px;padding:11px 13px">
          <p style="margin:0 0 9px;font-family:${FONT};font-size:13.5px;line-height:1.45;color:#e8eaee">Done. Here&rsquo;s your draft &mdash; it hasn&rsquo;t been sent.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px">
            <tr>
              <td style="padding:11px 12px 2px;font-family:${MONO};font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:${C.muted};white-space:nowrap">INV-0042</td>
              <td align="right" style="padding:11px 12px 2px"><span style="display:inline-block;padding:2px 7px;border-radius:6px;background:#f4f3ff;font-family:${FONT};font-size:10.5px;font-weight:600;color:#5925dc;white-space:nowrap">Made by ChatGPT</span></td>
            </tr>
            <tr><td colspan="2" style="padding:2px 12px 0;font-family:${FONT};font-size:14px;font-weight:600;color:${C.ink}">Obi Foods Ltd</td></tr>
            <tr>
              <td style="padding:6px 12px 12px;font-family:${FONT};font-size:12.5px;color:${C.muted};white-space:nowrap">2 &times; Logo design + VAT</td>
              <td align="right" style="padding:6px 12px 12px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};white-space:nowrap">&#8358;322,500</td>
            </tr>
          </table>
          <p style="margin:9px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.45;color:${C.nightText}">Say &ldquo;send it&rdquo; when you&rsquo;re ready &mdash; I&rsquo;ll ask before emailing Obi Foods.</p>
        </td></tr></table>
      </td></tr>
    </table>
  </td></tr>`;
}

export function renderAnnouncement({ title, body, link, label, name, site = "" }) {
  const { intro, features, rest } = splitBody(body);
  const ai = isAiNews({ title, body });
  const first = String(name || "").trim().split(/\s+/)[0];
  const logo = site ? `<img src="${esc(site)}/icons/icon-192.png" width="28" height="28" alt="" style="display:inline-block;width:28px;height:28px;border:0;border-radius:7px;vertical-align:middle">` : "";

  const featureRows = features.length ? `
      <tr><td style="padding:4px 0 10px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${features.map((f, i) => `
          <tr>
            <td width="44" valign="top" style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ""}">
              <span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:9px;background:#eef4ff;border-bottom:2px solid #c9dafc;text-align:center;font-family:${FONT};font-size:13px;font-weight:700;color:${C.blue}">${i + 1}</span>
            </td>
            <td valign="top" style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ""}">
              <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:650;color:${C.ink}">${esc(f.title)}</p>
              ${f.text ? `<p style="margin:2px 0 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.body}">${esc(f.text)}</p>` : ""}
            </td>
          </tr>`).join("")}
        </table>
      </td></tr>` : "";

  const restParas = rest.map((r, i) => i === 0 && features.length
    ? `<tr><td style="padding:8px 0 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f6;border:1px solid ${C.line};border-radius:12px"><tr><td style="padding:14px 16px;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.body}">${esc(r).replace(/\n/g, "<br>")}</td></tr></table></td></tr>`
    : `<tr><td style="padding:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body}">${esc(r).replace(/\n/g, "<br>")}</td></tr>`).join("");

  const chips = ai ? `
      <tr><td style="padding:6px 0 22px">
        <span style="font-family:${MONO};font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:${C.muted};margin-right:8px">Works with</span>${["ChatGPT", "Claude", "Grok"].map((n) => `<span style="display:inline-block;margin:4px 6px 0 0;padding:5px 11px;border:1px solid ${C.line};border-bottom:2px solid #dcd8cf;border-radius:8px;background:#ffffff;font-family:${FONT};font-size:13px;font-weight:600;color:${C.ink}">${n}</span>`).join("")}
      </td></tr>` : "";

  const cta = link ? `
      <tr><td style="padding:4px 0 6px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${C.ink}" style="background:${C.ink};border-radius:12px;border-bottom:3px solid #000000;box-shadow:0 6px 14px -6px rgba(0,0,0,.45)">
          <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:15px 26px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:12px">${esc(label || `Open ${BRAND.name}`)}&nbsp;&rarr;</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:10px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted}">Or open <a href="${esc(link)}" style="color:${C.muted}">${esc(link.replace(/^https?:\/\//, ""))}</a></td></tr>` : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(intro || title)}${"&#8199;&#65279;&#847; ".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background:${C.page}">
  <tr><td align="center" style="padding:32px 12px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
      <tr><td style="padding:0 4px 16px">${logo}<span style="font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${C.ink};vertical-align:middle;margin-left:${logo ? 8 : 0}px">${esc(BRAND.name)}</span></td></tr>
      <tr><td style="border-radius:20px;background:${C.card};border:1px solid ${C.line};overflow:hidden">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td bgcolor="${C.night}" style="background:${C.night};border-radius:19px 19px 0 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${site ? `<tr><td align="center" style="padding:22px 28px 0"><img src="${esc(site)}/email/invoice-3d.jpg" width="260" alt="" style="display:block;width:260px;max-width:100%;height:auto;border:0;outline:none"></td></tr>` : ""}
              <tr><td style="padding:${site ? 6 : 30}px 28px 0">
                <span style="display:inline-block;padding:4px 10px;border-radius:7px;background:rgba(122,90,248,.18);font-family:${MONO};font-size:10.5px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:#c4b5fd">New in ${esc(BRAND.name)}</span>
                <h1 style="margin:14px 0 0;font-family:${FONT};font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-0.6px;color:#ffffff">${esc(title)}</h1>
                ${intro ? `<p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.nightText}">${esc(intro)}</p>` : ""}
              </td></tr>
              ${ai ? chatDemo() : `<tr><td style="padding:0 0 28px"></td></tr>`}
            </table>
          </td></tr>
          <tr><td style="padding:26px 28px 30px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${first ? `<tr><td style="padding:0 0 12px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};font-weight:600">Hi ${esc(first)},</td></tr>` : ""}
              ${featureRows}${restParas}${chips}${cta}
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">You're getting this because you own a business on ${esc(BRAND.name)}. Reply to this email if you have questions.</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [title, "", first ? `Hi ${first},` : "", intro, "", ...features.map((f) => `- ${f.title}${f.text ? `: ${f.text}` : ""}`), "", ...rest, "", link ? `${label || "Open"}: ${link}` : ""]
    .filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
  return { html, text };
}
