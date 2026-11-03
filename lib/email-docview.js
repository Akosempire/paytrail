// The document itself, inside the email: what the customer sees when they
// open Gmail or Outlook is the invoice, quotation or receipt (logo, who it's
// from and for, the items, the totals, how to pay, terms), not a notice
// about it. Built from the same model as the PDF (lib/doc-model.js), as
// table-based HTML with inline styles so it holds up in every email app.
// The PDF still goes along as an attachment. Pure: tested in node.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const INK = "#151513", BODY = "#4a4843", MUTED = "#86837a", LINE = "#e7e4dc", SOFT = "#f7f6f3";
const okHex = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : null);
const absolute = (src, site) => (!src ? null : /^https?:\/\//.test(src) ? src : site && src.startsWith("/") ? site + src : null);
const lines = (arr) => (arr || []).filter(Boolean).map(esc).join("<br>");
const text = (s) => esc(s).replace(/\n/g, "<br>");

function label(t) {
  return `<p style="margin:0 0 6px;font-family:${MONO};font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED}">${esc(t)}</p>`;
}

// model: buildModel(...) output. site: absolute origin for relative logo URLs.
export function documentCard(model, { site = "" } = {}) {
  if (!model) return "";
  const accent = okHex(model.accent) && model.accent.toLowerCase() !== "#111111" ? model.accent : INK;
  const logo = absolute(model.business?.logo, site);
  const brand = logo
    ? `<img src="${esc(logo)}" alt="${esc(model.business.name)}" height="40" style="display:block;height:40px;max-height:40px;width:auto;border:0;outline:none">`
    : `<span style="font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.3px;color:${INK}">${esc(model.business?.name)}</span>`;
  const meta = (model.meta || []).map(([k, v]) => `<tr><td style="padding:1px 10px 1px 0;font-family:${FONT};font-size:12px;color:${MUTED};text-align:right">${esc(k)}</td><td style="padding:1px 0;font-family:${FONT};font-size:12px;font-weight:600;color:${INK};text-align:right;white-space:nowrap">${esc(v)}</td></tr>`).join("");
  const stamp = model.stamp ? `<span style="display:inline-block;margin-top:8px;padding:3px 9px;border:1.5px solid ${model.stamp === "VOID" ? "#be123c" : "#047857"};border-radius:6px;font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:1.5px;color:${model.stamp === "VOID" ? "#be123c" : "#047857"}">${esc(model.stamp)}</span>` : "";

  const head = `
    <tr><td style="padding:22px 24px 18px;border-top:4px solid ${accent}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="top">${brand}</td>
        <td valign="top" align="right">
          <p style="margin:0 0 6px;font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${accent}">${esc(model.title)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" align="right">${meta}</table>
          ${stamp ? `<div style="clear:both;text-align:right">${stamp}</div>` : ""}
        </td>
      </tr></table>
    </td></tr>`;

  const parties = `
    <tr><td style="padding:0 24px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};border-radius:10px"><tr>
        <td valign="top" width="50%" style="padding:14px 16px">${label("From")}<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${BODY}"><strong style="color:${INK}">${esc(model.business?.name)}</strong>${model.business?.lines?.length ? `<br>${lines(model.business.lines)}` : ""}</p></td>
        <td valign="top" width="50%" style="padding:14px 16px">${label(model.customer?.label || "Bill to")}<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${BODY}"><strong style="color:${INK}">${esc(model.customer?.name)}</strong>${model.customer?.lines?.length ? `<br>${lines(model.customer.lines)}` : ""}</p></td>
      </tr></table>
    </td></tr>`;

  const title = model.docTitle ? `<tr><td style="padding:0 24px 10px;font-family:${FONT};font-size:15px;font-weight:600;color:${INK}">${esc(model.docTitle)}</td></tr>` : "";

  const th = (t, align = "left") => `<td style="padding:8px 0;border-bottom:1.5px solid ${accent};font-family:${MONO};font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};text-align:${align}">${t}</td>`;
  const items = (model.items || []).length ? `
    <tr><td style="padding:0 24px 6px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>${th("Description")}${th("Qty", "right")}${th("Price", "right")}${th("Amount", "right")}</tr>
        ${model.items.map((i) => `<tr>
          <td style="padding:10px 8px 10px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13.5px;line-height:1.4;color:${INK}">${esc(i.description)}${i.details ? `<br><span style="font-size:12px;color:${MUTED}">${text(i.details)}</span>` : ""}</td>
          <td style="padding:10px 0 10px 8px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13px;color:${BODY};text-align:right;white-space:nowrap">${esc(i.quantity)}</td>
          <td style="padding:10px 0 10px 12px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13px;color:${BODY};text-align:right;white-space:nowrap">${esc(i.unit)}</td>
          <td style="padding:10px 0 10px 12px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13.5px;font-weight:600;color:${INK};text-align:right;white-space:nowrap">${esc(i.amount)}</td>
        </tr>`).join("")}
      </table>
    </td></tr>` : "";

  const row = (k, v, strong) => `<tr><td style="padding:${strong ? "10px" : "4px"} 0 4px;${strong ? `border-top:1.5px solid ${accent};` : ""}font-family:${FONT};font-size:${strong ? "15px" : "13px"};${strong ? `font-weight:700;color:${INK}` : `color:${MUTED}`}">${esc(k)}</td><td style="padding:${strong ? "10px" : "4px"} 0 4px 16px;${strong ? `border-top:1.5px solid ${accent};` : ""}font-family:${FONT};font-size:${strong ? "16px" : "13px"};font-weight:${strong ? 700 : 500};color:${INK};text-align:right;white-space:nowrap">${esc(v)}</td></tr>`;
  const sums = model.receipt
    ? `${row("Amount paid", model.receipt.amount, true)}${model.receipt.rows.map(([k, v]) => row(k, v)).join("")}`
    : `${(model.totals || []).map(([k, v]) => row(k, v)).join("")}${model.total ? row(model.total.label, model.total.value, true) : ""}${model.paid ? `${row("Paid", model.paid.paid)}${row("Balance due", model.paid.balance, true)}` : ""}`;
  const totals = `
    <tr><td style="padding:8px 24px 18px">
      <table role="presentation" cellpadding="0" cellspacing="0" align="right" style="min-width:260px">${sums}</table>
    </td></tr>`;

  const pay = (model.payBlocks || []).map((b) => `
    <tr><td style="padding:0 24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px"><tr><td style="padding:12px 16px">
        ${label(b.title)}
        ${b.bank ? `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.55;color:${BODY}">${esc(b.bank.name)}<br><strong style="font-family:${MONO};font-size:16px;letter-spacing:1px;color:${INK}">${esc(b.bank.number)}</strong><br>${esc(b.bank.account)}</p>` : ""}
        ${b.text ? `<p style="margin:${b.bank ? "6px" : "0"} 0 0;font-family:${FONT};font-size:12.5px;line-height:1.5;color:${MUTED}">${text(b.text)}</p>` : ""}
      </td></tr></table>
    </td></tr>`).join("");

  const extra = [model.notes && ["Notes", model.notes], model.terms && ["Terms", model.terms], model.accepted && ["Accepted", model.accepted]].filter(Boolean).map(([k, v]) => `
    <tr><td style="padding:0 24px 12px">${label(k)}<p style="margin:0;font-family:${FONT};font-size:12.5px;line-height:1.55;color:${BODY}">${text(v)}</p></td></tr>`).join("");

  const foot = model.business?.footer ? `<tr><td style="padding:10px 24px 18px;border-top:1px solid ${LINE};font-family:${FONT};font-size:11.5px;color:${MUTED};text-align:center">${text(model.business.footer)}</td></tr>` : `<tr><td style="padding:0 0 8px"></td></tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${LINE};border-radius:18px;border-collapse:separate;overflow:hidden">${head}${parties}${title}${items}${totals}${pay}${extra}${foot}</table>`;
}

// the same document in the plain-text part of the email
export function documentText(model) {
  if (!model) return "";
  const out = [`${String(model.title || "").toUpperCase()} ${model.number || ""}`.trim(), ...(model.meta || []).map(([k, v]) => `${k}: ${v}`), ""];
  out.push(`From: ${model.business?.name || ""}`, `${model.customer?.label || "Bill to"}: ${model.customer?.name || ""}`, "");
  if (model.docTitle) out.push(model.docTitle, "");
  for (const i of model.items || []) out.push(`${i.description}  ${i.quantity} × ${i.unit} = ${i.amount}`);
  if ((model.items || []).length) out.push("");
  if (model.receipt) out.push(`Amount paid: ${model.receipt.amount}`, ...model.receipt.rows.map(([k, v]) => `${k}: ${v}`));
  else {
    out.push(...(model.totals || []).map(([k, v]) => `${k}: ${v}`));
    if (model.total) out.push(`${model.total.label}: ${model.total.value}`);
    if (model.paid) out.push(`Paid: ${model.paid.paid}`, `Balance due: ${model.paid.balance}`);
  }
  for (const b of model.payBlocks || []) {
    out.push("", b.title);
    if (b.bank) out.push(b.bank.name, b.bank.number, b.bank.account);
    if (b.text) out.push(b.text);
  }
  if (model.notes) out.push("", "Notes", model.notes);
  if (model.terms) out.push("", "Terms", model.terms);
  return out.filter((x) => x != null).join("\n");
}

// renderEmail's `document` option. link: any absolute address on the site (for relative logo paths)
export function documentBlock(model, link = "") {
  if (!model) return undefined;
  let site = "";
  try { site = link ? new URL(link).origin : ""; } catch { /* no site: name instead of a relative logo */ }
  return { html: documentCard(model, { site }), text: documentText(model) };
}
