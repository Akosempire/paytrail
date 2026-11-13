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
    // receipts follow the business's receipt default, so choose the combination through the override
    const model = buildModel({ doc: d, items: items(4), business, receipt, payment: receipt ? { method: "paystack", reference: "PSK-1", paid_at: "2026-10-24T10:00:00Z" } : null, override: receipt ? { template, paper } : {} });
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

test("Notebook and Case file: every document kind, sheet paper only, their own colours", async () => {
  const { fits, accentFor, NOTEBOOK_YELLOW, CASEFILE_GREEN } = await import("../lib/doc-templates.js");
  for (const tpl of ["notebook", "casefile"]) {
    for (const kind of ["quote", "invoice", "receipt"]) assert.ok(fits(kind, tpl, "a4"));
    assert.ok(!fits("invoice", tpl, "thermal80"));
  }
  assert.equal(accentFor("notebook", null, "#101828"), NOTEBOOK_YELLOW); // a dark brand colour is never the highlighter
  assert.equal(accentFor("casefile", null, null), CASEFILE_GREEN);
  assert.equal(accentFor("casefile", null, "#7a2e8f"), "#7a2e8f");
  assert.equal(accentFor("notebook", "#9be3b8", null), "#9be3b8");
});

test("sheet templates: stamp, due sentence and pay details follow the document", async () => {
  const { buildModel } = await import("../lib/doc-model.js");
  const business = { name: "Mikky Innovate", currency: "NGN", signatory_name: "Michael Adeyemo", signatory_title: "Designer", bank_account_number: "0123456789", bank_name: "GTBank", email: "hi@mikky.ng" };
  const base = { kind: "invoice", number: "INV-1", template: "casefile", paper: "a4", currency: "NGN", issue_date: "2099-10-29", due_date: "2099-11-12", customer_name: "Chioma", subtotal_minor: 100, total_minor: 100, amount_paid_minor: 0, tax_rate: 0, tax_minor: 0, discount_minor: 0 };
  const sent = buildModel({ doc: { ...base, status: "sent" }, items: [], business });
  assert.equal(sent.sheet.stamp, "DUE");
  assert.equal(sent.sheet.due, "Payment due within 14 days.");
  assert.equal(sent.sheet.bank.number, "0123456789");
  assert.equal(sent.sheet.tagline, "Michael Adeyemo · Designer");
  assert.equal(sent.signature, null); // the name is already under the logo
  const paid = buildModel({ doc: { ...base, status: "paid", amount_paid_minor: 100 }, items: [], business });
  assert.equal(paid.sheet.stamp, "PAID");
  assert.equal(paid.sheet.bank, null);
  assert.equal(paid.sheet.due, "");
  const quote = buildModel({ doc: { ...base, kind: "quote", status: "sent", due_date: null, valid_until: "2099-11-30" }, items: [], business });
  assert.equal(quote.sheet.stamp, "QUOTE");
  assert.match(quote.sheet.due, /valid until/);
  assert.equal(buildModel({ doc: { ...base, template: "signature", status: "sent" }, items: [], business }).sheet, null);
});

test("a document that only just spills over is shrunk onto one page; long ones keep extra pages", async () => {
  const many = (n) => Array.from({ length: n }, (_, i) => ({ description: `Item ${i + 1}`, details: "Detail line", quantity: 1, unit_price_minor: 1000000 }));
  const d = (n) => doc({ template: "signature", paper: "a4", subtotal_minor: n * 1000000, total_minor: n * 1000000, notes: "Thanks.", terms: "50% upfront." });
  const pagesOf = async (n, opts) => (await PDFDocument.load(await renderPdf(buildModel({ doc: d(n), items: many(n), business }), opts))).getPageCount();
  // find the first length that spills onto a second page without fitting
  let n = 4;
  while ((await pagesOf(n, { fit: false })) === 1) n++;
  assert.equal(await pagesOf(n, { fit: false }), 2);
  assert.equal(await pagesOf(n), 1);
  assert.ok((await pagesOf(40)) >= 2);
});

test("open invoices carry a scannable pay link; paid ones and receipts don't", async () => {
  const link = "https://usetally.cc/d/Xk3pQ9vT2mLw8RzN4bYc6HjF1sDa7GeK0uVoPiZqWxE";
  const open = buildModel({ doc: doc({ status: "sent" }), items: items(), business, payLink: link });
  assert.equal(open.payNow.link, link);
  assert.equal(open.payNow.short, "usetally.cc/d/Xk3pQ9…");
  assert.ok(open.payNow.qr.length >= 21 && open.payNow.qr.every((r) => /^[01]+$/.test(r) && r.length === open.payNow.qr.length));
  assert.match(open.payNow.amount, /due$/);
  assert.equal(buildModel({ doc: doc({ status: "paid", amount_paid_minor: doc().total_minor }), items: items(), business, payLink: link }).payNow, null);
  assert.equal(buildModel({ doc: doc({ status: "sent" }), items: items(), business }).payNow, null);
  const pdf = await PDFDocument.load(await renderPdf(open));
  const { PDFName } = await import("pdf-lib");
  const annots = pdf.getPage(pdf.getPageCount() - 1).node.lookup(PDFName.of("Annots")) || pdf.getPage(0).node.lookup(PDFName.of("Annots"));
  assert.ok(annots && annots.size() >= 1, "the pay link is clickable in the PDF");
});
