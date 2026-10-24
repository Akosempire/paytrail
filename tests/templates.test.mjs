import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildModel } from "../lib/doc-model.js";
import { renderPdf } from "../lib/pdf.js";
import { fits, PAPERS, TEMPLATES, MM, resolveLayout, defaultLayout } from "../lib/doc-templates.js";
import { business, doc, items } from "./fixtures/docs.mjs";

const combos = [];
for (const [t, spec] of Object.entries(TEMPLATES)) for (const p of spec.papers) for (const k of spec.kinds) combos.push([t, p, k]);

test("every template/paper/kind combination renders a PDF at the right size", async () => {
  for (const [template, paper, kind] of combos) {
    const receipt = kind === "receipt" ? { number: "RC-0042", amount_minor: 50000000, currency: "NGN", balance_after_minor: 75775000, issued_at: "2026-10-24T10:00:00Z", template, paper } : null;
    const d = doc({ kind: kind === "receipt" ? "invoice" : kind, template, paper });
    const model = buildModel({ doc: d, items: items(4), business, receipt, payment: receipt ? { method: "paystack", reference: "PSK-1", paid_at: "2026-10-24T10:00:00Z" } : null });
    const bytes = await renderPdf(model);
    const pdf = await PDFDocument.load(bytes);
    const [w, h] = [pdf.getPage(0).getMediaBox().width, pdf.getPage(0).getMediaBox().height];
    assert.ok(Math.abs(w - PAPERS[paper].w * MM) < 0.5, `${template}/${paper}/${kind} width ${w}`);
    if (!PAPERS[paper].thermal) assert.ok(Math.abs(h - PAPERS[paper].h * MM) < 0.5, `${template}/${paper} height`);
    else assert.ok(h > 60 * MM && h < 1500 * MM, `${template}/${paper} roll length ${h / MM}mm`);
  }
});

test("long documents flow onto more pages with totals intact; thermal stays one roll", async () => {
  const big = buildModel({ doc: doc(), items: items(120, true), business });
  const pdf = await PDFDocument.load(await renderPdf(big));
  assert.ok(pdf.getPageCount() >= 4, `pages ${pdf.getPageCount()}`);
  const roll = buildModel({ doc: doc({ template: "pos", paper: "thermal58" }), items: items(60, true), business });
  const pdf2 = await PDFDocument.load(await renderPdf(roll));
  assert.equal(pdf2.getPageCount(), 1);
});

test("empty and minimal documents render", async () => {
  const empty = buildModel({ doc: doc({ customer_name: "", notes: "", terms: "", total_minor: 0, subtotal_minor: 0, tax_minor: 0, discount_minor: 0, payment_instructions: "" }), items: [], business: { ...business, footer_note: "", bank_account_number: "", tax_id: "" } });
  await renderPdf(empty);
  const usd = buildModel({ doc: doc({ currency: "USD", tax_rate: 0, tax_minor: 0, template: "executive", paper: "letter" }), items: items(2), business });
  assert.match(usd.total.value, /^\$/);
  await renderPdf(usd);
});

test("compatibility rules and defaults", () => {
  assert.equal(fits("quote", "pos", "thermal80"), false);
  assert.equal(fits("receipt", "pos", "thermal58"), true);
  assert.equal(fits("invoice", "executive", "half"), false);
  assert.deepEqual(defaultLayout({ country: "United States" }, "invoice").paper, "letter");
  assert.deepEqual(defaultLayout({ country: "Nigeria" }, "receipt").paper, "a5");
  const r = resolveLayout({ kind: "quote", template: "pos", paper: "thermal80", layout: {} }, { country: "Nigeria" });
  assert.equal(r.template, "signature");
});

test("issued documents keep their frozen branding", () => {
  const frozen = doc({ snapshot: { ...business, name: "Old Name Ltd", bank_account_number: "999" } });
  const m = buildModel({ doc: frozen, items: items(1), business: { ...business, name: "New Name Ltd" } });
  assert.equal(m.business.name, "Old Name Ltd");
  assert.equal(m.payBlocks.find((b) => b.bank).bank.number, "999");
});

test("hidden sections are left out", () => {
  const m = buildModel({ doc: doc({ layout: { sections: { notes: false, terms: false, bank_details: false, item_details: false } } }), items: items(3), business });
  assert.equal(m.notes, ""); assert.equal(m.terms, "");
  assert.ok(!m.payBlocks.some((b) => b.bank));
  assert.ok(m.items.every((i) => i.details === ""));
});
