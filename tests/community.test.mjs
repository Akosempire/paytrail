import test from "node:test";
import assert from "node:assert/strict";
const { checkSignup, reminderDue, parseBatches, STAGES } = await import("../lib/community.js");

const ok = { name: " Ada  Obi ", email: "ADA@Obi.ng", phone: "0801 234 5678", batch: "Batch 3", business_name: "Obi Foods", stage: STAGES[1], consent: "yes" };

test("a good sign-up is tidied", () => {
  assert.deepEqual(checkSignup(ok, ["Batch 2", "Batch 3"]).data, { name: "Ada Obi", email: "ada@obi.ng", phone: "0801 234 5678", batch: "Batch 3", business_name: "Obi Foods", stage: STAGES[1], consent: true });
});

test("each field is checked, and No to the rules can't join", () => {
  assert.equal(checkSignup({ ...ok, email: "nope" }).field, "email");
  assert.equal(checkSignup({ ...ok, phone: "12" }).field, "phone");
  assert.equal(checkSignup({ ...ok, batch: "Batch 9" }, ["Batch 3"]).field, "batch");
  assert.equal(checkSignup({ ...ok, batch: "" }).field, "batch");
  assert.equal(checkSignup({ ...ok, stage: "Huge" }).field, "stage");
  assert.match(checkSignup({ ...ok, consent: "no" }).error, /only for people who agree/);
  assert.equal(checkSignup({ ...ok, consent: undefined }).field, "consent");
  assert.ok(checkSignup({ ...ok, website: "spam.com" }).error, "the bot trap");
});

test("reminders after 1, 3 and 7 days, then stop; never after a click or stop", () => {
  const day = 86400_000, t0 = Date.parse("2026-11-21T10:00:00Z");
  const row = { created_at: new Date(t0).toISOString(), emailed_at: new Date(t0).toISOString(), reminders: 0 };
  assert.equal(reminderDue(row, t0 + 0.5 * day), false);
  assert.equal(reminderDue(row, t0 + 1 * day), true);
  assert.equal(reminderDue({ ...row, reminders: 1 }, t0 + 2 * day), false);
  assert.equal(reminderDue({ ...row, reminders: 1 }, t0 + 3 * day), true);
  assert.equal(reminderDue({ ...row, reminders: 2 }, t0 + 7 * day), true);
  assert.equal(reminderDue({ ...row, reminders: 3 }, t0 + 30 * day), false);
  assert.equal(reminderDue({ ...row, clicked_at: new Date().toISOString() }, t0 + 3 * day), false);
  assert.equal(reminderDue({ ...row, stopped_at: new Date().toISOString() }, t0 + 3 * day), false);
});

test("batches typed one per line or with commas", () => {
  assert.deepEqual(parseBatches("Batch 1\nBatch 2, Batch 3\n\nBatch 2"), ["Batch 1", "Batch 2", "Batch 3"]);
});
