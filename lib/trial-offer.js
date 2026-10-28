// "Pay before your free trial ends: 25% off your first year." One place for
// the offer's rules. Runs until 30 November 2026 (end of day, Lagos time).
// Yearly plans only, first payment only; the Founding plan is hidden meanwhile.
export const TRIAL_OFFER = {
  endsAt: "2026-11-30T23:59:59+01:00",
  endsLabel: "30 Nov",
  percent: 25,
};

export const offerActive = (now = Date.now()) => now <= Date.parse(TRIAL_OFFER.endsAt);

// the business can still claim it: on its trial (not ended), never paid before
export function offerEligible({ business, paidBefore, now = Date.now() }) {
  if (!offerActive(now) || paidBefore || !business) return false;
  if (business.subscription_status !== "trialing") return false;
  return !business.trial_ends_at || Date.parse(business.trial_ends_at) > now;
}

// the discounted price of a plan (minor units), or null when it doesn't apply
export function offerPrice(plan) {
  if (!plan || !plan.active || plan.billing_interval !== "year" || !(Number(plan.price_minor) > 0)) return null;
  return Math.round(Number(plan.price_minor) * (100 - TRIAL_OFFER.percent) / 100);
}
