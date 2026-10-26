// Offline mode: changes made without internet show at once on the device, and
// when synced each change is applied exactly once, even if sent again.
import test from "node:test";
import assert from "node:assert/strict";

const { applyLocal } = await import("../lib/offline/engine.js");
const { applyOfflineOps } = await import("../lib/offline/apply.js");

const BIZ = "11111111-1111-4111-8111-111111111111", USER = "33333333-3333-4333-8333-333333333333";
const blank = () => ({ business: { currency: "NGN" }, documents: [], items: [], costs: [], customers: [], payments: [], receipts: [], presets: [] });

test("a document made offline shows straight away, with a temporary number and its totals", () => {
  const data = blank();
  applyLocal(data, { kind: "customer.save", customerId: "local:c1abcdef", form: { name: "Ada" } });
  applyLocal(data, { kind: "document.save", docId: "local:d1abcdef", input: { kind: "invoice", customer_id: "local:c1abcdef", tax_rate: 7.5, items: [{ description: "Work", quantity: 2, unit_price_minor: 50000 }] } });
  const d = data.documents[0];
  assert.equal(d.number, "Draft (offline)");
  assert.equal(d.status, "draft");
  assert.equal(d.customer_name, "Ada");
  assert.equal(d.subtotal_minor, 100000);
  assert.equal(d.total_minor, 107500);
  assert.equal(data.items.length, 1);
  // editing again replaces the items rather than adding to them
  applyLocal(data, { kind: "document.save", docId: "local:d1abcdef", input: { kind: "invoice", customer_id: "local:c1abcdef", items: [{ description: "Work", quantity: 1, unit_price_minor: 50000 }] } });
  assert.equal(data.documents.length, 1);
  assert.equal(data.items.length, 1);
  assert.equal(data.documents[0].total_minor, 50000);
});

test("sending and recording payments offline update the status", () => {
  const data = blank();
  applyLocal(data, { kind: "document.save", docId: "local:d2abcdef", input: { kind: "invoice", customer: { name: "Bola" }, items: [{ description: "x", quantity: 1, unit_price_minor: 10000 }] } });
  applyLocal(data, { kind: "document.send", docId: "local:d2abcdef", email: false });
  assert.equal(data.documents[0].status, "sent");
  applyLocal(data, { id: "op:p1", kind: "payment.record", docId: "local:d2abcdef", form: { amount: "40", method: "cash" } });
  assert.equal(data.documents[0].status, "partially_paid");
  assert.equal(data.documents[0].amount_paid_minor, 4000);
  applyLocal(data, { id: "op:p2", kind: "payment.record", docId: "local:d2abcdef", form: { amount: "60", method: "cash" } });
  assert.equal(data.documents[0].status, "paid");
  assert.equal(data.receipts.length, 2);
});

function fakeServer() {
  const calls = { save: 0, pay: 0, send: 0 };
  globalThis.__fakeDb = {
    tables: { offline_ops: [], customers: [], documents: [] },
    unique: { offline_ops: ["id"] },
    rpc: async (name, args) => {
      if (name === "save_document") {
        calls.save++;
        const id = args.doc_id || crypto.randomUUID();
        if (!args.doc_id) globalThis.__fakeDb.tables.documents.push({ id, business_id: BIZ, number: `INV-${String(calls.save).padStart(4, "0")}`, status: "draft", updated_at: new Date().toISOString() });
        return { data: id, error: null };
      }
      if (name === "record_manual_payment") { calls.pay++; return { data: null, error: null }; }
      if (name === "submit_document") { calls.send++; return { data: null, error: null }; }
      return { data: null, error: null };
    },
  };
  return calls;
}

test("syncing applies each offline change once, maps temporary ids, and a resend repeats nothing", async () => {
  const calls = fakeServer();
  const { createSupabaseService } = await import("../tests/fixtures/fake-supabase.mjs");
  const sb = createSupabaseService();
  const ctx = { supabase: sb, business: { id: BIZ, require_approval: true }, user: { id: USER }, member: { role: "junior_finance" } };
  const ops = [
    { id: "op:aaaaaaaa", kind: "customer.save", customerId: "local:c1abcdef", form: { name: "Ada", email: "ADA@x.test" } },
    { id: "op:bbbbbbbb", kind: "document.save", docId: "local:d1abcdef", input: { kind: "invoice", customer_id: "local:c1abcdef", items: [{ description: "Work", quantity: 1, unit_price_minor: 50000 }] } },
    { id: "op:cccccccc", kind: "document.send", docId: "local:d1abcdef", submit: true },
    { id: "op:dddddddd", kind: "payment.record", docId: "local:d1abcdef", form: { amount: "100", method: "cash" } },
  ];
  const first = await applyOfflineOps(ctx, sb, ops, {});
  assert.deepEqual(first.results.map((r) => Boolean(r.error)), [false, false, false, false], JSON.stringify(first.results));
  const realDoc = first.ids["local:d1abcdef"];
  assert.ok(realDoc && !realDoc.startsWith("local:"));
  assert.ok(first.ids["local:c1abcdef"]);
  assert.equal(first.results[1].number, "INV-0001");
  assert.equal(globalThis.__fakeDb.tables.customers[0].email, "ada@x.test");
  assert.deepEqual(calls, { save: 1, pay: 1, send: 1 });

  // the device didn't hear back and sends everything again
  const again = await applyOfflineOps(ctx, sb, ops, {});
  assert.ok(again.results.every((r) => r.repeated), JSON.stringify(again.results));
  assert.equal(again.ids["local:d1abcdef"], realDoc);
  assert.deepEqual(calls, { save: 1, pay: 1, send: 1 });
  assert.equal(globalThis.__fakeDb.tables.customers.length, 1);
});

test("a change that depends on one not yet synced waits instead of failing", async () => {
  fakeServer();
  const { createSupabaseService } = await import("../tests/fixtures/fake-supabase.mjs");
  const sb = createSupabaseService();
  const ctx = { supabase: sb, business: { id: BIZ }, user: { id: USER }, member: { role: "owner" } };
  const out = await applyOfflineOps(ctx, sb, [{ id: "op:eeeeeeee", kind: "payment.record", docId: "local:zzzzzzzz", form: { amount: "5", method: "cash" } }], {});
  assert.equal(out.results[0].retry, true);
  assert.equal(globalThis.__fakeDb.tables.offline_ops.length, 0, "the claim is released so it can run later");
});

test("a draft changed elsewhere while offline is kept as a separate copy", async () => {
  const calls = fakeServer();
  const { createSupabaseService } = await import("../tests/fixtures/fake-supabase.mjs");
  const sb = createSupabaseService();
  const docId = "44444444-4444-4444-8444-444444444444";
  globalThis.__fakeDb.tables.documents.push({ id: docId, business_id: BIZ, number: "INV-0009", status: "sent", updated_at: new Date().toISOString() });
  const ctx = { supabase: sb, business: { id: BIZ }, user: { id: USER }, member: { role: "owner" } };
  const out = await applyOfflineOps(ctx, sb, [{ id: "op:ffffffff", kind: "document.save", docId, baseUpdatedAt: "2020-01-01T00:00:00Z", input: { kind: "invoice", title: "Job", customer: { name: "Ada" }, items: [{ description: "x", quantity: 1, unit_price_minor: 100 }] } }], {});
  assert.equal(out.results[0].conflict, true);
  assert.notEqual(out.results[0].realId, docId);
  assert.equal(calls.save, 1);
});
