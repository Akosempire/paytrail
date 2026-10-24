import "server-only";
import { createHmac } from "node:crypto";
import { decimalToMinor, minorToDecimalString } from "@/lib/money";
import { safeEqual } from "@/lib/crypto";

// Bachs hosted checkout. Each business uses its own secret key:
// sk_sandbox_… for testing, sk_live_… for real money.
export function validBachsKey(key) {
  return /^sk_(sandbox|live)_[A-Za-z0-9_\-]{8,}$/.test(String(key || "").trim());
}
export function bachsMode(key) {
  return String(key).startsWith("sk_live_") ? "live" : "test";
}
function base(key) {
  return String(key).startsWith("sk_sandbox_") ? "https://sandbox-api.bachs.io" : "https://api.bachs.io";
}

async function call(key, path, options = {}) {
  const res = await fetch(`${base(key)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.detail || body.message || `Bachs returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// checks the key without moving money; a restricted key (403) still counts as valid
export async function testBachsKey(key) {
  try {
    await call(key, "/v1/balances");
    return { ok: true };
  } catch (e) {
    if (e.status === 403) return { ok: true, limited: true };
    if (e.status === 401) return { ok: false, error: "Bachs rejected this secret key. Copy it again from your Bachs dashboard." };
    return { ok: false, error: e.message };
  }
}

export async function createBachsCheckout(key, { amountMinor, currency, reference, email, name, successUrl, cancelUrl, metadata }) {
  const body = await call(key, "/v1/checkout-sessions", {
    method: "POST",
    headers: { "Idempotency-Key": reference },
    body: JSON.stringify({
      customer: { email: email || undefined, ...(name ? { name } : {}) },
      pricing: { amount: minorToDecimalString(amountMinor), currency },
      reference, success_url: successUrl, cancel_url: cancelUrl, metadata,
    }),
  });
  return { checkoutId: body.checkout_id, url: body.checkout_url };
}

const SETTLED = ["succeeded", "accepted", "paid", "complete", "completed", "success"];
const FAILED = ["failed", "declined", "cancelled", "canceled", "expired", "abandoned", "underpaid"];

export function normaliseBachs(data) {
  const status = String(data.payment_status || data.status || data.charge?.status || "").toLowerCase();
  return {
    state: SETTLED.includes(status) ? "succeeded" : FAILED.includes(status) ? "failed" : "pending",
    rawStatus: status,
    amountMinor: decimalToMinor(data.amount ?? data.pricing?.amount ?? data.charge?.amount),
    currency: String(data.currency || data.pricing?.currency || data.charge?.currency || "").toUpperCase(),
    reference: String(data.reference || ""),
    checkoutId: String(data.checkout_id || data.checkout?.checkout_id || ""),
    providerReference: String(data.charge_id || data.charge?.charge_id || data.payment_id || data.checkout_id || ""),
  };
}

export async function retrieveBachsCheckout(key, checkoutId) {
  return normaliseBachs(await call(key, `/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`));
}

// Bachs signs "<timestamp>.<raw body>" with HMAC-SHA256 using the webhook signing secret
export function validBachsSignature(rawBody, timestamp, signature, secret) {
  const ts = Number(timestamp);
  if (!secret || !signature || !Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`, "utf8").digest("hex");
  return safeEqual(expected, signature);
}
