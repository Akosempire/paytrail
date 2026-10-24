import "server-only";
import { decimalToMinor, minorToDecimalString } from "@/lib/money";
import { safeEqual } from "@/lib/crypto";

// Flutterwave Standard (v3). Each business uses its own secret key:
// FLWSECK_TEST-… for testing, FLWSECK-… for real money.
const BASE = "https://api.flutterwave.com/v3";

export function validFlutterwaveKey(key) {
  return /^FLWSECK(_TEST)?-[A-Za-z0-9]{10,}(-X)?$/.test(String(key || "").trim());
}
export function flutterwaveMode(key) {
  return String(key).startsWith("FLWSECK_TEST-") ? "test" : "live";
}

async function call(key, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === "error") {
    const err = new Error(body.message || `Flutterwave returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function testFlutterwaveKey(key) {
  try {
    await call(key, "/balances");
    return { ok: true };
  } catch (e) {
    if (e.status === 401) return { ok: false, error: "Flutterwave rejected this secret key. Copy it again from Settings → API keys." };
    if (e.status === 403) return { ok: true, limited: true };
    return { ok: false, error: e.message };
  }
}

export async function createFlutterwaveCheckout(key, { amountMinor, currency, reference, email, name, phone, redirectUrl, title, logo, description, metadata }) {
  const body = await call(key, "/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: reference,
      amount: minorToDecimalString(amountMinor),
      currency,
      redirect_url: redirectUrl,
      customer: { email: email || "customer@usetally.cc", name: name || undefined, phonenumber: phone || undefined },
      customizations: { title, logo: logo || undefined, description },
      meta: metadata,
    }),
  });
  return { checkoutId: null, url: body.data?.link };
}

export function normaliseFlutterwave(data) {
  const status = String(data.status || "").toLowerCase();
  return {
    state: status === "successful" ? "succeeded" : ["failed", "cancelled"].includes(status) ? "failed" : "pending",
    rawStatus: status,
    amountMinor: decimalToMinor(data.amount),
    currency: String(data.currency || "").toUpperCase(),
    reference: String(data.tx_ref || ""),
    checkoutId: "",
    providerReference: String(data.flw_ref || data.id || ""),
  };
}

export async function verifyFlutterwaveByReference(key, reference) {
  try {
    const body = await call(key, `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);
    return normaliseFlutterwave(body.data || {});
  } catch (e) {
    // no transaction for this reference yet: the customer has not paid
    if (e.status === 400 || e.status === 404) return { state: "pending", rawStatus: "not_found" };
    throw e;
  }
}

// Flutterwave sends the "secret hash" you set in its dashboard in the verif-hash header
export function validFlutterwaveHash(header, secretHash) {
  return Boolean(secretHash) && safeEqual(header || "", secretHash);
}
