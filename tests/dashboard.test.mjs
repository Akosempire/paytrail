import test from "node:test";
import assert from "node:assert/strict";
import { moneyFlow, nextAction } from "../lib/dashboard-core.js";

const inv = (o) => ({ kind: "invoice", status: "sent", currency: "NGN", amount_paid_minor: 0, ...o });
const today = "2026-11-01";

test("money flow: collected, owed and overdue as shares", () => {
  const f = moneyFlow({ collected: 44350000, outstanding: 70675000, overdue: 38700000 });
  assert.deepEqual(f.parts.map((p) => p.key), ["collected", "owed", "overdue"]);
  assert.equal(Math.round(f.parts.reduce((t, p) => t + p.pct, 0)), 100);
  assert.deepEqual(moneyFlow({}).parts, []);
  assert.deepEqual(moneyFlow({ collected: 100 }).parts.map((p) => p.key), ["collected"]);
});

test("do this next: money to confirm, then overdue, then accepted quotes, approvals, due soon, else caught up", () => {
  const late = inv({ id: "1", number: "INV-1", customer_name: "Kora", total_minor: 38700000, due_date: "2026-10-18" });
  const soon = inv({ id: "2", number: "INV-2", customer_name: "Obi", total_minor: 100000, due_date: "2026-11-03" });
  const claim = { document_id: "1", payer_name: "Chioma", amount_minor: 15000000, currency: "NGN", documents: { number: "INV-1" } };
  const quote = { id: "q", number: "QT-7", customer_name: "Emeka", total_minor: 500, currency: "NGN" };
  assert.equal(nextAction({ claims: [claim], unpaid: [late], today }).kind, "claim");
  const r = nextAction({ unpaid: [soon, late], today });
  assert.equal(r.kind, "remind"); assert.equal(r.doc.id, "1"); assert.match(r.detail, /14 days overdue/);
  assert.equal(nextAction({ unpaid: [soon, late], accepted: [quote], today, perms: { canSend: false } }).kind, "convert");
  assert.equal(nextAction({ approvals: [quote], today, perms: { canApprove: true } }).kind, "approve");
  assert.equal(nextAction({ approvals: [quote], today, perms: { canApprove: false } }).kind, "clear");
  const nudge = nextAction({ unpaid: [soon], today });
  assert.equal(nudge.kind, "remind"); assert.match(nudge.detail, /due in 2 days/);
  assert.equal(nextAction({ today }).title, "You're all caught up");
});
