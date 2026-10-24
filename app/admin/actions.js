"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { encryptSecret, hint } from "@/lib/crypto";
import { toMinor, CURRENCIES } from "@/lib/money";
import { KEY_RULES, webhookSecretProblem } from "@/lib/payments/keys";
import { requireStepUp } from "@/lib/step-up";
import { notifyAdmins } from "@/lib/admin-alerts";

export async function savePlan(id, form) {
  const ctx = await requirePlatformAdmin();
  const price = toMinor(form.price);
  const intOrNull = (v) => (String(v ?? "").trim() === "" ? null : Math.max(0, parseInt(v, 10)));
  const row = {
    name: String(form.name || "").trim().slice(0, 60),
    tagline: String(form.tagline || "").trim().slice(0, 140),
    price_minor: price,
    currency: CURRENCIES.includes(form.currency) ? form.currency : "NGN",
    billing_interval: form.billing_interval === "year" ? "year" : "month",
    document_limit: intOrNull(form.document_limit),
    seat_limit: intOrNull(form.seat_limit) || null,
    allow_company: Boolean(form.allow_company),
    features: String(form.features || "").split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 12),
    active: Boolean(form.active),
    sort_order: parseInt(form.sort_order || 0, 10) || 0,
    updated_at: new Date().toISOString(),
  };
  if (!row.name) return { error: "Give the plan a name." };
  if (!Number.isFinite(price)) return { error: "Check the price." };
  const { error } = id ? await ctx.supabase.from("plans").update(row).eq("id", id) : await ctx.supabase.from("plans").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/admin/plans");
  return { message: id ? "Plan updated. Existing subscribers keep their current period." : "Plan created." };
}

export async function saveTrial(form) {
  const ctx = await requirePlatformAdmin();
  const row = {
    trial_mode: ["documents", "days", "none"].includes(form.trial_mode) ? form.trial_mode : "documents",
    trial_documents: Math.max(0, parseInt(form.trial_documents, 10) || 0),
    trial_days: Math.max(0, parseInt(form.trial_days, 10) || 0),
    support_email: String(form.support_email || "").trim().slice(0, 200),
    updated_at: new Date().toISOString(),
  };
  const { error } = await ctx.supabase.from("platform_settings").update(row).eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { message: "Trial settings saved. They apply to new sign-ups and current trials." };
}

export async function saveBilling(form) {
  const ctx = await requirePlatformAdmin();
  const provider = ["manual", ...Object.keys(KEY_RULES)].includes(form.provider) ? form.provider : "manual";
  const rule = KEY_RULES[provider];
  const update = { billing_provider: provider, updated_at: new Date().toISOString() };
  const key = String(form.secretKey || "").trim();
  const hook = String(form.webhookSecret || "").trim();
  if (key || hook) {
    const gate = await requireStepUp(ctx, "payment_keys", null);
    if (gate) return gate;
  }
  if (provider !== "manual" && key) {
    if (!rule.valid(key)) return { error: rule.badKey };
    const check = await rule.check(key);
    if (!check.ok) return { error: check.error };
    update.billing_secret_enc = encryptSecret(key);
    update.billing_key_hint = hint(key);
    if (!rule.needsWebhookSecret) update.billing_webhook_secret_enc = update.billing_secret_enc;
  }
  if (provider !== "manual" && hook && rule.needsWebhookSecret) {
    const problem = webhookSecretProblem(provider, hook);
    if (problem) return { error: problem };
    update.billing_webhook_secret_enc = encryptSecret(hook);
  }
  const service = createSupabaseService();
  const { data: current } = await service.from("platform_settings").select("billing_provider, billing_secret_enc, billing_webhook_secret_enc").eq("id", true).single();
  // keys belong to one provider: switching provider needs that provider's own keys
  if (provider !== "manual" && provider !== current?.billing_provider && !update.billing_secret_enc) return { error: "Paste the secret key for PayTrail's own account with this provider." };
  if (provider !== "manual" && provider !== current?.billing_provider && rule.needsWebhookSecret && !hook) return { error: "Paste the webhook secret for this provider." };
  if (provider !== "manual" && !update.billing_secret_enc && !current?.billing_secret_enc) return { error: "Paste the secret key for PayTrail's own account." };
  if (provider !== "manual" && !update.billing_webhook_secret_enc && !current?.billing_webhook_secret_enc) return { error: "Paste the webhook secret." };
  const { error } = await service.from("platform_settings").update(update).eq("id", true);
  if (error) return { error: error.message };
  if (key || hook) await notifyAdmins({ subject: `PayTrail billing keys changed (${provider})`, lines: [`${ctx.user.email} changed PayTrail's own ${provider} billing keys at ${new Date().toUTCString()}.`, "If this wasn't you, sign in and replace the keys with your provider straight away."], link: "/admin/settings" });
  revalidatePath("/admin/settings");
  return { message: "Billing settings saved." };
}

export async function updateBusinessAccount(businessId, form) {
  const ctx = await requirePlatformAdmin();
  const action = form.action;
  if (action === "extend") {
    if (!form.plan_id) return { error: "Choose a plan." };
    const amount = String(form.amount ?? "").trim() === "" ? null : toMinor(form.amount);
    const { error } = await ctx.supabase.rpc("admin_extend_subscription", { target: businessId, new_plan: form.plan_id, pay_reference: String(form.reference || "").slice(0, 120), pay_amount: amount });
    if (error) return { error: error.message };
  } else if (action === "status") {
    if (!["trialing", "active", "past_due", "canceled", "suspended"].includes(form.status)) return { error: "Unknown status." };
    const { error } = await ctx.supabase.from("businesses").update({ subscription_status: form.status }).eq("id", businessId);
    if (error) return { error: error.message };
  } else if (action === "trial") {
    const extra = Math.max(0, parseInt(form.extra_documents || 0, 10) || 0);
    const days = Math.max(0, parseInt(form.extra_days || 0, 10) || 0);
    const { data: b } = await ctx.supabase.from("businesses").select("trial_documents_used, trial_ends_at").eq("id", businessId).single();
    const base = b.trial_ends_at && new Date(b.trial_ends_at) > new Date() ? new Date(b.trial_ends_at) : new Date();
    const { error } = await ctx.supabase.from("businesses").update({
      subscription_status: "trialing",
      trial_documents_used: Math.max(0, b.trial_documents_used - extra),
      trial_ends_at: days ? new Date(base.getTime() + days * 86400000).toISOString() : b.trial_ends_at,
    }).eq("id", businessId);
    if (error) return { error: error.message };
  } else return { error: "Unknown action." };
  revalidatePath("/admin/businesses");
  return { message: "Account updated." };
}
