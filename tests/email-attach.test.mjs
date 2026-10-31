import test from "node:test";
import assert from "node:assert/strict";

// Customer emails carry the document in the business's chosen template, and still
// go out (worded without "attached") if the provider won't take the file.
process.env.SENDBYTE_API_KEY = "sk_test_abcdefgh123";
process.env.MAIL_FROM = "Usetally <hello@usetally.cc>";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;

const calls = [];
let refuseAttachments = false;
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body });
  if (refuseAttachments && body.attachments) return new Response(JSON.stringify({ error: { message: "attachment too large" } }), { status: 422 });
  return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
};

const { sendEmail } = await import("../lib/email.js");
const { withDocument, emailColor } = await import("../lib/email-document.js");
const { documentEmail } = await import("../lib/emails.js");
const { buildModel } = await import("../lib/doc-model.js");
const { renderPdf } = await import("../lib/pdf.js");
const { business, doc, items } = await import("./fixtures/docs.mjs");

test("the PDF goes to Sendbyte as a base64 attachment, and the email says so", async () => {
  calls.length = 0;
  const d = doc({ template: "casefile", status: "sent" });
  const model = buildModel({ doc: d, items: items(), business });
  const pdf = Buffer.from(await renderPdf(model));
  const extra = { attachment: { filename: `${d.number}.pdf`, content: pdf, contentType: "application/pdf" }, color: emailColor(model, business) };
  const msg = withDocument(({ color, attached }) => documentEmail({ business, logo: null, doc: d, link: "https://usetally.cc/d/x", color, attached }), extra);
  const r = await sendEmail({ to: "chioma@obifoods.ng", ...msg });
  assert.equal(r.sent, true);
  assert.equal(r.attached, true);
  const sent = calls.at(-1).body;
  assert.equal(sent.attachments.length, 1);
  assert.equal(sent.attachments[0].filename, "INV-0042.pdf");
  assert.equal(sent.attachments[0].content_type, "application/pdf");
  assert.equal(Buffer.from(sent.attachments[0].content, "base64").subarray(0, 4).toString(), "%PDF");
  assert.match(sent.html, /attached as a PDF/);
  assert.match(sent.html, new RegExp(model.accent, "i")); // the email takes the template's colour
});

test("if the provider refuses the file, the email still goes, without claiming it's attached", async () => {
  calls.length = 0;
  refuseAttachments = true;
  const d = doc({ status: "sent" });
  const extra = { attachment: { filename: "x.pdf", content: Buffer.from("%PDF-1.7"), contentType: "application/pdf" }, color: null };
  const msg = withDocument(({ color, attached }) => documentEmail({ business, logo: null, doc: d, link: "https://usetally.cc/d/x", color, attached }), extra);
  const r = await sendEmail({ to: "chioma@obifoods.ng", ...msg, noReport: true });
  refuseAttachments = false;
  assert.equal(r.sent, true);
  assert.equal(r.attached, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.attachments, undefined);
  assert.doesNotMatch(calls[1].body.html, /attached as a PDF/);
});

test("Notebook's pale highlighter isn't used as the email colour", () => {
  assert.equal(emailColor({ template: "notebook", accent: "#f5c842" }, { brand_color: "#7a2e8f" }), "#7a2e8f");
  assert.equal(emailColor({ template: "casefile", accent: "#3fae6a" }, { brand_color: "#7a2e8f" }), "#3fae6a");
  assert.equal(emailColor(null, { brand_color: "#123456" }), "#123456");
});
