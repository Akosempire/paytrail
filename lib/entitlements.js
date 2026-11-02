// Paid features (supabase/migrations/20261102000200_plan_features.sql).
// business_features() says which ones a business has right now: the trial
// and paid plans get everything by default, the Free plan none of them;
// Admin → Plans can change that per plan. Before that SQL is run nothing is
// locked, so nobody loses a feature because of a missing update.

export const FEATURES = [
  { key: "ai_full", label: "AI & MCP full access", short: "Create and send from ChatGPT, Claude or Grok", free: "View only on Free" },
  { key: "auto_reminders", label: "Automatic reminders", short: "Usetally reminds customers before and after the due date", free: "The Remind button stays free" },
  { key: "scheduled_sending", label: "Scheduled and repeating invoices", short: "Pick when an invoice goes out, or repeat it every week or month", free: "Send now stays free" },
  { key: "premium_templates", label: "Premium templates", short: "Executive, Ledger, Bold, Notebook and the rest", free: "Signature stays free" },
];
export const ALL_FEATURES = FEATURES.map((f) => f.key);
export const featureLabel = (key) => FEATURES.find((f) => f.key === key)?.label || key;

// the templates every plan can use
export const FREE_TEMPLATES = ["signature", "pos"];
export const isPremiumTemplate = (id) => Boolean(id) && !FREE_TEMPLATES.includes(id);

// an empty value on a plan means the default for that kind of plan
export function planFeatures(plan) {
  if (Array.isArray(plan?.features_included)) return plan.features_included.filter((k) => ALL_FEATURES.includes(k));
  return Number(plan?.price_minor) > 0 ? [...ALL_FEATURES] : [];
}

export const missingFeaturesSql = (error) => /business_features|features_included|schema cache|does not exist/i.test(error?.message || "");

// the features a business has (service or user client; never throws)
export async function featuresOf(supabase, businessId) {
  if (!businessId) return [];
  try {
    const { data, error } = await supabase.rpc("business_features", { target: businessId });
    // before the SQL (or on a hiccup) nothing is locked
    if (error) return [...ALL_FEATURES];
    return Array.isArray(data) ? data : [];
  } catch {
    return [...ALL_FEATURES];
  }
}

export const hasFeature = (features, key) => Array.isArray(features) && features.includes(key);

// the one sentence shown when a locked feature is used
export function upgradeMessage(key) {
  const what = {
    ai_full: "Creating and sending from your AI assistant is",
    auto_reminders: "Automatic reminders are",
    scheduled_sending: "Scheduled and repeating invoices are",
    premium_templates: "This template is",
  }[key] || "This is";
  return `${what} on paid plans. Upgrade in Settings → Plan & billing.`;
}
