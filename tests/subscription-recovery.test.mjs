import test from "node:test";
import assert from "node:assert/strict";

// An upgrade that wasn't paid: one friendly email to the owner, an alert for the
// team, and nothing at all when they've since paid or are paying in another tab.
process.env.SENDBYTE_API_KEY = "sk_test_abcdefgh123";
process.env.MAIL_FROM = "Usetally <hello@usetally.cc>";
process.env.ADMIN_ALERT_EMAILS = "founder@usetally.cc";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;

const sent = [];
globalThis.fetch = async (url, init) => {
  sent.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
};

const { looksNigerian, failureWords, shouldFollowUp } = await import("../lib/subscription-recovery-core.js");
const { upgradeRetryEmail } = await import("../lib/emails.js");
const { subscriptionNotPaid } = await import("../lib/subscription-recovery.js");

// a tiny stand-in for the Supabase client: each table answers with fixed rows
function fakeService(tables) {
  return {
    from(table) {
      const rows = tables[table] ?? [];
      const q = {
        select: () => q, eq: () => q, gt: () => q, in: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: Array.isArray(rows) ? rows[0] ?? null : rows }),
        then: (ok, bad) => Promise.resolve({ data: Array.isArray(rows) ? rows : [rows] }).then(ok, bad),
      };
      return q;
    },
  };
}
const attempt = { id: "a1", purpose: "subscription", business_id: "b1", plan_id: "p1", reference: "PTSUB-MVXAUIBN-02619C3852", amount_minor: 3750, currency: "USD", created_at: "2026-11-01T04:57:00Z", failure_reason: "expired", provider: "bachs" };
const base = {
  businesses: [{ id: "b1", name: "Hellajenan Studio", email: "hello@hellajenan.ng", phone: "0803 123 4567", country: "", currency: "USD", subscription_status: "trialing", plan_id: null }],
  plans: [{ id: "p1", name: "Team", billing_interval: "year" }],
  platform_settings: [{ support_email: "support@usetally.cc" }],
  memberships: [{ email: "owner@hellajenan.ng", full_name: "Hella Jenan" }],
};

test("who looks Nigerian, and failure reasons in plain words", () => {
  assert.equal(looksNigerian({ country: "Nigeria" }), true);
  assert.equal(looksNigerian({ currency: "NGN" }), true);
  assert.equal(looksNigerian({ phone: "+234 803 123 4567" }), true);
  assert.equal(looksNigerian({ phone: "08031234567" }), true);
  assert.equal(looksNigerian({ country: "United Kingdom", currency: "GBP", phone: "+44 7700 900123" }), false);
  assert.match(failureWords("expired"), /expired/);
  assert.match(failureWords("declined"), /declined/);
  assert.match(failureWords("whatever"), /wasn't completed/);
});

test("only real, unfinished subscription checkouts get a follow-up", () => {
  assert.equal(shouldFollowUp({ attempt }).ok, true);
  assert.equal(shouldFollowUp({ attempt: { ...attempt, purpose: "document" } }).ok, false);
  assert.equal(shouldFollowUp({ attempt: { ...attempt, failure_reason: "test_mode_payment" } }).ok, false);
  assert.equal(shouldFollowUp({ attempt, laterAttempts: [{ status: "succeeded" }] }).why, "retrying_or_paid");
  assert.equal(shouldFollowUp({ attempt, laterAttempts: [{ status: "pending" }] }).why, "retrying_or_paid");
  assert.equal(shouldFollowUp({ attempt, laterAttempts: [{ status: "failed" }] }).ok, true);
  assert.equal(shouldFollowUp({ attempt, business: { subscription_status: "active", plan_id: "p1" } }).why, "already_on_plan");
});

test("the email: what happened, nothing charged, the likely problems and fixes, a fresh link", () => {
  const e = upgradeRetryEmail({ name: "Hella Jenan", business: "Hellajenan Studio", plan: "Team", amount: "$37.50", link: "https://usetally.cc/app/settings/billing" });
  assert.equal(e.subject, "Your Usetally upgrade didn't go through");
  assert.match(e.html, /Hi Hella/);
  assert.match(e.html, /nothing was charged/);
  assert.match(e.html, /Try again/);
  assert.match(e.html, /one-time code \(OTP\)/);
  assert.match(e.html, /online or international payments/);
  assert.match(e.html, /bank transfer/);
  assert.doesNotMatch(e.html, /Nigeria/);
});

test("end to end: the owner gets the email and the team gets an alert", async () => {
  sent.length = 0;
  const r = await subscriptionNotPaid(fakeService({ ...base, payment_attempts: [] }), attempt);
  assert.equal(r.sent, true);
  assert.equal(r.nairaHint, true); // Nigerian phone, charged in dollars
  const toOwner = sent.find((m) => m.to === "owner@hellajenan.ng");
  const toTeam = sent.find((m) => m.to === "founder@usetally.cc");
  assert.ok(toOwner, "owner emailed");
  assert.equal(toOwner.reply_to, "support@usetally.cc");
  assert.match(toOwner.html, /\$37\.50/);
  assert.ok(toTeam, "team alerted");
  assert.match(toTeam.subject, /Upgrade not paid: Hellajenan Studio/);
  assert.match(toTeam.html, /charged in dollars/);
  assert.match(toTeam.html, /PTSUB-MVXAUIBN-02619C3852/);
});

test("end to end: nothing is sent when they've already paid or are paying again", async () => {
  sent.length = 0;
  const r = await subscriptionNotPaid(fakeService({ ...base, payment_attempts: [{ status: "succeeded" }] }), attempt);
  assert.equal(r.sent, false);
  assert.equal(r.why, "retrying_or_paid");
  assert.equal(sent.length, 0);
});

test("a broken database never breaks payment handling", async () => {
  const r = await subscriptionNotPaid({ from() { throw new Error("db down"); } }, attempt);
  assert.equal(r.sent, false);
});
