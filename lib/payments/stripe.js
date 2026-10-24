import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

// Stripe Checkout (hosted page). Works for businesses in the US, UK, EU, Canada,
// Australia and the other countries Stripe supports. Each business uses its own
// secret key: sk_test_… for testing, sk_live_… (or a restricted rk_ key) for real money.
const BASE = "https://api.stripe.com/v1";

// currencies Stripe counts in whole units (no cents) among the ones PayTrail offers
const ZERO_DECIMAL = new Set(["XOF", "XAF", "JPY", "KRW", "UGX", "RWF", "VND"]);
export function toStripeAmount(minor, currency) {
  return ZERO_DECIMAL.has(currency) ? Math.round(Number(minor) / 100) : Number(minor);
}
export function fromStripeAmount(amount, currency) {
  return ZERO_DECIMAL.has(String(currency).toUpperCase()) ? Number(amount) * 100 : Number(amount);
}

export function validStripeKey(key) {
  return /^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/.test(String(key || "").trim());
}
export function stripeMode(key) {
  return /_live_/.test(String(key)) ? "live" : "test";
}

function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(key, path, { method = "GET", body, idempotencyKey } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? form(body).toString() : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Stripe returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function testStripeKey(key) {
  try {
    await call(key, "/balance");
    return { ok: true };
  } catch (e) {
    if (e.status === 401) return { ok: false, error: "Stripe rejected this secret key. Copy it again from Developers → API keys." };
    if (e.status === 403) return { ok: true, limited: true };
    return { ok: false, error: e.message };
  }
}

export async function createStripeCheckout(key, { amountMinor, currency, reference, email, title, description, successUrl, cancelUrl, metadata }) {
  const session = await call(key, "/checkout/sessions", {
    method: "POST",
    idempotencyKey: reference,
    body: {
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: reference,
      customer_email: email && /^\S+@\S+\.\S+$/.test(email) ? email : undefined,
      line_items: { 0: { quantity: 1, price_data: { currency: currency.toLowerCase(), unit_amount: toStripeAmount(amountMinor, currency), product_data: { name: title || "Payment", description: description || undefined } } } },
      metadata,
      payment_intent_data: { metadata, description: description || undefined },
    },
  });
  return { checkoutId: session.id, url: session.url };
}

export function normaliseStripe(session) {
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const failed = session.status === "expired";
  return {
    state: paid ? "succeeded" : failed ? "failed" : "pending",
    rawStatus: `${session.status}/${session.payment_status}`,
    amountMinor: fromStripeAmount(session.amount_total, session.currency),
    currency: String(session.currency || "").toUpperCase(),
    reference: String(session.client_reference_id || session.metadata?.paytrail_reference || ""),
    checkoutId: String(session.id || ""),
    providerReference: String(session.payment_intent || session.id || ""),
  };
}

export async function retrieveStripeCheckout(key, sessionId) {
  return normaliseStripe(await call(key, `/checkout/sessions/${encodeURIComponent(sessionId)}`));
}

// Stripe-Signature: t=<timestamp>,v1=<hmac>[,v1=…]; HMAC-SHA256 of "<t>.<raw body>" with the endpoint's whsec_ secret
export function validStripeSignature(rawBody, header, secret) {
  if (!secret || !header) return false;
  const items = String(header).split(",").map((p) => p.split("="));
  const t = Number(items.find(([k]) => k === "t")?.[1]);
  const sigs = items.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300 || !sigs.length) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return sigs.some((s) => safeEqual(expected, s));
}
