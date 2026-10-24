// Dev helper: writes sample PDFs for visual checks. node --import ./tests/register.mjs tests/render-samples.mjs OUT_DIR
import { writeFile } from "node:fs/promises";
import { buildModel } from "../lib/doc-model.js";
import { renderPdf } from "../lib/pdf.js";
import { business, doc, items } from "./fixtures/docs.mjs";
const out = process.argv[2];
const r = { number: "RC-0042", amount_minor: 125775000, currency: "NGN", balance_after_minor: 0, issued_at: "2026-10-24T10:00:00Z" };
const pay = { method: "paystack", reference: "PSK-88231", paid_at: "2026-10-24T10:00:00Z" };
const jobs = [
  ["sig-a4-invoice", doc(), items(5), null],
  ["ess-a4-quote", doc({ kind: "quote", number: "QT-0042", template: "essential", valid_until: "2026-11-07", status: "accepted", accepted_at: "2026-10-25T09:00:00Z", accepted_name: "Chioma Obi" }), items(5), null],
  ["exec-letter-invoice", doc({ template: "executive", paper: "letter", currency: "USD", status: "paid", amount_paid_minor: 125775000 }), items(4), null],
  ["sig-a5-receipt", doc({ status: "paid" }), items(3), { ...r, template: "signature", paper: "a5" }],
  ["pos-80-receipt", doc({ status: "paid" }), items(4), { ...r, template: "pos", paper: "thermal80" }],
  ["pos-58-receipt", doc({ status: "paid" }), items(3), { ...r, template: "pos", paper: "thermal58" }],
  ["sig-half-invoice", doc({ paper: "half", amount_paid_minor: 50000000, status: "partially_paid" }), items(3), null],
  ["sig-a4-long", doc(), items(60, true), null],
];
for (const [name, d, its, rec] of jobs) {
  const model = buildModel({ doc: d, items: its, business, receipt: rec, payment: rec ? pay : null, payLink: d.status === "sent" ? "https://paytrail.app/d/" + "a".repeat(48) : null });
  await writeFile(`${out}/${name}.pdf`, await renderPdf(model));
}
console.log("ok");
