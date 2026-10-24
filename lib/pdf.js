import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { formatMoney } from "@/lib/money";
import { formatDate, PAYMENT_METHODS } from "@/lib/format";

// Branded A4 PDFs for quotes, invoices and receipts. Callers pass customer-facing
// data only; hidden costs are never part of the input.

const A4 = [595.28, 841.89];
const M = 44; // margin
const INK = rgb(0.063, 0.094, 0.157);
const INK2 = rgb(0.278, 0.329, 0.404);
const INK3 = rgb(0.596, 0.635, 0.702);
const LINE = rgb(0.918, 0.925, 0.941);
const SUBTLE = rgb(0.973, 0.976, 0.984);

function hexToRgb(hex = "#1570EF") {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return { color: rgb(r, g, b), light: 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 };
}

let fontBytes;
async function fonts(pdf) {
  pdf.registerFontkit(fontkit);
  fontBytes ??= await Promise.all(["Lato-Regular.ttf", "Lato-Bold.ttf"].map((f) => readFile(path.join(process.cwd(), "assets/fonts", f))));
  const [body, bold] = await Promise.all(fontBytes.map((b) => pdf.embedFont(b, { subset: true })));
  return { body, bold };
}

async function embedLogo(pdf, url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    return null; // WebP: fall back to the business name
  } catch {
    return null;
  }
}

function wrap(font, value, size, width) {
  const lines = [];
  for (const paragraph of String(value || "").replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
      if (line) lines.push(line);
      line = "";
      for (const ch of word) {
        if (line && font.widthOfTextAtSize(line + ch, size) > width) { lines.push(line); line = ""; }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

function canvas(pdf, f, brand) {
  const state = { page: null, y: 0 };
  const api = {
    get y() { return state.y; },
    set y(v) { state.y = v; },
    get page() { return state.page; },
    text(value, x, y, { size = 10, font = f.body, color = INK } = {}) {
      state.page.drawText(String(value ?? ""), { x, y, size, font, color });
    },
    right(value, x, y, opts = {}) {
      const size = opts.size || 10;
      const font = opts.font || f.body;
      api.text(value, x - font.widthOfTextAtSize(String(value ?? ""), size), y, opts);
    },
    rule(y, x1 = M, x2 = A4[0] - M, color = LINE) {
      state.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.75, color });
    },
    box(x, y, w, h, color) { state.page.drawRectangle({ x, y, width: w, height: h, color }); },
    newPage() {
      state.page = pdf.addPage(A4);
      api.box(0, A4[1] - 6, A4[0], 6, brand.color);
      state.y = A4[1] - 50;
    },
    ensure(space, onBreak) {
      if (state.y - space < 90) { api.newPage(); onBreak?.(); }
    },
  };
  return api;
}

function footer(pdf, f, { note, number }) {
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const y = 34;
    page.drawLine({ start: { x: M, y: y + 16 }, end: { x: A4[0] - M, y: y + 16 }, thickness: 0.75, color: LINE });
    const lines = wrap(f.body, note || "", 8, 380).slice(0, 2);
    lines.forEach((l, j) => page.drawText(l, { x: M, y: y - j * 10, size: 8, font: f.body, color: INK3 }));
    const label = `${number}  ·  Page ${i + 1} of ${pages.length}`;
    page.drawText(label, { x: A4[0] - M - f.body.widthOfTextAtSize(label, 8), y, size: 8, font: f.body, color: INK3 });
    const made = "Made with PayTrail";
    page.drawText(made, { x: A4[0] - M - f.body.widthOfTextAtSize(made, 7), y: y - 11, size: 7, font: f.body, color: INK3 });
  });
}

async function header(pdf, c, f, { business, logoUrl, title, number, meta }) {
  const brand = hexToRgb(business.brand_color);
  const logo = await embedLogo(pdf, logoUrl);
  const top = A4[1] - 44;
  if (logo) {
    const scale = Math.min(150 / logo.width, 46 / logo.height);
    c.page.drawImage(logo, { x: M, y: top - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
  } else {
    c.text(business.name, M, top - 18, { size: 17, font: f.bold });
  }
  c.right(title, A4[0] - M, top - 14, { size: 20, font: f.bold, color: brand.color });
  c.right(number, A4[0] - M, top - 30, { size: 10, font: f.bold, color: INK2 });
  let y = top - 46;
  for (const [k, v] of meta.filter(([, v]) => v)) {
    c.right(`${k}  ${v}`, A4[0] - M, y, { size: 9, color: INK2 });
    y -= 13;
  }
  c.y = Math.min(top - 70, y - 8);
  return brand;
}

function parties(c, f, { business, toLabel, to }) {
  const colW = (A4[0] - M * 2 - 20) / 2;
  const fromLines = [business.legal_name && business.legal_name !== business.name ? business.legal_name : null, business.address,
    [business.city, business.country].filter(Boolean).join(", "), business.phone, business.email, business.tax_id && `TIN: ${business.tax_id}`].filter(Boolean);
  const toLines = [to.company, to.address, to.phone, to.email].filter(Boolean);
  const h = Math.max(fromLines.length, toLines.length + 1) * 13 + 40;
  c.box(M, c.y - h, A4[0] - M * 2, h, SUBTLE);
  const top = c.y - 18;
  c.text("FROM", M + 14, top, { size: 7.5, font: f.bold, color: INK3 });
  c.text(business.name, M + 14, top - 15, { size: 10.5, font: f.bold });
  fromLines.forEach((l, i) => wrap(f.body, l, 9, colW - 20).slice(0, 1).forEach((w) => c.text(w, M + 14, top - 30 - i * 13, { size: 9, color: INK2 })));
  const x2 = M + colW + 34;
  c.text(toLabel, x2, top, { size: 7.5, font: f.bold, color: INK3 });
  c.text(to.name || "—", x2, top - 15, { size: 10.5, font: f.bold });
  toLines.forEach((l, i) => wrap(f.body, l, 9, colW - 20).slice(0, 1).forEach((w) => c.text(w, x2, top - 30 - i * 13, { size: 9, color: INK2 })));
  c.y -= h + 22;
}

export async function buildDocumentPdf({ doc, items, business, logoUrl, payLink }) {
  const pdf = await PDFDocument.create();
  const f = await fonts(pdf);
  const brandRgb = hexToRgb(business.brand_color);
  const c = canvas(pdf, f, brandRgb);
  const money = (v) => formatMoney(v, doc.currency, { decimals: 2 });
  const quote = doc.kind === "quote";
  c.newPage();
  await header(pdf, c, f, {
    business, logoUrl, title: quote ? "QUOTATION" : "INVOICE", number: doc.number,
    meta: [["Issued", formatDate(doc.issue_date)], quote ? ["Valid until", doc.valid_until && formatDate(doc.valid_until)] : ["Due", doc.due_date && formatDate(doc.due_date)]],
  });
  parties(c, f, { business, toLabel: quote ? "PREPARED FOR" : "BILL TO", to: { name: doc.customer_name, company: doc.customer_company, email: doc.customer_email, phone: doc.customer_phone, address: doc.customer_address } });
  if (doc.title) { c.text(doc.title, M, c.y, { size: 13, font: f.bold }); c.y -= 22; }

  const cols = { desc: M + 10, qty: 360, rate: 450, amount: A4[0] - M - 10 };
  const tableHead = () => {
    c.box(M, c.y - 8, A4[0] - M * 2, 24, brandRgb.color);
    const tc = brandRgb.light ? INK : rgb(1, 1, 1);
    c.text("Description", cols.desc, c.y, { size: 9, font: f.bold, color: tc });
    c.right("Qty", cols.qty, c.y, { size: 9, font: f.bold, color: tc });
    c.right("Unit price", cols.rate, c.y, { size: 9, font: f.bold, color: tc });
    c.right("Amount", cols.amount, c.y, { size: 9, font: f.bold, color: tc });
    c.y -= 30;
  };
  tableHead();
  for (const item of items) {
    const descLines = wrap(f.bold, item.description, 10, 260);
    const detailLines = item.details ? wrap(f.body, item.details, 8.5, 260) : [];
    c.ensure((descLines.length + detailLines.length) * 13 + 16, tableHead);
    const top = c.y;
    descLines.forEach((l, i) => c.text(l, cols.desc, top - i * 13, { size: 10, font: f.bold }));
    detailLines.forEach((l, i) => c.text(l, cols.desc, top - (descLines.length + i) * 12, { size: 8.5, color: INK2 }));
    c.right(String(Number(item.quantity)), cols.qty, top, { size: 10 });
    c.right(money(item.unit_price_minor), cols.rate, top, { size: 10 });
    c.right(money(Math.round(Number(item.quantity) * Number(item.unit_price_minor))), cols.amount, top, { size: 10, font: f.bold });
    c.y = top - (descLines.length * 13 + detailLines.length * 12) - 6;
    c.rule(c.y + 2);
    c.y -= 14;
  }

  // totals
  const rows = [["Subtotal", money(doc.subtotal_minor)]];
  if (Number(doc.discount_minor) > 0) rows.push(["Discount", `-${money(doc.discount_minor)}`]);
  if (Number(doc.tax_rate) > 0) rows.push([`${doc.tax_label || "Tax"} (${Number(doc.tax_rate)}%)`, money(doc.tax_minor)]);
  c.ensure(rows.length * 18 + 80);
  const tx = 330;
  for (const [k, v] of rows) { c.text(k, tx, c.y, { size: 10, color: INK2 }); c.right(v, A4[0] - M - 10, c.y, { size: 10 }); c.y -= 18; }
  c.y -= 8;
  c.box(tx - 10, c.y - 14, A4[0] - M - tx + 10, 32, brandRgb.color);
  const tc = brandRgb.light ? INK : rgb(1, 1, 1);
  c.text(quote ? "Total" : "Total due", tx, c.y, { size: 11, font: f.bold, color: tc });
  c.right(money(doc.total_minor), A4[0] - M - 10, c.y - 1, { size: 14, font: f.bold, color: tc });
  c.y -= 38;
  if (!quote && Number(doc.amount_paid_minor) > 0) {
    c.text("Paid", tx, c.y, { size: 10, color: INK2 }); c.right(`-${money(doc.amount_paid_minor)}`, A4[0] - M - 10, c.y, { size: 10 }); c.y -= 18;
    c.text("Balance", tx, c.y, { size: 11, font: f.bold }); c.right(money(doc.total_minor - doc.amount_paid_minor), A4[0] - M - 10, c.y, { size: 11, font: f.bold }); c.y -= 24;
  }
  if (doc.status === "paid") {
    c.page.drawRectangle({ x: M, y: c.y + 40, width: 96, height: 30, borderColor: rgb(0.027, 0.58, 0.333), borderWidth: 2, opacity: 0, borderOpacity: 0.9 });
    c.text("PAID", M + 28, c.y + 50, { size: 15, font: f.bold, color: rgb(0.027, 0.58, 0.333) });
  }

  // how to pay, notes, terms
  const blocks = [];
  if (doc.status !== "paid") {
    const pay = [];
    if (payLink) pay.push(`Pay online: ${payLink}`);
    if (business.bank_account_number) pay.push(`Bank transfer: ${business.bank_name} · ${business.bank_account_number} · ${business.bank_account_name || business.name}`, `Use ${doc.number} as your payment reference.`);
    if (pay.length) blocks.push(["How to pay", pay.join("\n")]);
  }
  if (doc.notes) blocks.push(["Notes", doc.notes]);
  if (doc.terms) blocks.push(["Terms", doc.terms]);
  if (quote && doc.accepted_at) blocks.push(["Accepted", `Accepted by ${doc.accepted_name || doc.customer_name} on ${formatDate(doc.accepted_at)}`]);
  for (const [title, body] of blocks) {
    const lines = wrap(f.body, body, 9, A4[0] - M * 2);
    c.ensure(lines.length * 12 + 30);
    c.text(title.toUpperCase(), M, c.y, { size: 7.5, font: f.bold, color: INK3 });
    c.y -= 14;
    lines.forEach((l) => { c.ensure(12); c.text(l, M, c.y, { size: 9, color: INK2 }); c.y -= 12; });
    c.y -= 12;
  }
  footer(pdf, f, { note: business.footer_note, number: doc.number });
  pdf.setTitle(`${quote ? "Quotation" : "Invoice"} ${doc.number} — ${business.name}`);
  pdf.setAuthor(business.name);
  pdf.setCreator("PayTrail");
  return pdf.save();
}

export async function buildReceiptPdf({ receipt, payment, doc, business, logoUrl }) {
  const pdf = await PDFDocument.create();
  const f = await fonts(pdf);
  const brandRgb = hexToRgb(business.brand_color);
  const c = canvas(pdf, f, brandRgb);
  const money = (v) => formatMoney(v, receipt.currency, { decimals: 2 });
  c.newPage();
  await header(pdf, c, f, { business, logoUrl, title: "RECEIPT", number: receipt.number, meta: [["Date", formatDate(payment.paid_at)], ["For", doc.number]] });
  parties(c, f, { business, toLabel: "RECEIVED FROM", to: { name: doc.customer_name, company: doc.customer_company, email: doc.customer_email, phone: doc.customer_phone } });

  c.box(M, c.y - 70, A4[0] - M * 2, 84, brandRgb.color);
  const tc = brandRgb.light ? INK : rgb(1, 1, 1);
  c.text("Amount received", M + 18, c.y - 10, { size: 10, color: tc });
  c.text(money(receipt.amount_minor), M + 18, c.y - 46, { size: 28, font: f.bold, color: tc });
  c.y -= 104;
  const rows = [
    ["Payment method", PAYMENT_METHODS[payment.method] || payment.method],
    payment.reference && ["Reference", payment.reference],
    ["Paid on", formatDate(payment.paid_at, { day: "numeric", month: "long", year: "numeric" })],
    ["For", `${doc.kind === "invoice" ? "Invoice" : "Quote"} ${doc.number}${doc.title ? ` — ${doc.title}` : ""}`],
    ["Invoice total", money(doc.total_minor)],
    ["Balance remaining", money(receipt.balance_after_minor)],
  ].filter(Boolean);
  for (const [k, v] of rows) {
    c.text(k, M, c.y, { size: 10, color: INK2 });
    c.right(v, A4[0] - M, c.y, { size: 10, font: f.bold });
    c.y -= 10; c.rule(c.y); c.y -= 18;
  }
  c.y -= 10;
  c.text(Number(receipt.balance_after_minor) === 0 ? "Paid in full. Thank you for your business." : "Part payment received. Thank you.", M, c.y, { size: 11, font: f.bold, color: brandRgb.color });
  footer(pdf, f, { note: business.footer_note, number: receipt.number });
  pdf.setTitle(`Receipt ${receipt.number} — ${business.name}`);
  pdf.setAuthor(business.name);
  pdf.setCreator("PayTrail");
  return pdf.save();
}
