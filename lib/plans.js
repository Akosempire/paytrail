// Free tier: on the Free plan, or a trial / paid plan that has run out (the
// business then sends on the Free plan's allowance). Documents show "Made with
// Usetally" while this is true.
export function onFreeTier(b, now = Date.now()) {
  if (!b) return false;
  const plan = Array.isArray(b.plans) ? b.plans[0] : b.plans;
  if (b.subscription_status === "active" && plan && plan.price_minor != null && Number(plan.price_minor) === 0) return true;
  if (b.subscription_status === "active" && b.current_period_end && Date.parse(b.current_period_end) < now) return true;
  if (b.subscription_status === "trialing" && b.trial_ends_at && Date.parse(b.trial_ends_at) < now) return true;
  return false;
}

// A paying business: an active paid plan that hasn't run out. Until then
// (trial, Free, lapsed) the app shows Usetally's logo and documents say
// "Powered by Usetally".
export function isPaying(b, now = Date.now()) {
  return b?.subscription_status === "active" && !onFreeTier(b, now);
}
// documents only carry the line when we know the business isn't paying
export function showsPoweredBy(b, now = Date.now()) {
  return Boolean(b?.subscription_status) && !isPaying(b, now);
}

// Which plans a business (or a landing-page visitor) should see.
// Plans are priced per currency: naira businesses see naira plans, everyone
// else sees plans in their own currency, falling back to US dollars.
export function plansFor(plans, { currency, interval, kind, currentPlanId }) {
  const all = plans || [];
  const has = (c) => all.some((p) => p.active && p.currency === c);
  const cur = has(currency) ? currency : has("USD") ? "USD" : all.find((p) => p.active)?.currency;
  const list = all.filter((p) =>
    (p.active || p.id === currentPlanId) &&
    p.currency === cur &&
    (kind !== "company" || p.allow_company || p.id === currentPlanId) &&
    (p.price_minor === 0 || p.billing_interval === interval || p.id === currentPlanId));
  // the plan a business is on always shows first, even a hidden founding plan
  return { currency: cur, plans: list.sort((a, b) => (b.id === currentPlanId) - (a.id === currentPlanId) || a.sort_order - b.sort_order) };
}

export function hasYearly(plans, currency) {
  return (plans || []).some((p) => p.active && p.currency === currency && p.billing_interval === "year" && p.price_minor > 0);
}

// "₦5,000 / month" shown under yearly prices
export function monthlyEquivalent(plan) {
  return plan.billing_interval === "year" ? Math.round(plan.price_minor / 12 / 100) * 100 : null;
}
