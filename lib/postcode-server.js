import "server-only";
import { areaLabel, normalizePostcode } from "@/lib/postcode";

// Checks a postcode with NIPOST's Postcode API (docs.postcode.gov.ng).
// Vercel settings: POSTCODE_API_KEY (a secret nipost_live_… or nipost_test_…
// key), optional POSTCODE_LOOKUP_LEVEL (1 = free validity check; 2–3 also
// return the area and cost credits) and POSTCODE_API_URL.
// Never blocks the user when NIPOST can't be reached: the code is kept and
// marked unchecked.
//   { status: "verified", code, area } | { status: "invalid", code } |
//   { status: "format", error } | { status: "unchecked", code, reason }
const cache = new Map(); // code → { at, result }
const HOUR = 3600_000;

export function postcodeApiReady() { return Boolean(String(process.env.POSTCODE_API_KEY || "").trim()); }

async function lookup(code, level) {
  const base = String(process.env.POSTCODE_API_URL || "https://api.postcode.gov.ng/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/lookup?code=${encodeURIComponent(code)}&level=${level}`, {
    headers: { "X-API-Key": String(process.env.POSTCODE_API_KEY).trim(), Accept: "application/json" },
    signal: AbortSignal.timeout(6000), cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export async function verifyPostcode(raw) {
  const typed = String(raw || "").trim();
  if (!typed) return { status: "empty", code: "" };
  const code = normalizePostcode(typed);
  if (!code) return { status: "format", error: "That doesn't look like a postcode. It reads like EK-01-A03-FK-01." };
  if (!postcodeApiReady()) return { status: "unchecked", code, reason: "not_set_up" };
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < 6 * HOUR) return hit.result;

  const wanted = Math.min(3, Math.max(1, parseInt(process.env.POSTCODE_LOOKUP_LEVEL || "1", 10) || 1));
  let result;
  try {
    let r = await lookup(code, wanted);
    // no credits or level not granted: fall back to the free validity check
    if ((r.status === 402 || r.status === 403) && wanted > 1) r = await lookup(code, 1);
    const d = r.body?.data;
    if (r.status === 200 && d) {
      result = d.valid === false ? { status: "invalid", code } : { status: "verified", code, area: areaLabel(d.administrative_address || {}) };
    } else if (r.status === 404 || (r.status === 400 && /not.?found|invalid/i.test(r.body?.error?.code || ""))) {
      result = { status: "invalid", code };
    } else {
      result = { status: "unchecked", code, reason: r.body?.error?.code || `http_${r.status}` };
    }
  } catch (e) {
    result = { status: "unchecked", code, reason: e?.name === "TimeoutError" ? "timeout" : "unreachable" };
  }
  if (result.status !== "unchecked") cache.set(code, { at: Date.now(), result });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return result;
}

// for saving: what to store in postcode / postcode_area / postcode_verified_at,
// or an error to show (a postcode NIPOST says doesn't exist, or a bad format)
export async function postcodeFields(raw) {
  const v = await verifyPostcode(raw);
  if (v.status === "empty") return { fields: { postcode: "", postcode_area: "", postcode_verified_at: null } };
  if (v.status === "format") return { error: v.error };
  if (v.status === "invalid") return { error: `NIPOST doesn't recognise ${v.code}. Check it, or leave the postcode empty.` };
  return { fields: { postcode: v.code, postcode_area: v.area || "", postcode_verified_at: v.status === "verified" ? new Date().toISOString() : null }, verified: v.status === "verified" };
}
