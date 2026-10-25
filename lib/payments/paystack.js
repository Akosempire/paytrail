import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

// Paystack. Each business uses
// its own secret key: sk_test_… for testing, sk_live_… for real money. Paystack signs
// webhooks with that same secret key, so no separate webhook secret is needed.
const BASE = "https://api.paystack.co";

export function validPaystackKey(key) {
  return /^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(String(key || "").trim());
}
export function paystackMode(key) {
  return String(key).startsWith("sk_live_") ? "live" : "test";
}

async function call(key, path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    const err = new Error(data.message || `Paystack returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function testPaystackKey(key) {
  try {
    await call(key, "/balance");
    return { ok: true };
  } catch (e) {
    if (e.status === 401) return { ok: false, error: "Paystack rejected this secret key. Copy it again from Settings → API Keys & Webhooks." };
    if (e.status === 403) return { ok: true, limited: true };
    return { ok: false, error: e.message };
  }
}

export async function createPaystackCheckout(key, { amountMinor, currency, reference, email, callbackUrl, metadata }) {
  const body = await call(key, "/transaction/initialize", {
    method: "POST",
    body: {
      amount: Number(amountMinor), // Paystack also counts in kobo / pesewas / cents
      currency,
      email: email && /^\S+@\S+\.\S+$/.test(email) ? email : "customer@usetally.cc",
      reference,
      callback_url: callbackUrl,
      metadata,
    },
  });
  return { checkoutId: body.data?.access_code || null, url: body.data?.authorization_url };
}

export function normalisePaystack(data) {
  const status = String(data.status || "").toLowerCase();
  return {
    state: status === "success" ? "succeeded" : ["failed", "abandoned", "reversed"].includes(status) ? "failed" : "pending",
    rawStatus: status,
    amountMinor: Number(data.amount),
    currency: String(data.currency || "").toUpperCase(),
    reference: String(data.reference || ""),
    checkoutId: "",
    providerReference: String(data.id || data.reference || ""),
  };
}

export async function verifyPaystack(key, reference) {
  try {
    const body = await call(key, `/transaction/verify/${encodeURIComponent(reference)}`);
    return normalisePaystack(body.data || {});
  } catch (e) {
    if (e.status === 400 || e.status === 404) return { state: "pending", rawStatus: "not_found" };
    throw e;
  }
}

// x-paystack-signature: HMAC-SHA512 of the raw body with the secret key
export function validPaystackSignature(rawBody, signature, secretKey) {
  if (!secretKey || !signature) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");
  return safeEqual(expected, signature);
}
