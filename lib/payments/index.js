import "server-only";
import { randomBytes } from "node:crypto";
import { createSupabaseService } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { siteUrl, absoluteLogoUrl } from "@/lib/site";
import { createBachsCheckout, retrieveBachsCheckout } from "@/lib/payments/bachs";
import { createFlutterwaveCheckout, verifyFlutterwaveByReference } from "@/lib/payments/flutterwave";
import { createStripeCheckout, retrieveStripeCheckout } from "@/lib/payments/stripe";
import { createPaystackCheckout, verifyPaystack } from "@/lib/payments/paystack";
import { KEY_RULES } from "@/lib/payments/keys";

export const PROVIDERS = {
  stripe: { name: "Stripe", website: "https://stripe.com" },
  paystack: { name: "Paystack", website: "https://paystack.com" },
  flutterwave: { name: "Flutterwave", website: "https://flutterwave.com" },
  bachs: { name: "Bachs", website: "https://bachs.io" },
};

// a small real-money amount for connection tests: ₦100, KSh 100, $1, £1…
export function testAmountMinor(currency) {
  return ({ NGN: 100, KES: 100, XOF: 100, ZAR: 10 }[currency] ?? 1) * 100;
}

// Test-mode keys must never mark a real customer's invoice as paid. Set
// PAYTRAIL_ALLOW_TEST_PAYMENTS=1 on a staging deployment to try the full flow.
export function testPaymentsAllowed() {
  return process.env.PAYTRAIL_ALLOW_TEST_PAYMENTS === "1" || process.env.NODE_ENV !== "production";
}

export function newReference(prefix = "PT") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

// keys for a business connection, or the platform's own billing keys when businessId is null
export async function credentialsFor(service, businessId, provider) {
  if (!businessId) {
    const { data } = await service.from("platform_settings").select("*").eq("id", true).single();
    if (!data?.billing_secret_enc) return null;
    const secretKey = decryptSecret(data.billing_secret_enc);
    // a sandbox/test key never moves real money, so it must never activate a plan
    const mode = KEY_RULES[data.billing_provider]?.mode(secretKey) || "test";
    return { secretKey, webhookSecret: decryptSecret(data.billing_webhook_secret_enc), enabled: data.billing_provider !== "manual", mode, provider: data.billing_provider };
  }
  const { data } = await service.from("payment_connections").select("*").eq("business_id", businessId).eq("provider", provider).maybeSingle();
  if (!data?.secret_key_enc) return null;
  return { secretKey: decryptSecret(data.secret_key_enc), webhookSecret: decryptSecret(data.webhook_secret_enc), enabled: data.enabled, mode: data.mode, row: data };
}

// opens a hosted checkout and stores the attempt first, so a webhook can always find it
export async function startCheckout({ businessId, billingBusinessId, provider, purpose, documentId, planId, amountMinor, currency, customer, brand }) {
  const service = createSupabaseService();
  const creds = await credentialsFor(service, purpose === "subscription" ? null : businessId, provider);
  if (!creds?.secretKey) throw new Error(`${PROVIDERS[provider].name} is not connected.`);
  if (!creds.enabled) throw new Error(`${PROVIDERS[provider].name} payments are turned off.`);
  const reference = newReference(purpose === "connection_test" ? "PTTEST" : purpose === "subscription" ? "PTSUB" : "PT");
  const owner = purpose === "subscription" ? billingBusinessId : businessId;
  const mode = creds.mode || "test";
  if (purpose === "document" && mode === "test" && !testPaymentsAllowed()) throw new Error(`${PROVIDERS[provider].name} is still in test mode.`);
  if (purpose === "subscription" && creds.provider && creds.provider !== provider) throw new Error("Usetally's billing settings changed. Refresh the page and try again.");
  if (purpose === "subscription" && mode === "test" && !testPaymentsAllowed()) throw new Error("Usetally's billing is connected with a test key, so no real payment can be taken yet. Please try again later or contact support.");

  // a double click or a second tab reuses the checkout already opened for the same
  // business, plan or document and amount, instead of starting a second payment
  if (purpose === "subscription" || purpose === "document") {
    const since = new Date(Date.now() - 30 * 60000).toISOString();
    let q = service.from("payment_attempts").select("id, reference, checkout_url").eq("status", "pending").eq("provider", provider).eq("purpose", purpose)
      .eq("business_id", purpose === "subscription" ? billingBusinessId : businessId).eq("amount_minor", amountMinor).eq("currency", currency).gt("created_at", since)
      .not("checkout_url", "is", null).order("created_at", { ascending: false }).limit(1);
    q = purpose === "subscription" ? q.eq("plan_id", planId) : q.eq("document_id", documentId);
    const { data: open } = await q;
    if (open?.[0]?.checkout_url) return { url: open[0].checkout_url, reference: open[0].reference, reused: true };
  }
  const { data: attempt, error } = await service.from("payment_attempts").insert({
    business_id: owner, document_id: documentId || null, provider, purpose, reference, amount_minor: amountMinor, currency, plan_id: planId || null, mode,
  }).select().single();
  if (error) throw new Error("Could not start the payment. Try again.");
  const back = `${siteUrl()}/pay/return?ref=${encodeURIComponent(reference)}`;
  const metadata = { paytrail_reference: reference, purpose, business_id: owner, document_id: documentId || null };
  let checkout;
  if (provider === "bachs") {
    checkout = await createBachsCheckout(creds.secretKey, { amountMinor, currency, reference, email: customer?.email, name: customer?.name, successUrl: back, cancelUrl: `${back}&cancelled=1`, metadata });
  } else if (provider === "flutterwave") {
    checkout = await createFlutterwaveCheckout(creds.secretKey, { amountMinor, currency, reference, email: customer?.email, name: customer?.name, phone: customer?.phone, redirectUrl: back,
      title: brand?.name || "Usetally", logo: brand?.logo ? absoluteLogoUrl(brand.logo) : undefined, description: brand?.description, metadata });
  } else if (provider === "stripe") {
    checkout = await createStripeCheckout(creds.secretKey, { amountMinor, currency, reference, email: customer?.email, title: brand?.name || "Usetally",
      description: brand?.description, successUrl: back, cancelUrl: `${back}&cancelled=1`, metadata });
  } else if (provider === "paystack") {
    checkout = await createPaystackCheckout(creds.secretKey, { amountMinor, currency, reference, email: customer?.email, callbackUrl: back, metadata });
  } else {
    throw new Error("Unknown payment provider.");
  }
  if (!checkout.url) throw new Error(`${PROVIDERS[provider].name} did not return a payment page.`);
  await service.from("payment_attempts").update({ provider_checkout_id: checkout.checkoutId, checkout_url: checkout.url }).eq("id", attempt.id);
  return { url: checkout.url, reference };
}

// asks the provider about one attempt and records the result. Safe to call repeatedly.
export async function confirmAttempt(reference, { fromWebhook = false } = {}) {
  const service = createSupabaseService();
  const { data: attempt } = await service.from("payment_attempts").select("*").eq("reference", reference).maybeSingle();
  if (!attempt) return { state: "unknown" };
  if (attempt.status !== "pending") return { state: attempt.status, attempt };
  const creds = await credentialsFor(service, attempt.purpose === "subscription" ? null : attempt.business_id, attempt.provider);
  if (!creds?.secretKey) return { state: "pending", attempt };

  let result;
  if (attempt.provider === "bachs") result = attempt.provider_checkout_id ? await retrieveBachsCheckout(creds.secretKey, attempt.provider_checkout_id) : { state: "pending" };
  else if (attempt.provider === "stripe") result = attempt.provider_checkout_id ? await retrieveStripeCheckout(creds.secretKey, attempt.provider_checkout_id) : { state: "pending" };
  else if (attempt.provider === "paystack") result = await verifyPaystack(creds.secretKey, attempt.reference);
  else result = await verifyFlutterwaveByReference(creds.secretKey, attempt.reference);

  if (result.state === "pending") return { state: "pending", attempt };
  if (result.state === "failed") {
    await service.from("payment_attempts").update({ status: "failed", failure_reason: result.rawStatus || "failed", completed_at: new Date().toISOString() }).eq("id", attempt.id).eq("status", "pending");
    return { state: "failed", attempt };
  }
  // the provider must report exactly what we asked for
  if (result.amountMinor !== Number(attempt.amount_minor) || result.currency !== attempt.currency || (result.reference && result.reference !== attempt.reference)) {
    console.error("payment.mismatch", { reference, expected: attempt.amount_minor, got: result.amountMinor, currency: result.currency });
    await service.from("payment_attempts").update({ status: "failed", failure_reason: "amount_or_currency_mismatch", completed_at: new Date().toISOString() }).eq("id", attempt.id).eq("status", "pending");
    return { state: "failed", attempt };
  }
  const state = await settle(service, attempt, result);
  return { state, attempt };
}

async function settle(service, attempt, result) {
  const now = new Date().toISOString();
  if (attempt.purpose === "document") {
    if (attempt.mode !== "live" && !testPaymentsAllowed()) {
      await service.from("payment_attempts").update({ status: "failed", failure_reason: "test_mode_payment", completed_at: now }).eq("id", attempt.id).eq("status", "pending");
      return "failed";
    }
    const { error } = await service.rpc("apply_payment", {
      doc_id: attempt.document_id, pay_method: attempt.provider, pay_reference: result.providerReference || attempt.reference,
      pay_amount: Number(attempt.amount_minor), pay_currency: attempt.currency, pay_note: "", attempt: attempt.id, recorder: null, pay_date: now,
    });
    // business-rule refusals (already paid, voided, declined…) mean real money arrived
    // that Usetally can't attach to the document: flag it for the team, don't retry forever
    const ruleRefusal = error && /balance due|not payable|Currency does not match|Document not found/.test(error.message);
    if (error && !ruleRefusal) throw new Error(`Payment verified but could not be recorded: ${error.message}`);
    if (error) {
      console.error("payment.needs_review", { reference: attempt.reference, message: error.message });
      await service.from("payment_attempts").update({ failure_reason: `needs_review: ${error.message}`.slice(0, 300) }).eq("id", attempt.id);
      await service.from("activity").insert({ business_id: attempt.business_id, document_id: attempt.document_id, actor_label: attempt.provider,
        action: "payment.needs_review", detail: { amount_minor: Number(attempt.amount_minor), reference: result.providerReference || attempt.reference, reason: error.message } });
    }
  } else if (attempt.purpose === "connection_test") {
    await service.from("payment_connections").update({ payment_confirmed_at: now, last_error: "", updated_at: now }).eq("business_id", attempt.business_id).eq("provider", attempt.provider);
  } else if (attempt.purpose === "subscription") {
    // test/sandbox payments are not real money: never activate a plan with them
    if (attempt.mode !== "live" && !testPaymentsAllowed()) {
      console.error("payment.test_subscription_refused", { reference: attempt.reference });
      await service.from("payment_attempts").update({ status: "failed", failure_reason: "test_mode_payment", completed_at: now }).eq("id", attempt.id).eq("status", "pending");
      return "failed";
    }
    const { error } = await service.rpc("activate_subscription", { attempt_id: attempt.id });
    if (error) throw new Error(`Subscription payment verified but not applied: ${error.message}`);
  }
  await service.from("payment_attempts").update({ status: "succeeded", provider_reference: result.providerReference || null, completed_at: now }).eq("id", attempt.id).eq("status", "pending");
  return "succeeded";
}

// light, throttled re-check run in the background when a business or customer
// opens a page, so missed webhooks are caught without a frequent cron job
const lastRun = new Map();
export function reconcileSoon(key, options) {
  const now = Date.now();
  if (now - (lastRun.get(key) || 0) < 120000) return;
  lastRun.set(key, now);
  return reconcilePending({ olderThanMinutes: 1, limit: 5, ...options }).catch((e) => console.error("reconcile.background_failed", { key, message: e.message }));
}

// re-checks attempts whose webhook never arrived (customer closed the tab, network blip)
export async function reconcilePending({ olderThanMinutes = 5, limit = 25, businessId, documentId } = {}) {
  const service = createSupabaseService();
  const until = new Date(Date.now() - olderThanMinutes * 60000).toISOString();
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  let query = service.from("payment_attempts").select("reference").eq("status", "pending").lt("created_at", until).gt("created_at", since).order("created_at").limit(limit);
  if (businessId) query = query.eq("business_id", businessId);
  if (documentId) query = query.eq("document_id", documentId);
  const { data } = await query;
  const results = [];
  for (const { reference } of data || []) {
    try { results.push({ reference, ...(await confirmAttempt(reference)) }); }
    catch (e) { results.push({ reference, state: "error", error: e.message }); }
  }
  return results.map(({ attempt, ...r }) => r);
}
