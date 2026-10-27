// One layout for every email Usetally sends: sign-up codes, password resets,
// security codes, quotes, invoices, receipts, invites and admin alerts.
//
// Email clients are old and strict, so this is table-based HTML with inline
// styles only, a hidden preheader (the grey preview line in the inbox), a
// "bulletproof" button, and a plain-text version for clients that want it.
// Light only on purpose: dark-mode clients that invert colours keep the
// neutral palette readable, and business brand colours stay accurate.
import { BRAND } from "./brand.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const C = {
  page: "#f4f2ee", card: "#ffffff", line: "#e7e4dc", ink: "#151513", body: "#4a4843", muted: "#86837a",
  surface: "#f9f9f9", surfaceLine: "#e4e4e7",
  intent: { success: "#047857", error: "#be123c", warning: "#b45309", info: "#1d4ed8" },
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

// readable text colour on a brand-coloured button
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function buttonColors(brandColor) {
  const L = luminance(brandColor);
  if (L == null) return { bg: C.ink, fg: "#ffffff" };
  // white text needs 4.5:1 on the colour; otherwise use near-black text
  return (1.05 / (L + 0.05)) >= 4.5 ? { bg: brandColor, fg: "#ffffff" } : { bg: brandColor, fg: C.ink };
}

const p = (html, extra = "") => `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body};${extra}">${html}</p>`;

/**
 * renderEmail({
 *   preheader, brand: { name, color, logo }, eyebrow, heading, paragraphs: [],
 *   code: { value, caption }, details: [[label, value]], button: { text, url },
 *   note: { intent: "warning"|"info"|"success"|"error", title, text }, footer,
 *   pass: { label, title, sub, rows: [[label, value]], color }  (a ticket-style card, e.g. free access),
 *   checklist: ["what's included", …]
 * }) → { html, text }
 * Strings are escaped. Use { html: "…" } in paragraphs for trusted markup.
 */
export function renderEmail({ preheader = "", brand = {}, eyebrow, heading, paragraphs = [], code, details = [], button, note, footer, pass, checklist = [] }) {
  const name = brand.name || BRAND.name;
  const btn = button?.url ? buttonColors(brand.color) : null;
  const para = (x) => (typeof x === "object" && x?.html ? x.html : esc(x));

  const header = brand.logo
    ? `<img src="${esc(brand.logo)}" alt="${esc(name)}" height="36" style="display:block;height:36px;max-height:36px;width:auto;border:0;outline:none">`
    : `<span style="font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${C.ink}">${esc(name)}</span>`;

  const codeBlock = code?.value ? `
      <tr><td style="padding:6px 0 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surface};border:1px solid ${C.surfaceLine};border-radius:12px">
          <tr><td align="center" style="padding:22px 16px 8px;font-family:${MONO};font-size:34px;line-height:1;font-weight:600;letter-spacing:10px;color:${C.ink}">${esc(String(code.value).replace(/(\d{3})(\d{3})/, "$1 $2"))}</td></tr>
          <tr><td align="center" style="padding:0 16px 18px;font-family:${FONT};font-size:12.5px;color:${C.muted}">${esc(code.caption || "Enter this code where you asked for it.")}</td></tr>
        </table>
      </td></tr>` : "";

  // a ticket: coloured top with the big title, a perforated line, then the facts
  const passColor = pass?.color || "#175cd3";
  const passBlock = pass ? `
      <tr><td style="padding:4px 0 22px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:16px;border:1px solid ${C.line};border-collapse:separate;overflow:hidden">
          <tr><td bgcolor="${esc(passColor)}" style="background:${esc(passColor)};border-radius:15px 15px 0 0;padding:22px 24px 20px">
            <p style="margin:0 0 10px;font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;color:rgba(255,255,255,.78)">${esc(pass.label || "Pass")}</p>
            <p style="margin:0;font-family:${FONT};font-size:30px;line-height:1.1;font-weight:700;letter-spacing:-0.6px;color:#ffffff">${esc(pass.title)}</p>
            ${pass.sub ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:14px;line-height:1.4;color:rgba(255,255,255,.88)">${esc(pass.sub)}</p>` : ""}
          </td></tr>
          <tr><td style="padding:0 18px;background:${C.card}"><div style="border-top:2px dashed ${C.line};height:0;line-height:0;font-size:0">&nbsp;</div></td></tr>
          <tr><td style="padding:6px 24px 10px;background:${C.card};border-radius:0 0 15px 15px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${(pass.rows || []).map(([k, v], i) => `
              <tr>
                <td style="padding:10px 0;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${MONO};font-size:11.5px;letter-spacing:1px;text-transform:uppercase;color:${C.muted}">${esc(k)}</td>
                <td align="right" style="padding:10px 0;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${FONT};font-size:14.5px;font-weight:650;color:${C.ink}">${esc(v)}</td>
              </tr>`).join("")}
            </table>
          </td></tr>
        </table>
      </td></tr>` : "";

  const checkBlock = checklist.length ? `
      <tr><td style="padding:0 0 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${checklist.map((c) => `
          <tr>
            <td width="30" valign="top" style="padding:5px 0"><span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:999px;background:#e6eefc;color:${esc(passColor)};font-family:${FONT};font-size:12px;font-weight:700;text-align:center">&#10003;</span></td>
            <td style="padding:5px 0;font-family:${FONT};font-size:14.5px;line-height:1.5;color:${C.body}">${esc(c)}</td>
          </tr>`).join("")}
        </table>
      </td></tr>` : "";

  const detailRows = details.filter((d) => d && d[1] != null && d[1] !== "").map(([k, v], i) => `
          <tr>
            <td style="padding:11px 0;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${FONT};font-size:13.5px;color:${C.muted}">${esc(k)}</td>
            <td align="right" style="padding:11px 0;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${FONT};font-size:14px;font-weight:600;color:${C.ink}">${esc(v)}</td>
          </tr>`).join("");
  const detailBlock = detailRows ? `
      <tr><td style="padding:4px 0 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};border-bottom:1px solid ${C.line}">${detailRows}
        </table>
      </td></tr>` : "";

  const buttonBlock = btn ? `
      <tr><td style="padding:8px 0 22px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td bgcolor="${esc(btn.bg)}" style="border-radius:999px;background:${esc(btn.bg)}">
            <a href="${esc(button.url)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:${btn.fg};text-decoration:none;border-radius:999px">${esc(button.text || "Open")}&nbsp;&rarr;</a>
          </td>
        </tr></table>
      </td></tr>` : "";

  const noteBlock = note?.text || note?.title ? `
      <tr><td style="padding:2px 0 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surface};border:1px solid ${C.surfaceLine};border-radius:10px">
          <tr><td style="padding:13px 16px">
            ${note.title ? `<p style="margin:0 0 3px;font-family:${FONT};font-size:13.5px;font-weight:600;color:${C.intent[note.intent] || C.intent.info}">${esc(note.title)}</p>` : ""}
            ${note.text ? `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.body}">${esc(note.text)}</p>` : ""}
          </td></tr>
        </table>
      </td></tr>` : "";

  const fallbackLink = button?.url ? `
      <tr><td style="padding:16px 0 0;border-top:1px solid ${C.line}">
        ${p(`Button not working? Copy this link into your browser:<br><a href="${esc(button.url)}" style="color:${C.ink};word-break:break-all">${esc(button.url)}</a>`, `font-size:12px;line-height:1.5;color:${C.muted};margin:0`)}
      </td></tr>` : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background:${C.page}">
  <tr><td align="center" style="padding:36px 14px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td style="padding:0 6px 18px">${header}</td></tr>
      <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:18px;padding:34px 32px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${eyebrow ? `<tr><td style="padding:0 0 10px;font-family:${FONT};font-size:11.5px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:${C.muted}">${esc(eyebrow)}</td></tr>` : ""}
          <tr><td style="padding:0 0 16px;font-family:${FONT};font-size:25px;line-height:1.25;font-weight:650;letter-spacing:-0.4px;color:${C.ink}">${esc(heading)}</td></tr>
          <tr><td>${paragraphs.map((x) => p(para(x))).join("")}</td></tr>
          ${passBlock}${codeBlock}${checkBlock}${detailBlock}${buttonBlock}${noteBlock}${fallbackLink}
        </table>
      </td></tr>
      <tr><td style="padding:20px 6px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
        ${esc(footer || (brand.name && brand.name !== BRAND.name ? `Sent by ${brand.name} using ${BRAND.name}.` : `${BRAND.name} · quotes, invoices and payments.`))}<br>
        <a href="https://${BRAND.domain}" style="color:${C.muted};text-decoration:underline">${BRAND.domain}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const strip = (x) => (typeof x === "object" && x?.html ? x.html.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "") : String(x));
  const text = [
    name, "",
    heading, "",
    ...paragraphs.map(strip).flatMap((x) => [x, ""]),
    ...(pass ? [`${pass.label}: ${pass.title}`, pass.sub || "", ...(pass.rows || []).map(([k, v]) => `${k}: ${v}`), ""] : []),
    ...(code?.value ? [`Code: ${code.value}`, code.caption || "", ""] : []),
    ...(checklist.length ? [...checklist.map((c) => `✓ ${c}`), ""] : []),
    ...details.filter((d) => d && d[1]).map(([k, v]) => `${k}: ${v}`),
    ...(details.length ? [""] : []),
    ...(button?.url ? [`${button.text}: ${button.url}`, ""] : []),
    ...(note ? [[note.title, note.text].filter(Boolean).join(" "), ""] : []),
    "--", footer || `${BRAND.name} · ${BRAND.domain}`,
  ].join("\n").replace(/\n{3,}/g, "\n\n");

  return { html, text };
}
