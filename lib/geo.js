import "server-only";
import { headers } from "next/headers";

// The visitor's country (ISO alpha-2, e.g. "NG"), from the IP-country header
// Vercel adds to every request (Cloudflare's as a fallback). null when unknown,
// e.g. locally. PAYTRAIL_PREVIEW_GEO overrides it for previews and tests.
export async function visitorCountry() {
  const preview = process.env.PAYTRAIL_PREVIEW_GEO;
  if (preview) return preview.toUpperCase();
  try {
    const h = await headers();
    const c = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(c) && c !== "XX" ? c : null;
  } catch { return null; }
}
