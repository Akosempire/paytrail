// Template library and paper sizes. Shared by the live preview, the print
// pages and the PDF renderer so all three agree. The database mirrors the
// compatibility rules in template_fits() (migration 20261024000500).

export const MM = 72 / 25.4; // PDF points per millimetre

export const PAPERS = {
  a4: { label: "A4", detail: "210 × 297 mm", w: 210, h: 297, margin: 16 },
  letter: { label: "US Letter", detail: "8.5 × 11 in", w: 215.9, h: 279.4, margin: 16 },
  a5: { label: "A5", detail: "148 × 210 mm", w: 148, h: 210, margin: 11 },
  half: { label: "Half letter", detail: "5.5 × 8.5 in", w: 139.7, h: 215.9, margin: 10 },
  thermal80: { label: "Receipt 80 mm", detail: "Thermal roll", w: 80, h: null, margin: 4, thermal: true },
  thermal58: { label: "Receipt 58 mm", detail: "Thermal roll", w: 58, h: null, margin: 3, thermal: true },
};

export const TEMPLATES = {
  essential: {
    name: "Essential",
    description: "Monochrome and ink-efficient. Prints well on any printer.",
    kinds: ["quote", "invoice", "receipt"],
    papers: ["a4", "letter", "a5", "half"],
    accent: false,
  },
  signature: {
    name: "Signature",
    description: "Modern and clean, with a restrained accent colour.",
    kinds: ["quote", "invoice", "receipt"],
    papers: ["a4", "letter", "a5", "half"],
    accent: true,
    recommended: true,
  },
  executive: {
    name: "Executive",
    description: "Refined serif typography for professional services.",
    kinds: ["quote", "invoice", "receipt"],
    papers: ["a4", "letter", "a5"],
    accent: true,
  },
  ledger: {
    name: "Ledger",
    description: "Colour band, boxed summary and a ruled table.",
    kinds: ["receipt"],
    papers: ["a4", "letter", "a5", "half"],
    accent: true,
    needsUpdate: true, // needs supabase/RUN_NEW_2026-10-25d.sql
  },
  bold: {
    name: "Bold",
    description: "Dark header, colour stripe and a strong total bar.",
    kinds: ["receipt"],
    papers: ["a4", "letter", "a5", "half"],
    accent: true,
    needsUpdate: true,
  },
  pos: {
    name: "POS Compact",
    description: "Dense layout for thermal receipt printers.",
    kinds: ["receipt", "invoice"],
    papers: ["thermal80", "thermal58"],
    accent: false,
  },
};

export const SIGNATURE_BLUE = "#175cd3";

// sections a business can show or hide; true = shown by default
export const SECTIONS = {
  logo: { label: "Logo", default: true },
  business_details: { label: "Business address & contacts", default: true },
  customer_details: { label: "Customer address & contacts", default: true },
  item_details: { label: "Item descriptions", default: true },
  tax_id: { label: "Tax ID (TIN)", default: true },
  payment_instructions: { label: "Payment instructions", default: true },
  bank_details: { label: "Bank transfer details", default: true },
  notes: { label: "Notes", default: true },
  terms: { label: "Terms", default: true },
  signature: { label: "Signature", default: true },
  footer: { label: "Footer note", default: true },
};

export const DOC_KINDS = { quote: "Quotation", invoice: "Invoice", receipt: "Receipt" };

export function fits(kind, template, paper) {
  const t = TEMPLATES[template];
  return Boolean(t && PAPERS[paper] && t.kinds.includes(kind) && t.papers.includes(paper));
}

// newer templates are offered only once the database knows them (extra = true)
export function templatesFor(kind, { extra = true } = {}) {
  return Object.entries(TEMPLATES).filter(([, t]) => t.kinds.includes(kind) && (extra || !t.needsUpdate)).map(([id, t]) => ({ id, ...t }));
}

export function papersFor(kind, template) {
  const t = TEMPLATES[template];
  return t ? t.papers.filter((p) => fits(kind, template, p)) : [];
}

export function usesLetter(country) {
  return ["us", "usa", "united states", "united states of america", "ca", "canada", "mx", "mexico"].includes(String(country || "").trim().toLowerCase());
}

// the business default for a document type (same rules as document_default() in SQL)
export function defaultLayout(business, kind) {
  const letter = usesLetter(business?.country);
  const pref = business?.document_prefs?.[kind] || {};
  let template = pref.template || "signature";
  let paper = pref.paper || (kind === "receipt" ? (letter ? "half" : "a5") : letter ? "letter" : "a4");
  if (!fits(kind, template, paper)) { template = "signature"; paper = letter ? "letter" : "a4"; }
  return { template, paper, layout: pref.layout || {} };
}

// fills in anything missing and keeps the combination valid
export function resolveLayout({ kind, template, paper, layout }, business) {
  const def = defaultLayout(business, kind);
  let t = template || def.template;
  let p = paper || def.paper;
  if (!fits(kind, t, p)) {
    if (TEMPLATES[t] && papersFor(kind, t).length) p = papersFor(kind, t)[0];
    else { t = def.template; p = def.paper; }
  }
  const raw = layout && Object.keys(layout).length ? layout : def.layout || {};
  const sections = Object.fromEntries(Object.entries(SECTIONS).map(([k, s]) => [k, raw.sections?.[k] ?? s.default]));
  const accent = /^#[0-9a-f]{6}$/i.test(raw.accent || "") ? raw.accent : null;
  return { template: t, paper: p, sections, accent };
}

// sanitises layout input from a form or the editor
export function cleanLayout(input) {
  const out = { sections: {} };
  for (const k of Object.keys(SECTIONS)) {
    if (input?.sections && k in input.sections) out.sections[k] = Boolean(input.sections[k]);
  }
  if (/^#[0-9a-f]{6}$/i.test(input?.accent || "")) out.accent = input.accent.toLowerCase();
  return out;
}

// accent colour for a template: Essential and POS are always ink
export function accentFor(template, layoutAccent, brandColor) {
  if (!TEMPLATES[template]?.accent) return "#111111";
  if (layoutAccent) return layoutAccent;
  if (template === "signature") return SIGNATURE_BLUE;
  if (/^#[0-9a-f]{6}$/i.test(brandColor || "")) return brandColor;
  return template === "bold" ? "#e0a526" : template === "ledger" ? "#1d4fa0" : "#1f2a44";
}
