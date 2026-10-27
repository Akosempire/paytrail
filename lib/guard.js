import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { createSupabaseService } from "@/lib/supabase/server";
import { isThrowawayEmail, readFormToken } from "@/lib/guard-core";

// Bot protection for the sign-in and sign-up forms. Nothing here needs a key
// except Cloudflare Turnstile, which only switches on when both
// NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set.
//  - a hidden field only bots fill in, and a signed time: a form sent back
//    faster than a person can type is refused
//  - limits per network (IP) and per email, kept in the database
//  - throwaway email addresses can't sign up

const secret = () => process.env.APP_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "usetally-dev";
const sign = (v) => createHmac("sha256", secret()).update(`form:${v}`).digest("base64url").slice(0, 32);

// put in the form when the page renders
export function formToken() {
  const t = String(Date.now());
  return `${t}.${sign(t)}`;
}

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

const SAY = "Something went wrong. Please try again.";

// the hidden field, the signed time and (when set up) Turnstile
export async function humanCheck(form, { minMs = 1500, turnstile: useTurnstile = true } = {}) {
  if (String(form.get("website") || "")) return { ok: false, error: SAY }; // honeypot
  const age = readFormToken(form.get("ft"), (t, mac) => {
    const want = Buffer.from(sign(t)), got = Buffer.from(String(mac || ""));
    return want.length === got.length && timingSafeEqual(want, got);
  });
  if (age === null) return { ok: false, error: "This page was open too long. Refresh it and try again." };
  if (age < minMs) return { ok: false, error: SAY };
  const ts = useTurnstile ? await turnstile(form.get("cf-turnstile-response")) : { ok: true };
  if (!ts.ok) return ts;
  return { ok: true };
}

export const turnstileOn = () => Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

async function turnstile(token) {
  if (!turnstileOn()) return { ok: true };
  if (!token) return { ok: false, error: "Please wait a moment for the security check, then try again." };
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: String(token), remoteip: await clientIp() });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.success ? { ok: true } : { ok: false, error: "The security check didn't pass. Refresh the page and try again." };
  } catch {
    return { ok: true }; // Cloudflare unreachable: don't lock real people out
  }
}

const keyOf = (kind, value) => `${kind}:${createHash("sha256").update(`rl:${String(value).toLowerCase()}`).digest("hex").slice(0, 40)}`;

// true while under the limit. Counted in the database so every server sees
// the same numbers; if the limits SQL hasn't run yet, it allows.
export async function underLimit(kind, value, windowSeconds, max) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const { data, error } = await createSupabaseService().rpc("rate_hit", { hit_key: keyOf(kind, value), window_seconds: windowSeconds, max_hits: max });
    return error ? true : data !== false;
  } catch { return true; }
}

// several limits at once; the first one hit decides the message
export async function limits(checks) {
  for (const [kind, value, windowSeconds, max, message] of checks) {
    if (value && !(await underLimit(kind, value, windowSeconds, max))) return { ok: false, error: message || "Too many tries. Wait a few minutes and try again." };
  }
  return { ok: true };
}

export { isThrowawayEmail };
