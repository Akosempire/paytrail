// When someone starts paying for a Usetally plan and doesn't finish (the
// checkout expired, the card was declined, they closed the tab): pure rules,
// tested in node. The sending is in lib/subscription-recovery.js.

// Nigerian businesses pay in naira. A business that looks Nigerian but would be
// charged in dollars (no country set, or a different one) is the commonest reason
// a Nigerian card fails, so the email and the admin alert point it out.
export function looksNigerian({ country, currency, phone } = {}) {
  const c = String(country || "").trim().toLowerCase();
  if (["ng", "nga", "nigeria"].includes(c)) return true;
  if (String(currency || "").toUpperCase() === "NGN") return true;
  const p = String(phone || "").replace(/[\s()-]/g, "");
  return /^(\+?234|0)[789][01]\d{8}$/.test(p);
}

// "expired", "abandoned" and friends → a reason a person understands
export function failureWords(reason) {
  const r = String(reason || "").toLowerCase();
  if (/expired|abandon/.test(r)) return "the checkout expired before payment was completed";
  if (/declin|insufficient|do_not_honor|card/.test(r)) return "the card payment was declined";
  if (/cancel/.test(r)) return "the checkout was closed before paying";
  return "the payment wasn't completed";
}

// should this attempt get a follow-up? (only real, recent subscription checkouts,
// and not when they've since paid or are paying right now in another tab)
export function shouldFollowUp({ attempt, laterAttempts = [], business }) {
  if (!attempt || attempt.purpose !== "subscription") return { ok: false, why: "not_subscription" };
  if (/test_mode_payment|mismatch/.test(String(attempt.failure_reason || ""))) return { ok: false, why: "not_abandonment" };
  if (laterAttempts.some((a) => a.status === "succeeded" || a.status === "pending")) return { ok: false, why: "retrying_or_paid" };
  if (business?.subscription_status === "active" && business?.plan_id === attempt.plan_id) return { ok: false, why: "already_on_plan" };
  return { ok: true };
}
