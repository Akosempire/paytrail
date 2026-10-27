// "File & pay for me": a request goes to the least busy consultant (who is
// emailed), the platform owner is told, the business is emailed when it's
// filed, and reminders go out 7 and 2 days before the 21st.
import test from "node:test";
import assert from "node:assert/strict";

process.env.SENDBYTE_API_KEY = "sk_live_vat_returns_test";
process.env.MAIL_FROM = "Usetally <hello@usetally.cc>";
process.env.ADMIN_ALERT_EMAILS = "founder@usetally.test";
process.env.NEXT_PUBLIC_SITE_URL = "https://usetally.test";
delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SENDHIIV_API_KEY; delete process.env.SMTP_HOST;
const vr = await import("../lib/vat-returns.js");

const BIZ = "11111111-1111-4111-8111-111111111111";
let mails;
function setup() {
  mails = [];
  globalThis.__fakeDb = { tables: {
    businesses: [{ id: BIZ, name: "Ade Studio", currency: "NGN", tax_id: "1234-0001" }],
    memberships: [{ business_id: BIZ, role: "owner", email: "ade@studio.test" }, { business_id: BIZ, role: "finance", email: "fin@studio.test" }, { business_id: BIZ, role: "junior_finance", email: "jr@studio.test" }],
    documents: [
      { business_id: BIZ, kind: "invoice", sent_at: "x", status: "sent", issue_date: "2026-10-05", tax_minor: 5000000, total_minor: 71666700, currency: "NGN" },
      { business_id: BIZ, kind: "invoice", sent_at: "x", status: "void", issue_date: "2026-10-06", tax_minor: 999, total_minor: 999, currency: "NGN" },
      { business_id: BIZ, kind: "invoice", sent_at: "x", status: "paid", issue_date: "2026-10-20", tax_minor: 3025000, total_minor: 43358300, currency: "NGN" },
    ],
    tax_consultants: [
      { id: "c1", name: "Tolu Bello", email: "tolu@tax.test", active: true, access_token: "a".repeat(48), created_at: "1" },
      { id: "c2", name: "Kemi Ade", email: "kemi@tax.test", active: true, access_token: "b".repeat(48), created_at: "2" },
      { id: "c3", name: "Paused", email: "p@tax.test", active: false, access_token: "c".repeat(48), created_at: "3" },
    ],
    vat_returns: [{ id: "busy", business_id: "other", period: "2026-09", status: "requested", consultant_id: "c1", vat_minor: 1 }],
    vat_return_files: [], monitor_events: [], platform_settings: [{ id: true }], platform_admins: [],
  }, unique: { vat_returns: ["id"] }, rpc: async () => ({ data: null, error: null }) };
  globalThis.fetch = async (url, init) => { if (String(url).includes("sendbyte")) { const b = JSON.parse(init.body); if (b.subject) mails.push(b); return new Response("{}", { status: 201 }); } return new Response("{}", { status: 404 }); };
}
const ctx = { business: { id: BIZ, name: "Ade Studio", currency: "NGN", tax_id: "1234-0001" }, member: { full_name: "Ade" }, user: { email: "ade@studio.test" } };
const ret = () => globalThis.__fakeDb.tables.vat_returns.find((r) => r.business_id === BIZ);

test("a request goes to the least busy active consultant, who is emailed; you're told too", async () => {
  setup();
  const r = await vr.requestFiling(ctx, "2026-10", "We had a refund");
  assert.match(r.message, /Kemi Ade/);
  assert.equal(ret().status, "requested");
  assert.equal(ret().consultant_id, "c2");
  assert.equal(ret().vat_minor, 8025000, "VAT from sent invoices, not void ones");
  const toConsultant = mails.find((m) => m.to === "kemi@tax.test");
  assert.ok(toConsultant, "consultant emailed");
  assert.match(toConsultant.html, /consultant\/b{48}/);
  assert.ok(mails.some((m) => m.to === "founder@usetally.test" && /VAT filing request/.test(m.subject)), "platform owner emailed");
  assert.match((await vr.requestFiling(ctx, "2026-10")).error, /already/);
});

test("filing emails the money people (not junior staff) with the amount and reference", async () => {
  setup();
  await vr.requestFiling(ctx, "2026-10");
  mails = [];
  const r0 = ret();
  const f = await vr.markFiled(globalThis.__fakeDb.tables && (await import("../tests/fixtures/fake-supabase.mjs")).createSupabaseService(), r0, { reference: "FIL-1", amountDue: 8025000, paymentReference: "RRR-123", by: "Kemi Ade (tax consultant)" });
  assert.ok(f.ok);
  assert.equal(ret().status, "filed");
  await vr.notifyFiled((await import("../tests/fixtures/fake-supabase.mjs")).createSupabaseService(), { ...ret(), payment_reference: "RRR-123" }, ctx.business, { amount: 8025000, by: "Kemi Ade" });
  assert.deepEqual(mails.map((m) => m.to).sort(), ["ade@studio.test", "fin@studio.test"]);
  assert.match(mails[0].subject, /October 2026 VAT return is filed: pay ₦80,250/);
  assert.match(mails[0].html, /RRR-123/);
});

test("reminders: 7 days and 2 days before the 21st, once each; not while a consultant is on it", async () => {
  setup();
  const at = (d) => new Date(`2026-11-${d}T08:00:00Z`);
  assert.equal((await vr.sendVatReminders(at("10"))).sent, 0, "too early");
  const r7 = await vr.sendVatReminders(at("14"));
  assert.equal(r7.sent, 2);
  assert.match(mails.at(-1).subject, /7 days left: October 2026 VAT return due/);
  assert.equal((await vr.sendVatReminders(at("15"))).sent, 0, "once");
  ret().status = "requested";
  assert.equal((await vr.sendVatReminders(at("19"))).sent, 0, "consultant is on it");
  ret().status = "filed";
  const r2 = await vr.sendVatReminders(at("19"));
  assert.equal(r2.sent, 2);
  assert.match(mails.at(-1).subject, /2 days left: October 2026 VAT payment due/);
});
