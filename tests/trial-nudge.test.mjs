import test from "node:test";
import assert from "node:assert/strict";
import { trialNudge, shownToday } from "../lib/trial-nudge.js";

const NOW = Date.parse("2026-10-28T12:00:00Z"), DAY = 86400_000;
const days = (n) => new Date(NOW + n * DAY).toISOString();

test("days trial: last 7 days once they've sent something, or the last 3 days anyway", () => {
  const base = { createdAt: days(-9), now: NOW };
  assert.deepEqual(trialNudge({ ...base, allowance: { reason: "trial", mode: "days", ends_at: days(5) }, docsSent: 2 }), { mode: "days", daysLeft: 5, endsAt: days(5), offer: false });
  assert.equal(trialNudge({ ...base, allowance: { reason: "trial", mode: "days", ends_at: days(5) }, docsSent: 0 }), null, "nothing sent yet: wait");
  assert.equal(trialNudge({ ...base, allowance: { reason: "trial", mode: "days", ends_at: days(3) }, docsSent: 0 }).daysLeft, 3);
  assert.equal(trialNudge({ ...base, allowance: { reason: "trial", mode: "days", ends_at: days(10) }, docsSent: 5 }), null, "plenty of time left");
});

test("never on the first 2 days, never off-trial", () => {
  assert.equal(trialNudge({ createdAt: days(-1), now: NOW, allowance: { reason: "trial", mode: "days", ends_at: days(1) }, docsSent: 3 }), null);
  for (const reason of ["plan", "free", "free_limit"]) assert.equal(trialNudge({ createdAt: days(-20), now: NOW, allowance: { reason, mode: "days", ends_at: days(1) } }), null);
  assert.equal(trialNudge({ createdAt: days(-20), now: NOW, allowance: null }), null);
});

test("documents trial: once half the free documents are used", () => {
  const base = { createdAt: days(-5), now: NOW };
  assert.equal(trialNudge({ ...base, allowance: { reason: "trial", mode: "documents", used: 1, limit: 5 } }), null);
  assert.deepEqual(trialNudge({ ...base, allowance: { reason: "trial", mode: "documents", used: 3, limit: 5 } }), { mode: "documents", docsLeft: 2, limit: 5, offer: false });
});

test("at most once a day", () => {
  assert.equal(shownToday("2026-10-28", NOW), true);
  assert.equal(shownToday("2026-10-27", NOW), false);
  assert.equal(shownToday(null, NOW), false);
});

import { offerActive, offerEligible, offerPrice } from "../lib/trial-offer.js";
import { dueAgain } from "../lib/trial-nudge.js";

test("25% off yearly plans: ₦100,000 → ₦75,000, $150 → $112.50", () => {
  const plan = (price_minor, currency = "NGN", billing_interval = "year", active = true) => ({ price_minor, currency, billing_interval, active });
  assert.equal(offerPrice(plan(10000000)), 7500000);   // Team ₦100,000 → ₦75,000
  assert.equal(offerPrice(plan(3000000)), 2250000);    // Solo ₦30,000 → ₦22,500
  assert.equal(offerPrice(plan(20000000)), 15000000);  // Business ₦200,000 → ₦150,000
  assert.equal(offerPrice(plan(15000, "USD")), 11250); // Team $150 → $112.50
  assert.equal(offerPrice(plan(1000000, "NGN", "month")), null, "monthly: no discount");
  assert.equal(offerPrice(plan(6000000, "NGN", "year", false)), null, "Founding (hidden plan): no discount");
  assert.equal(offerPrice(plan(0)), null);
});

test("who can claim it: on a running trial, never paid, before 30 Nov", () => {
  const during = Date.parse("2026-11-10T10:00:00Z");
  const b = { subscription_status: "trialing", trial_ends_at: "2026-11-15T00:00:00Z" };
  assert.equal(offerEligible({ business: b, paidBefore: false, now: during }), true);
  assert.equal(offerEligible({ business: b, paidBefore: true, now: during }), false, "paid before");
  assert.equal(offerEligible({ business: { ...b, trial_ends_at: "2026-11-09T00:00:00Z" }, paidBefore: false, now: during }), false, "trial over");
  assert.equal(offerEligible({ business: { ...b, subscription_status: "active" }, paidBefore: false, now: during }), false);
  assert.equal(offerEligible({ business: { ...b, trial_ends_at: null }, paidBefore: false, now: during }), true, "documents trials have no end date");
  assert.equal(offerEligible({ business: b, paidBefore: false, now: Date.parse("2026-12-01T00:00:00Z") }), false, "offer ended");
  assert.equal(offerActive(Date.parse("2026-11-30T22:00:00Z")), true);
});

test("during the offer the pop-up shows from day 2, every 3 days (daily at the end)", () => {
  const NOW2 = Date.parse("2026-10-28T12:00:00Z");
  const r = trialNudge({ createdAt: "2026-10-25T00:00:00Z", now: NOW2, offer: true, allowance: { reason: "trial", mode: "days", ends_at: "2026-11-08T00:00:00Z" } });
  assert.equal(r.offer, true); assert.equal(r.daysLeft, 11);
  assert.equal(dueAgain("2026-10-27", { daysLeft: 11 }, NOW2), false);
  assert.equal(dueAgain("2026-10-25", { daysLeft: 11 }, NOW2), true);
  assert.equal(dueAgain("2026-10-27", { daysLeft: 2 }, NOW2), true);
  assert.equal(dueAgain(null, {}, NOW2), true);
});
