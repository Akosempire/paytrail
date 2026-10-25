"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret, hint } from "@/lib/crypto";
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
  if (provider !== "manual" && provider !== current?.billing_provider && !update.billing_secret_enc) return { error: "Paste the secret key for Usetally's own account with this provider." };
  if (provider !== "manual" && provider !== current?.billing_provider && rule.needsWebhookSecret && !hook) return { error: "Paste the webhook secret for this provider." };
  if (provider !== "manual" && !update.billing_secret_enc && !current?.billing_secret_enc) return { error: "Paste the secret key for Usetally's own account." };
  if (provider !== "manual" && !update.billing_webhook_secret_enc && !current?.billing_webhook_secret_enc) return { error: "Paste the webhook secret." };
  const { error } = await service.from("platform_settings").update(update).eq("id", true);
  if (error) return { error: error.message };
  if (key || hook) await notifyAdmins({ subject: `Usetally billing keys changed (${provider})`, lines: [`${ctx.user.email} changed Usetally's own ${provider} billing keys at ${new Date().toUTCString()}.`, "If this wasn't you, sign in and replace the keys with your provider straight away."], link: "/admin/settings" });
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

// Brevo for all of Usetally's email, set up here instead of in Vercel.
// The first setup needs no security code (email can't deliver one yet);
// changing a working setup does, because whoever controls this key can read
// every sign-up and reset code.
export async function saveEmailSettings(form) {
  const ctx = await requirePlatformAdmin();
  // never crash the card: show the admin what went wrong instead
  try { return await saveEmailSettingsInner(ctx, form); }
  catch (e) { console.error("email_settings.save_failed", { message: e?.message }); return { error: serverProblem(e) }; }
}

function serverProblem(e) {
  const m = String(e?.message || e || "");
  if (/APP_ENCRYPTION_KEY/.test(m)) return "APP_ENCRYPTION_KEY is missing in Vercel, so the key can't be stored safely. In Vercel → Settings → Environment Variables, add APP_ENCRYPTION_KEY with any long random text (at least 32 characters), redeploy, then try again. Keep that value: changing it later means re-entering saved keys.";
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(m)) return "SUPABASE_SERVICE_ROLE_KEY is missing in Vercel. Copy it from Supabase → Project Settings → API (service_role), add it in Vercel, redeploy, then try again.";
  if (/column|email_api_key_enc|schema cache/i.test(m)) return "The database is missing the new email columns. Run supabase/RUN_NEW_2026-10-25b.sql in Supabase → SQL Editor, then try again.";
  return `Something went wrong on the server: ${m.slice(0, 240) || "no details"}`;
}

async function saveEmailSettingsInner(ctx, form) {
  const { checkBrevo, checkBrevoSmtp, checkSendhiiv, forgetEmailConfig } = await import("@/lib/email");
  const smtpLogin = String(form.smtpLogin || "").trim().toLowerCase();
  // works with either kind of Brevo key: an API key (xkeysib-) or an SMTP key (xsmtpsib-) plus its login
  // the key's prefix says which service it belongs to
  const verify = (secret, address) => !/^(sh_|xkeysib-|[^\n]*\n)/.test(secret)
    ? { ok: false, error: "That doesn't look like a Sendhiiv key (starts sh_live_) or a Brevo key (starts xkeysib- or xsmtpsib-). Copy the whole key from your dashboard." }
    : /^sh_(live|test)_/.test(secret) ? checkSendhiiv(secret)
    : secret.includes("\n") ? checkBrevoSmtp(...secret.split("\n"))
    : checkBrevo(secret, address);
  const key = String(form.apiKey || "").trim().replace(/^["']|["']$/g, "");
  const fromName = String(form.fromName || "").trim().slice(0, 80) || "Usetally";
  const fromAddress = String(form.fromAddress || "").trim().toLowerCase();
  const service = createSupabaseService();
  const { data: current, error: readError } = await service.from("platform_settings").select("email_api_key_enc, email_from_address").eq("id", true).single();
  if (readError) return { error: /email_api_key_enc/.test(readError.message) ? "Run the new SQL first (supabase/RUN_NEW_2026-10-25b.sql), then try again." : readError.message };
  // Sendhiiv can send from its shared address, so the sender may be left empty there
  const sendhiiv = /^sh_(live|test)_/.test(key) || (!key && current?.email_api_key_enc && /^sh_/.test(decryptSecret(current.email_api_key_enc)));
  if (!(sendhiiv && !fromAddress) && !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(fromAddress)) return { error: "Enter the address emails should come from, like hello@usetally.cc." };
  if (!key && !current?.email_api_key_enc) return { error: "Paste your Sendhiiv or Brevo API key." };
  // the saved key still works: changing it needs a code. If it no longer
  // works, a code couldn't be delivered anyway, so let the admin replace it.
  const savedWorks = current?.email_api_key_enc ? (await verify(decryptSecret(current.email_api_key_enc), current.email_from_address || fromAddress)).ok : false;
  if (savedWorks && (key || fromAddress !== current.email_from_address)) {
    const gate = await requireStepUp(ctx, "email_settings", null);
    if (gate) return gate;
  }
  const secret = key ? (/^xsmtpsib-/.test(key) ? `${smtpLogin}\n${key}` : key) : decryptSecret(current.email_api_key_enc);
  const check = await verify(secret, fromAddress);
  if (!check.ok) return { error: check.error };
  const update = { email_from_name: fromName, email_from_address: fromAddress, email_account: check.account || null, email_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (key) { update.email_api_key_enc = encryptSecret(secret); update.email_key_hint = hint(key); }
  const { error } = await service.from("platform_settings").update(update).eq("id", true);
  if (error) return { error: error.message };
  forgetEmailConfig();
  if (key && current?.email_api_key_enc) await notifyAdmins({ subject: "Usetally email key changed", lines: [`${ctx.user.email} replaced the Brevo API key at ${new Date().toUTCString()}.`, "If this wasn't you, sign in and replace it straight away."], link: "/admin/settings" });
  revalidatePath("/admin/settings");
  return check.senderNote
    ? { warning: true, messageTitle: "Key saved, one step left", message: check.senderNote }
    : { message: /^sh_/.test(secret) ? "Connected to Sendhiiv. Send a test email to be sure." : `Connected to Brevo${check.account ? ` (${check.account})` : ""}. Send a test email to be sure.` };
}

// sends a test email to the signed-in admin and reports the mail server's answer
export async function sendTestEmail() {
  const ctx = await requirePlatformAdmin();
  try { return await sendTestEmailInner(ctx); }
  catch (e) { console.error("email_settings.test_failed", { message: e?.message }); return { error: serverProblem(e) }; }
}

async function sendTestEmailInner(ctx) {
  const { emailStatus, sendEmail } = await import("@/lib/email");
  const { adminAlertEmail } = await import("@/lib/emails");
  const status = await emailStatus();
  if (!status.ready) return { error: "Email isn't set up yet. Paste your Brevo API key above and save." };
  const r = await sendEmail({ to: ctx.user.email, ...adminAlertEmail({ subject: "Test email", heading: "Email is working", lines: ["If you can read this, Usetally can send sign-up codes, password resets and every other email."] }) });
  if (r.sent) return { message: `Sent to ${ctx.user.email}. Check your inbox (and spam).` };
  const login = /535|auth/i.test(r.detail || "");
  const who = status.provider === "sendhiiv" ? "Sendhiiv" : "Brevo";
  return { error: `${who} refused the email: ${r.detail || "no reason given"}`, hints: status.env.hints.length ? status.env.hints : status.source === "vercel" && login ? ["Easiest fix: paste a Brevo API key in the form above instead. It replaces the SMTP settings in Vercel."] : [] };
}
