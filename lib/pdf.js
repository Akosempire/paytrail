import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, setCharacterSpacing } from "pdf-lib";
import { r2Get } from "@/lib/storage";
import { MM } from "@/lib/doc-templates";

// Renders a document model (lib/doc-model.js) to PDF at its real paper size,
// following the same four templates as the HTML preview (app/doc-templates.css).
// Callers only ever pass customer-facing data; hidden costs never get here.

const INK = rgb(0.082, 0.082, 0.082);
const INK2 = rgb(0.29, 0.29, 0.29);
const INK3 = rgb(0.54, 0.54, 0.54);
const LINE = rgb(0.89, 0.89, 0.89);
const TINT = rgb(0.965, 0.965, 0.957);
const BLUE = rgb(0.09, 0.361, 0.827);
const RED = rgb(0.706, 0.137, 0.094);

const hex = (h) => {
  const v = String(h || "#111111").replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const mix = (c, amount, base = [1, 1, 1]) => rgb(...c.map((x, i) => x * amount + base[i] * (1 - amount)));

let fontBytes;
async function loadFonts(pdf) {
  pdf.registerFontkit(fontkit);
  fontBytes ??= await Promise.all(["Lato-Regular.ttf", "Lato-Bold.ttf", "SourceSerif4-Regular.ttf", "SourceSerif4-Semibold.ttf"]
    .map((f) => readFile(path.join(process.cwd(), "assets/fonts", f))));
  const [sans, sansBold, serif, serifBold] = await Promise.all(fontBytes.map((b) => pdf.embedFont(b, { subset: true })));
  return { sans, sansBold, serif, serifBold };
}

async function embedLogo(pdf, url) {
  if (!url) return null;
  try {
    // our own /media/… files come straight from R2, not over the internet
    const media = url.match(/^(?:https?:\/\/[^/]+)?\/media\/(.+)$/);
    const res = media ? await r2Get(decodeURIComponent(media[1])) : await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res) return null;
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    return null; // WebP/SVG: fall back to the business name
  } catch {
    return null;
  }
}

function wrap(font, value, size, width, spacing = 0) {
  const w = (t) => font.widthOfTextAtSize(t, size) + spacing * Math.max(0, t.length - 1);
  const lines = [];
  for (const paragraph of String(value ?? "").replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter((x, i, a) => x || a.length === 1)) {
      const candidate = line ? `${line} ${word}` : word;
      if (w(candidate) <= width) { line = candidate; continue; }
      if (line) lines.push(line);
      line = "";
      for (const ch of word) {
        if (line && w(line + ch) > width) { lines.push(line); line = ""; }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderPdf(model) {
  const m = model;
  const pdf = await PDFDocument.create();
  const F = await loadFonts(pdf);
  const spec = m.paperSpec;
  const thermal = Boolean(spec.thermal);
  const t = m.template;
  const exec = t === "executive", sig = t === "signature", ess = t === "essential", pos = t === "pos";
  const accentArr = hex(m.accent);
  const ACC = rgb(...accentArr);
  const ACC_DARK = mix(accentArr, 0.82, [0, 0, 0]);
  const ACC_TINT = mix(accentArr, 0.1);

  const W = spec.w * MM;
  const H = thermal ? 3000 * MM : spec.h * MM;
  const M = spec.margin * MM;
  const CW = W - M * 2;
  const base = { a4: 9, letter: 9, a5: 7.6, half: 7.6, thermal80: 8, thermal58: 7 }[m.paper] * (exec ? 1.045 : 1);
  const body = exec ? F.serif : F.sans;
  const bold = exec ? F.serifBold : F.sansBold;
  const LH = 1.42;

  const pages = [];
  let page, y; // y grows downwards from the top of the page
  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = M;
    if (sig) page.drawRectangle({ x: 0, y: H - 1.6 * MM, width: W, height: 1.6 * MM, color: ACC });
  };
  const bottomLimit = () => (thermal ? H - M : H - M - 8);
  const fits = (h) => y + h <= bottomLimit();

  const text = (value, x, top, { size = base, font = body, color = INK, align = "left", spacing = 0, maxWidth } = {}) => {
    const s = String(value ?? "");
    const width = font.widthOfTextAtSize(s, size) + spacing * Math.max(0, s.length - 1);
    const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
    const baseline = H - (top + (size * LH - size) / 2 + size * 0.82);
    if (spacing) page.pushOperators(pushGraphicsState(), setCharacterSpacing(spacing));
    page.drawText(s, { x: left, y: baseline, size, font, color, ...(maxWidth ? { maxWidth } : {}) });
    if (spacing) page.pushOperators(setCharacterSpacing(0), popGraphicsState());
    return width;
  };
  const lines = (arr, x, top, opts = {}) => {
    const size = opts.size || base;
    arr.forEach((l, i) => text(l, x, top + i * size * LH, opts));
    return arr.length * size * LH;
  };
  const rule = (top, { x1 = M, x2 = W - M, color = LINE, width = 0.25 * MM, dash } = {}) =>
    page.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness: width, color, ...(dash ? { dashArray: dash } : {}) });
  const rect = (x, top, w, h, color, r = 0) => {
    if (!r) return page.drawRectangle({ x, y: H - top - h, width: w, height: h, color });
    const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(p, { x, y: H - top, color, borderWidth: 0 });
  };
  const dashed = (top) => rule(top, { color: INK, width: 0.3 * MM, dash: [2, 1.6] });

  newPage();
  const logo = await embedLogo(pdf, m.business.logo);

  // ---------------------------------------------------------------- receipts with their own layout
  const styled = Boolean(m.receipt) && (t === "ledger" || t === "bold");
  const lum = accentArr.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const NAVY = rgb(0.086, 0.129, 0.243);
  const ON_ACC = lum > 0.32 ? NAVY : rgb(1, 1, 1);
  const ACC_ON_DARK = lum < 0.09 ? rgb(1, 1, 1) : ACC;
  const rowsOf = () => {
    const get = (k) => m.receipt.rows.find(([label]) => label === k)?.[1];
    return { method: get("Payment method"), reference: get("Reference"), paidOn: get("Paid on"), forDoc: get("For"), invoiceTotal: get("Invoice total"), balance: get("Balance remaining") };
  };
  const metaOf = (key) => m.meta.find(([k]) => k === key)?.[1];
  const thanksText = m.receipt?.fullyPaid ? "Paid in full. Thank you for your business." : "Part payment received. Thank you.";
  const box = (x, top, w, h, { color = INK, width = 0.3 * MM, fill } = {}) =>
    page.drawRectangle({ x, y: H - top - h, width: w, height: h, borderColor: color, borderWidth: width, ...(fill ? { color: fill } : {}) });
  const partyCol = (who, x, top, w, labelOpts) => {
    let yy = top;
    text(who.label, x, yy, labelOpts); yy += (labelOpts.size || base) * LH + 1 * MM;
    for (const l of wrap(F.sansBold, who.name, base * 1.06, w)) { text(l, x, yy, { size: base * 1.06, font: F.sansBold }); yy += base * 1.06 * LH; }
    for (const l of who.lines.flatMap((x2) => wrap(body, x2, base, w))) { text(l, x, yy, { color: INK2 }); yy += base * LH; }
    return yy;
  };
  const small = ["a5", "half"].includes(m.paper);

  const ledgerReceipt = () => {
    const r = rowsOf();
    const g = small ? 0.55 : 1; // tighter vertical rhythm on A5 / half letter
    page.drawRectangle({ x: 0, y: H - 5 * MM, width: W, height: 5 * MM, color: ACC });
    y = M + (small ? 1 : 3) * MM;
    const titleSize = base * (small ? 2.2 : 2.6);
    text(m.title, M, y, { size: titleSize, font: F.sansBold });
    let brandH = titleSize * 1.05;
    if (logo) {
      const sc = Math.min(((small ? 36 : 48) * MM) / logo.width, ((small ? 10 : 13) * MM) / logo.height);
      page.drawImage(logo, { x: W - M - logo.width * sc, y: H - y - logo.height * sc, width: logo.width * sc, height: logo.height * sc });
      brandH = Math.max(brandH, logo.height * sc);
    } else text(m.business.name, W - M, y + 1 * MM, { size: base * 1.35, font: F.sansBold, align: "right" });
    y += brandH + 8 * MM * g;
    const colW = (CW - 8 * MM) / 2;
    const lab = { size: base * 1.12, color: ACC };
    const a = partyCol(m.customer, M, y, colW, lab);
    const b = partyCol({ label: "From", name: m.business.name, lines: m.business.lines }, M + colW + 8 * MM, y, colW, lab);
    y = Math.max(a, b) + 8 * MM * g;
    // boxed summary
    const cells = [["RECEIPT NO.", m.number], ["DATE", metaOf("Date") || ""], ["FOR", metaOf("For") || ""], ["AMOUNT RECEIVED", m.receipt.amount]];
    const perRow = small ? 2 : 4;
    const cellW = (CW - 10 * MM) / perRow;
    const cellH = base * 0.82 * LH + 1.4 * MM + base * 1.22 * LH;
    const rowsN = Math.ceil(cells.length / perRow);
    const boxH = (small ? 6 : 8) * MM + rowsN * cellH + (rowsN - 1) * 3 * MM;
    box(M, y, CW, boxH);
    cells.forEach(([k, v], i) => {
      const cx = M + 5 * MM + (i % perRow) * cellW, cy = y + (small ? 3 : 4) * MM + Math.floor(i / perRow) * (cellH + 3 * MM);
      text(k, cx, cy, { size: base * 0.82, color: ACC, spacing: base * 0.82 * 0.04 });
      text(v, cx, cy + base * 0.82 * LH + 1.4 * MM, { size: base * 1.22, font: F.sansBold, maxWidth: cellW - 2 * MM });
    });
    y += boxH + 7 * MM * g;
    // ruled table
    const details = [["Payment method", r.method], ["Reference", r.reference], ["Paid on", r.paidOn], ["For", r.forDoc]].filter(([, v]) => v);
    const keyW = CW * 0.32, padX = 3 * MM, rowH = base * LH + (small ? 3.4 : 4.6) * MM, headH = base * LH + (small ? 3.4 : 4.4) * MM;
    const tableH = headH + details.length * rowH;
    if (!fits(tableH)) newPage();
    page.drawRectangle({ x: M, y: H - y - headH, width: CW, height: headH, color: ACC });
    text("DETAIL", M + padX, y + (small ? 1.7 : 2.2) * MM, { size: base * 0.95, color: ON_ACC, spacing: base * 0.04 });
    text("VALUE", W - M - padX, y + (small ? 1.7 : 2.2) * MM, { size: base * 0.95, color: ON_ACC, spacing: base * 0.04, align: "right" });
    details.forEach(([k, v], i) => {
      const ty = y + headH + i * rowH;
      rule(ty, { color: INK, width: 0.3 * MM });
      text(k, M + padX, ty + (small ? 1.7 : 2.3) * MM);
      text(v, W - M - padX, ty + (small ? 1.7 : 2.3) * MM, { font: F.sansBold, align: "right", maxWidth: CW - keyW - padX * 2 });
    });
    box(M, y, CW, tableH);
    page.drawLine({ start: { x: M + keyW, y: H - y }, end: { x: M + keyW, y: H - y - tableH }, thickness: 0.3 * MM, color: INK });
    y += tableH + 7 * MM * g;
    // note box + totals
    const noteW = CW * 0.52, totX = M + noteW + 8 * MM, totW = CW - noteW - 8 * MM;
    const noteLines = wrap(body, thanksText, base, noteW - 10 * MM);
    const noteH = Math.max((small ? 14 : 20) * MM, 8 * MM + base * 1.12 * LH + 1.2 * MM + noteLines.length * base * LH);
    if (!fits(noteH + 6 * MM)) newPage();
    box(M, y, noteW, noteH);
    text("Note", M + 5 * MM, y + 4 * MM, { size: base * 1.12, color: ACC });
    noteLines.forEach((l, i) => text(l, M + 5 * MM, y + 4 * MM + base * 1.12 * LH + 1.2 * MM + i * base * LH));
    let ty = y;
    for (const [k, v] of [["INVOICE TOTAL", r.invoiceTotal], ["BALANCE REMAINING", r.balance]].filter(([, v]) => v)) {
      text(k, totX, ty, { size: base * 0.92, color: INK2, spacing: base * 0.04 }); text(v, W - M, ty, { font: F.sansBold, align: "right" }); ty += base * LH + 2 * MM;
    }
    ty += 1 * MM; rule(ty, { x1: totX, x2: W - M, color: INK, width: 0.3 * MM }); ty += 3 * MM;
    text("AMOUNT PAID", totX, ty, { size: base * 1.45, font: F.sansBold, color: ACC }); text(m.receipt.amount, W - M, ty + base * 0.1, { size: base * 1.35, font: F.sansBold, align: "right" });
    y = Math.max(y + noteH, ty + base * 1.45 * LH) + 2 * MM;
  };

  const boldReceipt = () => {
    const r = rowsOf();
    const address = m.business.lines.find((l) => /\d/.test(l) && !/@|\+?\d[\d\s-]{6,}$/.test(l)) || m.business.lines[0] || "";
    const contacts = m.business.lines.filter((l) => l !== address).slice(0, 3);
    // dark header
    const titleSize = base * 3;
    const metaRows = [["Receipt no.", m.number], ...m.meta.filter(([k]) => k !== "Receipt")];
    let left = M, right = M;
    let brandBottom = M;
    if (logo) {
      const sc = Math.min(((small ? 30 : 40) * MM) / logo.width, ((small ? 9 : 11) * MM) / logo.height);
      const lw = logo.width * sc, lh = logo.height * sc;
      brandBottom = M + lh + 3 * MM;
      left = brandBottom + 2 * MM + base * 1.05 * LH;
    } else left = M + base * 1.3 * LH + 3 * MM + 1 * MM;
    right = M + titleSize + 3 * MM + metaRows.length * base * LH;
    const hh = Math.max(left, right) + 6 * MM;
    page.drawRectangle({ x: 0, y: H - hh, width: W, height: hh, color: NAVY });
    if (logo) {
      const sc = Math.min(((small ? 30 : 40) * MM) / logo.width, ((small ? 9 : 11) * MM) / logo.height);
      const lw = logo.width * sc, lh = logo.height * sc;
      rect(M, M, lw + 5 * MM, lh + 3 * MM, rgb(1, 1, 1), 2 * MM);
      page.drawImage(logo, { x: M + 2.5 * MM, y: H - M - 1.5 * MM - lh, width: lw, height: lh });
      text(m.business.name, M, brandBottom + 2 * MM, { size: base * 1.05, font: F.sansBold, color: rgb(1, 1, 1) });
    } else {
      const nameW = F.sansBold.widthOfTextAtSize(m.business.name, base * 1.3);
      rect(M, M, Math.min(nameW + 5 * MM, CW * 0.5), base * 1.3 * LH + 3 * MM, rgb(1, 1, 1), 2 * MM);
      text(m.business.name, M + 2.5 * MM, M + 1.5 * MM, { size: base * 1.3, font: F.sansBold, color: NAVY, maxWidth: CW * 0.5 - 5 * MM });
    }
    text(m.title.toUpperCase(), W - M, M, { size: titleSize, font: F.sansBold, color: ACC_ON_DARK, align: "right", spacing: titleSize * 0.02 });
    let my = M + titleSize + 3 * MM;
    for (const [k, v] of metaRows) {
      text(v, W - M, my, { color: rgb(1, 1, 1), align: "right" });
      text(k, W - M - 30 * MM, my, { color: rgb(0.78, 0.81, 0.87), align: "right" });
      my += base * LH;
    }
    // colour stripe with the address
    const sh = 9 * MM, sw = W * 0.68;
    page.drawRectangle({ x: 0, y: H - hh - sh, width: sw, height: sh, color: ACC });
    if (address) text(address, M, hh + (sh - base * LH) / 2, { font: F.sansBold, color: ON_ACC, maxWidth: sw - M - 3 * MM });
    const slash = (x0, color) => page.drawSvgPath(`M ${3 * MM} 0 L ${W * 0.04 + 3 * MM} 0 L ${W * 0.04} ${sh} L 0 ${sh} Z`, { x: x0, y: H - hh, color, borderWidth: 0 });
    slash(sw + 1.5 * MM, NAVY); slash(sw + W * 0.04 + 3 * MM, ACC);
    y = hh + sh + 8 * MM;
    // received from / payment method
    const colW = (CW - 8 * MM) / 2;
    const lab = { size: base, font: F.sansBold, spacing: base * 0.04 };
    const a = partyCol({ ...m.customer, label: m.customer.label.toUpperCase() }, M, y, colW, lab);
    const px = M + colW + 8 * MM;
    let py = y;
    text("PAYMENT METHOD", px, py, lab); py += base * LH + 1 * MM;
    for (const [k, v] of [["Method", r.method], ["Reference", r.reference], ["Paid on", r.paidOn]].filter(([, v]) => v)) {
      text(k, px, py, { color: INK2 }); text(v, W - M, py, { font: F.sansBold, align: "right" }); py += base * LH;
    }
    y = Math.max(a, py) + 7 * MM;
    // dark-headed table
    const cols = [["For", 0.4, "left"], ["Invoice total", 0.2, "right"], ["Paid", 0.2, "right"], ["Balance", 0.2, "right"]];
    const vals = [r.forDoc || "", r.invoiceTotal || "", m.receipt.amount, r.balance || ""];
    const headH = base * LH + 6 * MM;
    const forLines = wrap(body, vals[0], base, CW * 0.4 - 6 * MM);
    const rowH = forLines.length * base * LH + 5.2 * MM;
    if (!fits(headH + rowH)) newPage();
    page.drawRectangle({ x: M, y: H - y - headH, width: CW, height: headH, color: NAVY });
    let cx = M;
    for (const [i, [h, f, al]] of cols.entries()) {
      const w = CW * f;
      text(h, al === "right" ? cx + w - 3 * MM : cx + 3 * MM, y + 3 * MM, { font: F.sansBold, color: rgb(1, 1, 1), align: al });
      if (i === 0) forLines.forEach((l, j) => text(l, cx + 3 * MM, y + headH + 2.6 * MM + j * base * LH));
      else text(vals[i], cx + w - 3 * MM, y + headH + 2.6 * MM, { align: "right" });
      cx += w;
    }
    y += headH + rowH;
    rule(y, { color: rgb(0.42, 0.42, 0.42), width: 0.3 * MM });
    y += 7 * MM;
    // thanks + contacts / total bar
    const half = (CW - 8 * MM) / 2;
    const leftH = base * LH + 2 * MM + contacts.length * (base * LH + 1.2 * MM);
    if (!fits(leftH)) newPage();
    text((m.receipt.fullyPaid ? "Thank you for your business" : "Part payment received").toUpperCase(), M, y, lab);
    let cy = y + base * LH + 2 * MM;
    for (const c of contacts) {
      rect(M, cy + (base * LH - 3 * MM) / 2, 3 * MM, 3 * MM, ACC, 0.6 * MM);
      text(c, M + 5.2 * MM, cy, { color: INK2, maxWidth: half - 6 * MM }); cy += base * LH + 1.2 * MM;
    }
    const barH = base * 1.25 * LH + 6 * MM, bx = M + half + 8 * MM;
    page.drawRectangle({ x: bx, y: H - y - barH, width: half, height: barH, color: NAVY });
    text("Total paid", bx + 4 * MM, y + (barH - base * LH) / 2, { font: F.sansBold, color: rgb(1, 1, 1) });
    text(m.receipt.amount, W - M - 4 * MM, y + (barH - base * 1.25 * LH) / 2, { size: base * 1.25, font: F.sansBold, color: rgb(1, 1, 1), align: "right" });
    y = Math.max(cy, y + barH) + 2 * MM;
  };

  if (styled) {
    if (t === "ledger") ledgerReceipt(); else boldReceipt();
  } else {

  // ---------------------------------------------------------------- header
  const label = (value, x, top, opts = {}) => text(String(value).toUpperCase(), x, top, { size: base * 0.72, font: F.sansBold, color: INK3, spacing: base * 0.72 * 0.12, ...opts });

  if (pos) {
    if (logo) {
      const s = Math.min((CW * 0.7) / logo.width, (12 * MM) / logo.height);
      page.drawImage(logo, { x: W / 2 - (logo.width * s) / 2, y: H - y - logo.height * s, width: logo.width * s, height: logo.height * s });
      y += logo.height * s + 1.5 * MM;
    } else {
      for (const l of wrap(bold, m.business.name, base * 1.35, CW)) { text(l, W / 2, y, { size: base * 1.35, font: bold, align: "center" }); y += base * 1.35 * LH; }
    }
    for (const l of m.business.lines.flatMap((x) => wrap(body, x, base, CW))) { text(l, W / 2, y, { color: INK2, align: "center" }); y += base * LH; }
    y += 3 * MM;
    dashed(y); y += 2 * MM;
    text(m.title.toUpperCase(), W / 2, y, { size: base * 1.25, font: bold, align: "center", spacing: base * 1.25 * 0.14 }); y += base * 1.25 * LH;
    for (const [k, v] of m.meta) { text(k, M, y, { color: INK2 }); text(v, W - M, y, { font: bold, align: "right" }); y += base * LH; }
    y += 2 * MM; dashed(y); y += 2 * MM;
    label(m.customer.label, M, y); y += base * 0.72 * LH + 0.8 * MM;
    for (const l of wrap(bold, m.customer.name, base * 1.06, CW)) { text(l, M, y, { size: base * 1.06, font: bold }); y += base * 1.06 * LH; }
    for (const l of m.customer.lines.flatMap((x) => wrap(body, x, base, CW))) { text(l, M, y, { color: INK2 }); y += base * LH; }
  } else if (exec) {
    if (logo) {
      const s = Math.min((52 * MM) / logo.width, ((m.paper === "a5" ? 11 : 14) * MM) / logo.height);
      page.drawImage(logo, { x: W / 2 - (logo.width * s) / 2, y: H - y - logo.height * s, width: logo.width * s, height: logo.height * s });
      y += logo.height * s + 1.5 * MM;
      text(m.business.name.toUpperCase(), W / 2, y, { size: base * 1.1, font: F.serif, color: INK2, align: "center", spacing: base * 1.1 * 0.18 }); y += base * 1.1 * LH;
    } else {
      for (const l of wrap(F.serifBold, m.business.name, base * 2, CW)) { text(l, W / 2, y, { size: base * 2, font: F.serifBold, align: "center" }); y += base * 2 * 1.2; }
    }
    y += 4 * MM;
    text(m.title.toUpperCase(), W / 2, y, { size: base * 1.15, font: F.serif, color: ACC, align: "center", spacing: base * 1.15 * 0.32 }); y += base * 1.15 * LH + 1.6 * MM;
    const metaLine = m.meta.map(([k, v]) => ({ k, v }));
    const parts = metaLine.map(({ k, v }) => ({ k: `${k} `, v, w: body.widthOfTextAtSize(`${k} `, base) + bold.widthOfTextAtSize(v, base) }));
    const gap = 5 * MM;
    let rows = [[]], rw = 0;
    for (const p of parts) { if (rw + p.w > CW && rows.at(-1).length) { rows.push([]); rw = 0; } rows.at(-1).push(p); rw += p.w + gap; }
    for (const row of rows) {
      const total = row.reduce((s, p) => s + p.w, 0) + gap * (row.length - 1);
      let x = W / 2 - total / 2;
      for (const p of row) { x += text(p.k, x, y, { color: INK2 }); x += text(p.v, x, y, { font: bold }) + gap; }
      y += base * LH;
    }
    y += 5 * MM;
    rule(y, { color: ACC, width: 0.3 * MM });
  } else {
    // Essential / Signature: brand left, title block right
    const topY = y;
    let left = topY;
    if (logo) {
      const small = ["a5", "half"].includes(m.paper);
      const s = Math.min(((small ? 40 : 52) * MM) / logo.width, ((small ? 11 : 14) * MM) / logo.height);
      page.drawImage(logo, { x: M, y: H - topY - logo.height * s, width: logo.width * s, height: logo.height * s });
      left += logo.height * s;
    } else {
      for (const l of wrap(F.sansBold, m.business.name, base * 1.65, CW * 0.55)) { text(l, M, left, { size: base * 1.65, font: F.sansBold }); left += base * 1.65 * 1.15; }
    }
    let right = topY;
    const kindSize = base * 1.85;
    text(m.title.toUpperCase(), W - M, right, { size: kindSize, font: F.sansBold, color: sig ? ACC : INK, align: "right", spacing: kindSize * 0.06 });
    right += kindSize * 1.1 + 1.6 * MM;
    for (const [k, v] of m.meta) {
      const vw = F.sansBold.widthOfTextAtSize(v, base);
      text(v, W - M, right, { font: F.sansBold, align: "right" });
      text(k, W - M - vw - 2 * MM, right, { color: INK2, align: "right" });
      right += base * LH;
    }
    y = Math.max(left, right);
  }

  // ---------------------------------------------------------------- parties
  let stampAt = null;
  if (!pos) {
    y += 7 * MM;
    const colW = (CW - 6 * MM) / 2;
    const pad = sig ? 4 * MM : 0;
    const innerW = colW - pad;
    const col = (who) => ({
      label: who.label,
      name: wrap(F.sansBold, who.name, base * 1.06, innerW),
      lines: who.lines.flatMap((l) => wrap(body, l, base, innerW)),
    });
    const from = col({ label: "From", name: m.business.name, lines: m.business.lines });
    const to = col(m.customer);
    const hOf = (c) => base * 0.72 * LH + 0.8 * MM + c.name.length * base * 1.06 * LH + c.lines.length * base * LH;
    const h = Math.max(hOf(from), hOf(to)) + pad * 2;
    if (!fits(h)) newPage();
    stampAt = { page, x: W - M - 6 * MM, y: y + 3 * MM };
    if (sig) rect(M, y, CW, h, TINT, 2 * MM);
    [from, to].forEach((c, i) => {
      const x = M + pad + i * (colW + 6 * MM);
      let cy = y + pad;
      label(c.label, x, cy); cy += base * 0.72 * LH + 0.8 * MM;
      c.name.forEach((l) => { text(l, x, cy, { size: base * 1.06, font: F.sansBold }); cy += base * 1.06 * LH; });
      c.lines.forEach((l) => { text(l, x, cy, { color: INK2 }); cy += base * LH; });
    });
    y += h;
  }

  if (m.docTitle && m.kind !== "receipt") {
    y += (pos ? 2 : 6) * MM;
    for (const l of wrap(bold, m.docTitle, base * (pos ? 1.05 : 1.25), CW)) { if (!fits(base * 2)) newPage(); text(l, M, y, { size: base * (pos ? 1.05 : 1.25), font: bold }); y += base * (pos ? 1.05 : 1.25) * LH; }
  }

  // ---------------------------------------------------------------- stamp
  const drawStamp = (cx, cy, rot) => {
    if (!m.stamp) return;
    const size = base * (pos ? 1.2 : 1.7);
    const color = pos || ess ? INK : m.stamp === "VOID" ? RED : BLUE;
    const sp = size * 0.15;
    const tw = F.sansBold.widthOfTextAtSize(m.stamp, size) + sp * (m.stamp.length - 1);
    const bw = tw + 6 * MM, bh = size * 1.5;
    const rad = (rot * Math.PI) / 180;
    // rotate the box and text around the stamp's centre
    const ox = cx - (bw / 2) * Math.cos(rad) + (bh / 2) * Math.sin(rad);
    const oy = (H - cy) - (bw / 2) * Math.sin(rad) - (bh / 2) * Math.cos(rad);
    page.drawRectangle({ x: ox, y: oy, width: bw, height: bh, borderColor: color, borderWidth: 0.8 * MM, rotate: degrees(rot), opacity: 0, borderOpacity: 0.85 });
    const tx = ox + 3 * MM * Math.cos(rad) - (bh * 0.3) * Math.sin(rad);
    const ty = oy + 3 * MM * Math.sin(rad) + (bh * 0.3) * Math.cos(rad);
    page.pushOperators(pushGraphicsState(), setCharacterSpacing(sp));
    page.drawText(m.stamp, { x: tx, y: ty, size, font: F.sansBold, color, rotate: degrees(rot), opacity: 0.85 });
    page.pushOperators(setCharacterSpacing(0), popGraphicsState());
  };
  if (stampAt && m.stamp) {
    const keep = page;
    page = stampAt.page;
    const size = base * 1.7;
    const half = (F.sansBold.widthOfTextAtSize(m.stamp, size) + size * 0.15 * (m.stamp.length - 1) + 6 * MM) / 2;
    drawStamp(stampAt.x - half, stampAt.y + size * 0.75, 10);
    page = keep;
  }

  // ---------------------------------------------------------------- receipt amount
  if (m.receipt) {
    const big = base * (pos ? 1.9 : 2.6);
    const h = (pos ? 4 : 10) * MM + base * 0.72 * LH + big * 1.1;
    y += (pos ? 2 : 6) * MM;
    if (!fits(h)) newPage();
    if (!pos) {
      if (ess) page.drawRectangle({ x: M, y: H - y - h, width: CW, height: h, borderColor: INK, borderWidth: 0.4 * MM });
      else if (exec) { rule(y, { color: ACC, width: 0.3 * MM }); rule(y + h, { color: ACC, width: 0.3 * MM }); }
      else rect(M, y, CW, h, sig ? ACC_TINT : TINT, 2 * MM);
    }
    const pad = pos ? 2 * MM : 5 * MM;
    const center = exec || pos;
    const x = center ? W / 2 : M + pad;
    label("Amount received", x, y + pad, { align: center ? "center" : "left" });
    text(m.receipt.amount, x, y + pad + base * 0.72 * LH, { size: big, font: bold, color: sig ? ACC_DARK : INK, align: center ? "center" : "left" });
    y += h;
  }
  if (pos && m.stamp) { y += 3 * MM; drawStamp(W / 2, y + base * 0.9, 0); y += base * 1.8 + 1 * MM; }

  // ---------------------------------------------------------------- items
  if (m.items.length && thermal) {
    y += 2 * MM; dashed(y);
    for (const it of m.items) {
      const desc = wrap(F.sansBold, it.description, base, CW);
      const det = it.details ? wrap(body, it.details, base * 0.9, CW) : [];
      y += 1.4 * MM;
      desc.forEach((l) => { text(l, M, y, { font: F.sansBold }); y += base * LH; });
      det.forEach((l) => { text(l, M, y, { size: base * 0.9, color: INK2 }); y += base * 0.9 * LH; });
      text(`${it.quantity} × ${it.unit}`, M, y);
      text(it.amount, W - M, y, { font: F.sansBold, align: "right" });
      y += base * LH + 1.4 * MM;
      rule(y, { color: INK3, width: 0.25 * MM, dash: [0.6, 1] });
    }
  } else if (m.items.length) {
    y += 6 * MM;
    const hs = base * 0.76;
    const numW = (vals, head) => Math.max(F.sansBold.widthOfTextAtSize(head.toUpperCase(), hs) + hs * 0.08 * head.length, ...vals.map((v) => bold.widthOfTextAtSize(String(v), base))) + (ess || exec ? 3 * MM : 4 * MM);
    const wQty = numW(m.items.map((i) => i.quantity), "Qty");
    const wUnit = numW(m.items.map((i) => i.unit), "Unit price");
    const wAmt = numW(m.items.map((i) => i.amount), "Amount");
    const padX = ess || exec ? 0 : 2 * MM;
    const xAmt = W - M - padX, xUnit = xAmt - wAmt, xQty = xUnit - wUnit;
    const descW = xQty - wQty - M - padX - 2 * MM;
    const head = () => {
      const h = hs * LH + 3.2 * MM;
      if (sig) rect(M, y, CW, h, ACC_TINT, 1.4 * MM);
      const color = sig ? ACC_DARK : exec ? INK2 : INK;
      const ty = y + 1.6 * MM;
      const o = { size: hs, font: F.sansBold, color, spacing: hs * 0.08 };
      text("DESCRIPTION", M + padX, ty, o);
      text("QTY", xQty, ty, { ...o, align: "right" });
      text("UNIT PRICE", xUnit, ty, { ...o, align: "right" });
      text("AMOUNT", xAmt, ty, { ...o, align: "right" });
      y += h;
      if (ess) rule(y, { color: INK, width: 0.4 * MM });
      if (exec) rule(y, { color: ACC, width: 0.3 * MM });
    };
    head();
    for (const it of m.items) {
      const desc = wrap(bold, it.description, base, descW);
      const det = it.details ? wrap(body, it.details, base * 0.9, descW) : [];
      const rowH = 4.4 * MM + desc.length * base * LH + det.length * base * 0.9 * LH + (det.length ? 0.5 * MM : 0);
      if (!fits(rowH)) { newPage(); head(); }
      const ty = y + 2.2 * MM;
      let dy = ty;
      desc.forEach((l) => { text(l, M + padX, dy, { font: bold }); dy += base * LH; });
      if (det.length) dy += 0.5 * MM;
      det.forEach((l) => { text(l, M + padX, dy, { size: base * 0.9, color: INK2 }); dy += base * 0.9 * LH; });
      text(String(it.quantity), xQty, ty, { align: "right" });
      text(it.unit, xUnit, ty, { align: "right" });
      text(it.amount, xAmt, ty, { font: bold, align: "right" });
      y += rowH;
      rule(y);
    }
  } else if (m.kind !== "receipt") {
    y += 6 * MM; text("No items yet.", M, y, { color: INK3 }); y += base * LH;
  }

  // ---------------------------------------------------------------- totals (kept together)
  if (m.showTotals) {
    const rows = [...m.totals];
    const tw = pos ? CW : Math.min(CW, (["a5", "half"].includes(m.paper) ? 62 : 78) * MM);
    const x1 = W - M - tw, x2 = W - M;
    const grandSize = base * (pos ? 1.35 : 1.22);
    const extra = m.paid ? 2 : 0;
    const h = (pos ? 1 : 4) * MM + (rows.length + extra) * (base * LH + 2 * MM) + grandSize * LH + 6 * MM;
    y += (pos ? 1 : 4) * MM;
    if (!fits(h)) newPage();
    for (const [k, v] of rows) { y += 1 * MM; text(k, x1, y, { color: INK2 }); text(v, x2, y, { align: "right" }); y += base * LH + 1 * MM; }
    y += 1.5 * MM;
    const gh = grandSize * LH + 4.8 * MM;
    if (sig) rect(x1, y, tw, gh, ACC_TINT, 1.6 * MM);
    if (ess || pos) rule(y, { color: INK, width: 0.4 * MM });
    if (exec) rule(y, { color: ACC, width: 0.3 * MM });
    const gx1 = sig ? x1 + 3 * MM : x1, gx2 = sig ? x2 - 3 * MM : x2;
    const gc = sig ? ACC_DARK : INK;
    text(m.total.label, gx1, y + 2.4 * MM, { size: grandSize, font: bold, color: gc });
    text(m.total.value, gx2, y + 2.4 * MM, { size: grandSize, font: bold, color: gc, align: "right" });
    y += gh;
    if (exec || pos) rule(y, { color: exec ? ACC : INK, width: exec ? 0.3 * MM : 0.4 * MM });
    if (m.paid) {
      y += 1 * MM; text("Paid", x1, y, { color: INK2 }); text(m.paid.paid, x2, y, { align: "right" }); y += base * LH + 1 * MM;
      text("Balance", x1, y, { font: bold }); text(m.paid.balance, x2, y, { font: bold, align: "right" }); y += base * LH + 1 * MM;
    }
  }

  // ---------------------------------------------------------------- receipt rows
  if (m.receipt) {
    const rowH = base * LH + (pos ? 1.6 : 3.2) * MM;
    const all = m.receipt.rows.map(([k, v]) => ({ k, v: wrap(bold, v, base, CW * 0.6) }));
    const h = (pos ? 2 : 5) * MM + all.reduce((s, r) => s + rowH + (r.v.length - 1) * base * LH, 0) + 4 * MM + base * LH;
    y += (pos ? 2 : 5) * MM;
    if (!fits(h)) newPage();
    for (const r of all) {
      const ty = y + (pos ? 0.8 : 1.6) * MM;
      text(r.k, M, ty, { color: INK2 });
      r.v.forEach((l, i) => text(l, W - M, ty + i * base * LH, { font: bold, align: "right" }));
      y += rowH + (r.v.length - 1) * base * LH;
      rule(y, pos ? { color: INK3, dash: [0.6, 1] } : {});
    }
    y += 4 * MM;
    const thanks = m.receipt.fullyPaid ? "Paid in full. Thank you for your business." : "Part payment received. Thank you.";
    for (const l of wrap(bold, thanks, base, CW)) { text(l, pos ? W / 2 : M, y, { font: bold, align: pos ? "center" : "left" }); y += base * LH; }
  }

  // ---------------------------------------------------------------- blocks
  const blocks = [
    ...m.payBlocks.map((b) => ({ title: b.title, bank: b.bank, text: b.text, link: Boolean(b.link) })),
    ...(m.notes ? [{ title: "Notes", text: m.notes }] : []),
    ...(m.terms ? [{ title: "Terms", text: m.terms, wide: true }] : []),
    ...(m.accepted ? [{ accepted: true, text: m.accepted, wide: true }] : []),
  ];
  if (blocks.length) {
    const cols = pos ? 1 : 2;
    const gapX = 6 * MM;
    const colW = (CW - gapX * (cols - 1)) / cols;
    const layout = (b, w) => {
      const parts = [];
      if (b.title) parts.push({ kind: "label", value: b.title });
      if (b.bank) {
        wrap(F.sansBold, b.bank.name, base, w).forEach((l) => parts.push({ kind: "bold", value: l }));
        parts.push({ kind: "bank", value: b.bank.number });
        wrap(body, b.bank.account, base, w).forEach((l) => parts.push({ kind: "text", value: l }));
      }
      const pad = b.accepted ? 3 * MM : 0;
      wrap(body, b.text, base, w - pad * 2).forEach((l) => parts.push({ kind: b.link ? "link" : b.accepted ? "accepted" : "text", value: l }));
      const lh = (p) => (p.kind === "label" ? base * 0.72 * LH + 0.8 * MM : p.kind === "bank" ? base * 1.2 * LH : base * LH);
      return { parts, h: parts.reduce((s, p) => s + lh(p), 0) + pad * 2, lh, pad };
    };
    y += (pos ? 3 : 8) * MM;
    if (!fits(10 * MM)) newPage();
    if (pos) dashed(y); else rule(y);
    y += (pos ? 2.5 : 5) * MM;
    // place blocks in rows of `cols`; wide blocks take a full row
    const rows = [];
    for (const b of blocks) {
      if (b.wide || cols === 1) rows.push([b]);
      else if (rows.length && rows.at(-1).length < cols && !rows.at(-1)[0].wide) rows.at(-1).push(b);
      else rows.push([b]);
    }
    for (const row of rows) {
      const laid = row.map((b) => ({ b, ...layout(b, b.wide ? CW : colW) }));
      const h = Math.max(...laid.map((l) => l.h));
      if (!fits(Math.min(h, 40 * MM))) newPage();
      laid.forEach((l, i) => {
        const x = M + i * (colW + gapX);
        let by = y;
        if (l.b.accepted) rect(x, by, l.b.wide ? CW : colW, l.h, ess ? rgb(1, 1, 1) : rgb(0.933, 0.973, 0.949));
        if (l.b.accepted && ess) page.drawRectangle({ x, y: H - by - l.h, width: CW, height: l.h, borderColor: INK, borderWidth: 0.25 * MM });
        by += l.pad;
        for (const p of l.parts) {
          if (!fits(l.lh(p))) { newPage(); by = y; }
          if (p.kind === "label") label(p.value, x, by);
          else if (p.kind === "bold") text(p.value, x, by, { font: F.sansBold, color: INK2 });
          else if (p.kind === "bank") text(p.value, x, by, { size: base * 1.2, font: F.sansBold, spacing: base * 1.2 * 0.04 });
          else if (p.kind === "link") text(p.value, x, by, { color: INK });
          else if (p.kind === "accepted") text(p.value, x + l.pad, by, { color: ess ? INK : rgb(0.051, 0.42, 0.247) });
          else text(p.value, x, by, { color: INK2 });
          by += l.lh(p);
        }
      });
      y += h + (pos ? 2.5 : 5) * MM;
    }
  }

  } // end of the shared layout (styled receipts drew their own above)

  // ---------------------------------------------------------------- signature
  if (m.signature) {
    const sigImg = m.signature.image ? await embedLogo(pdf, m.signature.image) : null;
    const boxW = thermal ? CW * 0.7 : 62 * MM;
    const smallSheet = ["a5", "half"].includes(m.paper);
    const maxImgH = (thermal ? 12 : smallSheet ? 11 : 16) * MM;
    const imgH = sigImg ? Math.min(maxImgH, (boxW / sigImg.width) * sigImg.height) : (smallSheet ? 8 : 12) * MM;
    const small = base * 0.86;
    const h = 4 * MM + imgH + 2.5 * MM + (m.signature.name ? base * LH : 0) + (m.signature.title ? small * LH : 0) + small * LH;
    y += (thermal || (styled && small) ? 4 : 7) * MM;
    if (!fits(h)) newPage();
    const x = thermal ? M + (CW - boxW) / 2 : W - M - boxW;
    if (sigImg) {
      const sc = imgH / sigImg.height;
      page.drawImage(sigImg, { x: x + (boxW - sigImg.width * sc) / 2, y: H - y - imgH, width: sigImg.width * sc, height: imgH });
    }
    y += imgH + 1 * MM;
    rule(y, { x1: x, x2: x + boxW, color: INK3 });
    y += 1.5 * MM;
    if (m.signature.name) { text(m.signature.name, x + boxW / 2, y, { font: bold, align: "center" }); y += base * LH; }
    if (m.signature.title) { text(m.signature.title, x + boxW / 2, y, { size: small, color: INK3, align: "center" }); y += small * LH; }
    text("AUTHORISED SIGNATURE", x + boxW / 2, y + 0.6 * MM, { size: small * 0.82, font: F.sansBold, color: INK3, align: "center", spacing: 0.4 });
    y += small * LH + 1 * MM;
  }

  // contact footer (sheets only; small paper already shows it under "From")
  if (styled && t === "ledger" && !small) {
    const lines = m.business.lines.slice(0, 3);
    const gap = small ? 5 * MM : 10 * MM;
    const h = gap + lines.length * base * LH;
    if (!fits(h)) newPage();
    y += gap;
    lines.forEach((l, i) => text(l, M, y + i * base * LH, { color: ACC, maxWidth: CW * 0.6 }));
    text(m.business.name, W - M, y + (lines.length - 1) * base * LH - base * 0.3, { size: base * 1.3, font: F.sansBold, color: ACC, align: "right" });
    y += lines.length * base * LH;
  }

  // ---------------------------------------------------------------- footer
  const footer = m.business.footer || (thermal ? "Thank you" : "");
  if (footer) {
    const size = base * (pos ? 1 : 0.82);
    const fl = wrap(pos ? F.sansBold : body, footer, size, CW);
    const tight = styled && small;
    const h = (pos ? 5 : tight ? 5 : 11) * MM + fl.length * size * LH;
    y += pos ? 0 : tight ? 2 * MM : 3 * MM;
    if (!fits(h)) newPage();
    if (pos) dashed(y); else rule(y);
    y += (pos || tight ? 2 : 3) * MM;
    fl.forEach((l) => { text(l, W / 2, y, { size, font: pos ? F.sansBold : body, color: pos ? INK : INK3, align: "center" }); y += size * LH; });
  }

  if (styled && t === "bold") {
    const sh = 4 * MM;
    page.drawRectangle({ x: 0, y: 0, width: W * 0.52, height: sh, color: ACC });
    const slash = (x0) => page.drawSvgPath(`M ${2 * MM} 0 L ${W * 0.03 + 2 * MM} 0 L ${W * 0.03} ${sh} L 0 ${sh} Z`, { x: x0, y: sh, color: NAVY, borderWidth: 0 });
    slash(W * 0.52 + 1.5 * MM); slash(W * 0.55 + 3 * MM);
  }

  // ---------------------------------------------------------------- page numbers / roll length
  if (thermal) {
    const used = Math.ceil(y + M);
    page.setMediaBox(0, H - used, W, used);
    page.setCropBox(0, H - used, W, used);
  } else {
    pages.forEach((p, i) => {
      const lbl = `${m.number}  ·  Page ${i + 1} of ${pages.length}`;
      const size = base * 0.72;
      p.drawText(lbl, { x: W - M - F.sans.widthOfTextAtSize(lbl, size), y: M / 2 - size / 2, size, font: F.sans, color: INK3 });
    });
  }

  pdf.setTitle(`${m.title} ${m.number} — ${m.business.name}`);
  pdf.setAuthor(m.business.name);
  pdf.setCreator("Usetally");
  return pdf.save();
}
