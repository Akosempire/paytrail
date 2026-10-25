import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, setCharacterSpacing } from "pdf-lib";
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
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
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

  // ---------------------------------------------------------------- signature
  if (m.signature) {
    const sigImg = m.signature.image ? await embedLogo(pdf, m.signature.image) : null;
    const boxW = thermal ? CW * 0.7 : 62 * MM;
    const maxImgH = (thermal ? 12 : 16) * MM;
    const imgH = sigImg ? Math.min(maxImgH, (boxW / sigImg.width) * sigImg.height) : 12 * MM;
    const small = base * 0.86;
    const h = 4 * MM + imgH + 2.5 * MM + (m.signature.name ? base * LH : 0) + (m.signature.title ? small * LH : 0) + small * LH;
    y += (thermal ? 4 : 7) * MM;
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

  // ---------------------------------------------------------------- footer
  const footer = m.business.footer || (thermal ? "Thank you" : "");
  if (footer) {
    const size = base * (pos ? 1 : 0.82);
    const fl = wrap(pos ? F.sansBold : body, footer, size, CW);
    const h = (pos ? 5 : 11) * MM + fl.length * size * LH;
    y += pos ? 0 : 3 * MM;
    if (!fits(h)) newPage();
    if (pos) dashed(y); else rule(y);
    y += (pos ? 2 : 3) * MM;
    fl.forEach((l) => { text(l, W / 2, y, { size, font: pos ? F.sansBold : body, color: pos ? INK : INK3, align: "center" }); y += size * LH; });
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
