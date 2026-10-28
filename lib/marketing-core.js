// Ad results and verdicts: pure maths, shared by the sync job, the email and
// the dashboard. Spend is in the ad account's currency (₦ or $); revenue is
// counted in dollars and converted with ngn_per_usd when the account is in ₦.

export const DEFAULT_SETTINGS = { kill_spend_no_signup: 3000, max_cost_per_signup: 1500, scale_min_signups: 3, ngn_per_usd: 1500 };

const n = (v) => Number(v) || 0;

// revenue in the ad account's currency, from payments in ₦ and $
export function revenueIn(accountCurrency, payments, ngnPerUsd) {
  const rate = n(ngnPerUsd) || 1500;
  let usd = 0;
  for (const p of payments || []) usd += p.currency === "NGN" ? n(p.amount_minor) / 100 / rate : n(p.amount_minor) / 100;
  return accountCurrency === "NGN" ? usd * rate : usd;
}

// one ad (or a total): the numbers people read
export function metrics({ spend = 0, link_clicks = 0, landing_page_views = 0, signups = 0, trials = 0, paid = 0, revenue = 0 } = {}) {
  const s = n(spend);
  return {
    spend: s, link_clicks: n(link_clicks), landing_page_views: n(landing_page_views), signups: n(signups), trials: n(trials), paid: n(paid), revenue: n(revenue),
    cpc: n(link_clicks) > 0 ? s / n(link_clicks) : null,
    cost_per_signup: n(signups) > 0 ? s / n(signups) : null,
    return_on_spend: s > 0 ? n(revenue) / s : null, // revenue and spend in the same currency
  };
}

// ❌ kill, ✅ scale or ⚠️ watch
export function verdict(m, settings = DEFAULT_SETTINGS) {
  const st = { ...DEFAULT_SETTINGS, ...settings };
  const spend = n(m.spend), signups = n(m.signups), cps = signups > 0 ? spend / signups : null;
  if (signups === 0 && spend >= n(st.kill_spend_no_signup) && spend > 0) return "kill";
  if (cps != null && cps > n(st.max_cost_per_signup) * 1.5) return "kill";
  if (signups >= n(st.scale_min_signups) && cps != null && cps <= n(st.max_cost_per_signup)) return "scale";
  return "watch";
}
export const VERDICT = { kill: { emoji: "❌", label: "Kill" }, scale: { emoji: "✅", label: "Scale" }, watch: { emoji: "⚠️", label: "Watch" } };

// funnel steps with the share lost at each one
export function funnel(steps) {
  return steps.map((s, i) => ({ ...s, lost: i === 0 || !n(steps[i - 1].value) ? null : Math.max(0, Math.round((1 - n(s.value) / n(steps[i - 1].value)) * 100)) }));
}

// "Last 6h" spend: Meta reports spend per day, so it's the growth since the
// previous sync (today's spend now minus what today had then; across midnight,
// yesterday's final spend minus the snapshot, plus today's). Per ad.
export function spendDeltaByAd(prev, now) {
  if (!prev || !now) return null;
  const out = {};
  for (const [ad, today] of Object.entries(now.today || {})) {
    out[ad] = prev.date === now.date ? Math.max(0, n(today) - n(prev.today?.[ad])) : n(today) + Math.max(0, n(now.yesterday?.[ad]) - n(prev.today?.[ad]));
  }
  return out;
}
export function spendSince(prev, now) {
  const by = spendDeltaByAd(prev, now);
  return by ? Math.round(Object.values(by).reduce((t, v) => t + v, 0) * 100) / 100 : null;
}

// a one-line headline for the email: best ad and the worst money-waster
export function headline(rows, money) {
  const best = rows.filter((r) => r.verdict === "scale" || r.signups > 0).sort((a, b) => (a.cost_per_signup ?? 1e12) - (b.cost_per_signup ?? 1e12))[0];
  const worst = rows.filter((r) => r.verdict === "kill").sort((a, b) => b.spend - a.spend)[0];
  const parts = [];
  if (best) parts.push(`${best.name} is winning.`);
  if (worst) parts.push(`${worst.name} spent ${money(worst.spend)} with ${worst.signups ? `${worst.signups} sign-up${worst.signups === 1 ? "" : "s"}` : "no sign-ups"}: pause it.`);
  return parts.join(" ") || (rows.length ? "No clear winner yet. Keep watching." : "No ad data yet.");
}
