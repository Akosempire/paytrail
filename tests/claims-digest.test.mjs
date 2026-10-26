// The daily email to a team about bank transfers waiting to be confirmed:
// one email per business, each transfer included once.
import test from "node:test";
import assert from "node:assert/strict";

process.env.SENDHIIV_API_KEY = "sh_test_digest";
delete process.env.SUPABASE_SERVICE_ROLE_KEY; // use the key above, not dashboard settings
const { sendClaimDigests } = await import("../lib/claims-digest.js");

test("one email per team member, then those transfers aren't sent again", async () => {
  const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002";
  globalThis.__fakeDb = { tables: {
    payment_claims: [
      { id: "c1", business_id: A, document_id: "d1", amount_minor: 1500000, currency: "NGN", payer_name: "Chioma", status: "pending", digest_sent_at: null, created_at: "1", documents: { number: "INV-0011" } },
      { id: "c2", business_id: A, document_id: "d2", amount_minor: 500000, currency: "NGN", payer_name: "Emeka", status: "pending", digest_sent_at: null, created_at: "2", documents: { number: "INV-0012" } },
      { id: "c3", business_id: B, document_id: "d3", amount_minor: 1000, currency: "NGN", payer_name: "Bo", status: "confirmed", digest_sent_at: null, created_at: "3", documents: { number: "INV-0001" } },
    ],
    businesses: [{ id: A, name: "Adeyemi Studio" }, { id: B, name: "Other" }],
    memberships: [{ business_id: A, email: "owner@a.test", role: "owner" }, { business_id: A, email: "fin@a.test", role: "finance" }, { business_id: A, email: "jr@a.test", role: "junior_finance" }],
  }, rpc: async () => ({ data: null, error: null }) };
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true }), { status: 200 }); };

  const r = await sendClaimDigests();
  assert.equal(r.businesses, 1);
  assert.equal(sent.length, 2, "owner and finance, not junior");
  const body = JSON.stringify(sent[0]);
  assert.match(body, /2 bank transfers to confirm for Adeyemi Studio/);
  assert.match(body, /INV-0011/);
  assert.match(body, /INV-0012/);
  assert.ok(globalThis.__fakeDb.tables.payment_claims.filter((c) => c.business_id === A).every((c) => c.digest_sent_at));

  sent.length = 0;
  await sendClaimDigests();
  assert.equal(sent.length, 0);
});
