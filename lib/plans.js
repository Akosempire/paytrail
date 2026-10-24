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
