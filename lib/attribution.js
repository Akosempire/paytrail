import "server-only";
import { cookies, headers } from "next/headers";
import { UTM_KEYS } from "@/lib/attribution-core";

// The ad a visitor came from (cookies set by components/marketing-tags.js),
// read on the server when their business is created.
const parse = (raw) => { try { const v = JSON.parse(decodeURIComponent(raw || "")); return v && typeof v === "object" ? v : null; } catch { return null; } };
const clip = (v, max = 200) => (v == null || v === "" ? null : String(v).slice(0, max));

export async function readAttribution() {
  const jar = await cookies(), h = await headers();
  const first = parse(jar.get("ut_attr")?.value), last = parse(jar.get("ut_attr_last")?.value);
  const fields = {};
  for (const k of UTM_KEYS) fields[k] = clip(first?.[k]);
  fields.fbclid = clip(first?.fbclid || last?.fbclid, 500);
  fields.first_landing_url = clip(first?.first_landing_url, 500);
  fields.landed_at = first?.landed_at && !Number.isNaN(Date.parse(first.landed_at)) ? first.landed_at : null;
  fields.attr_last = last ? Object.fromEntries(Object.entries(last).map(([k, v]) => [k, clip(v, 500)])) : null;
  fields.fbc = clip(jar.get("_fbc")?.value, 500);
  fields.fbp = clip(jar.get("_fbp")?.value, 500);
  fields.attr_ip = clip((h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip"), 64);
  fields.attr_user_agent = clip(h.get("user-agent"), 400);
  const url = clip(h.get("referer"), 500);
  return { fields, url };
}

// browser copies of server events (same event ID, so Meta counts one): read by
// components/marketing-tags.js on the next page
export async function queueBrowserEvents(events) {
  const jar = await cookies();
  const now = parse(jar.get("ut_meta_ev")?.value) || [];
  const all = [...(Array.isArray(now) ? now : []), ...events.map((e) => ({ n: e.name, id: e.eventId, v: e.value ?? null, c: e.currency || null }))].slice(-6);
  jar.set("ut_meta_ev", encodeURIComponent(JSON.stringify(all)), { maxAge: 600, sameSite: "lax", path: "/", httpOnly: false, secure: process.env.NODE_ENV === "production" });
}
