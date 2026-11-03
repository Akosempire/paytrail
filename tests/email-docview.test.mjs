import test from "node:test";
import assert from "node:assert/strict";

// The customer opens the email and sees the document itself: logo, items,
// totals, how to pay and terms, not just a notice with a button.
const { documentCard, documentText, documentBlock } = await import("../lib/email-docview.js");
const { documentEmail, sentDocumentEmail, receiptEmail, invoiceReminderEmail } = await import("../lib/emails.js");

const model = {
  kind: "invoice", title: "Invoice", number: "INV-0042", accent: "#1d4ed8", template: "classic",
  business: { name: "Ada & Co", logo: "/media/logos/ada.png", lines: ["12 Allen Avenue, Ikeja", "ada@example.com"], footer: "Thank you for your business" },
  customer: { label: "Bill to", name: "Tunde <Ltd>", lines: ["tunde@example.com"] },
  meta: [["Issued", "3 Nov 2026"], ["Due", "17 Nov 2026"]],
  docTitle: "Website refresh",
  items: [{ description: "Homepage design", details: "Two rounds of changes", quantity: 1, unit: "₦150,000.00", amount: "₦150,000.00" }, { description: "Product photos", details: "", quantity: 12, unit: "₦5,000.00", amount: "₦60,000.00" }],
  totals: [["Subtotal", "₦210,000.00"], ["VAT (7.5%)", "₦15,750.00"]],
  total: { label: "Total due", value: "₦225,750.00" },
  paid: null, receipt: null,
  payBlocks: [{ title: "Bank transfer", bank: { name: "GTBank", number: "0123456789", account: "Ada & Co" }, text: "Use INV-0042 as your reference." }],
  notes: "", terms: "Payment due within 14 days.\nLate fees may apply.", stamp: null,
};
const business = { name: "Ada & Co", brand_color: "#1d4ed8" };
const doc = { kind: "invoice", number: "INV-0042", customer_name: "Tunde Bello", total_minor: 22575000, amount_paid_minor: 0, currency: "NGN", due_date: "2026-11-17", title: "Website refresh" };
const link = "https://usetally.cc/d/tok123";

test("the card shows the whole document, escaped", () => {
  const html = documentCard(model, { site: "https://usetally.cc" });
  for (const s of ["INV-0042", "Homepage design", "Two rounds of changes", "Product photos", "₦225,750.00", "VAT (7.5%)", "GTBank", "0123456789", "Use INV-0042 as your reference.", "Payment due within 14 days.<br>Late fees may apply.", "Website refresh", "12 Allen Avenue, Ikeja", "Thank you for your business"]) assert.ok(html.includes(s), s);
  assert.ok(html.includes('src="https://usetally.cc/media/logos/ada.png"'), "relative logo made absolute");
  assert.ok(html.includes("Tunde &lt;Ltd&gt;") && !html.includes("Tunde <Ltd>"), "escaped");
  assert.ok(html.includes("#1d4ed8"), "template accent");
});

test("no site for a relative logo: the business name instead of a broken image", () => {
  const html = documentCard(model);
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("Ada &amp; Co"));
});

test("receipts show the amount paid and a PAID stamp", () => {
  const r = { ...model, kind: "receipt", title: "Receipt", number: "RCT-0007", items: [], payBlocks: [], terms: "", stamp: "PAID", receipt: { amount: "₦225,750.00", rows: [["Payment method", "Bank transfer"], ["For", "Invoice INV-0042"]], fullyPaid: true } };
  const html = documentCard(r);
  assert.ok(html.includes("Amount paid") && html.includes("PAID") && html.includes("Invoice INV-0042"));
  assert.ok(documentText(r).includes("Amount paid: ₦225,750.00"));
});

test("invoice email: the document is in the body, the details summary goes", () => {
  const e = documentEmail({ business, doc, link, model, attached: true });
  assert.ok(e.html.includes("Homepage design") && e.html.includes("0123456789"));
  assert.ok(e.html.includes("View &amp; pay invoice"), "pay button stays");
  assert.ok(e.html.includes("attached as a PDF"));
  assert.ok(e.text.includes("Homepage design  1 × ₦150,000.00 = ₦150,000.00"));
  assert.ok(e.text.includes("Total due: ₦225,750.00"));
  assert.ok(!e.text.includes("Amount due:"), "the summary isn't repeated");
});

test("without a model the email is as before", () => {
  const e = documentEmail({ business, doc, link });
  assert.ok(e.html.includes("Amount due") && !e.html.includes("Homepage design"));
});

test("send sheet, reminders and receipts carry the document too", () => {
  assert.ok(sentDocumentEmail({ business, doc, link, model, subject: "Your invoice", paragraphs: ["Hi Tunde,", "Here it is."] }).html.includes("Product photos"));
  assert.ok(invoiceReminderEmail({ business, doc, link, model, subject: "Reminder", message: "Just a reminder." }).html.includes("Product photos"));
  const receipt = { number: "RCT-0007", amount_minor: 22575000, currency: "NGN", paid_at: "2026-11-03" };
  assert.ok(receiptEmail({ business, receipt, documentNumber: "INV-0042", link, model: { ...model, stamp: "PAID" } }).html.includes("PAID"));
  assert.equal(documentBlock(null), undefined);
});

test("very long item lists are shortened so Gmail doesn't clip the email", () => {
  const items = Array.from({ length: 55 }, (_, i) => ({ description: `Line ${i + 1}`, details: "", quantity: 1, unit: "₦1.00", amount: "₦1.00" }));
  const html = documentCard({ ...model, items });
  assert.ok(html.includes("Line 40") && !html.includes("Line 41<"));
  assert.ok(html.includes("+ 15 more items"));
  assert.ok(html.length < 60000);
});

test("logo addresses: only http(s) or this site's own paths", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "media/x.png"]) assert.ok(!documentCard({ ...model, business: { ...model.business, logo: bad } }, { site: "https://usetally.cc" }).includes("<img"), bad);
  assert.ok(!documentCard({ ...model, accent: "red;background:url(x)" }).includes("url(x)"), "accent must be a hex colour");
});
