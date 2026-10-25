import "server-only";
import { previewEnabled } from "@/lib/supabase/preview";

// Is "Continue with Google" switched on in Supabase (Authentication →
// Sign In / Providers → Google)? Read from Supabase's public settings and
// remembered for 5 minutes, so the button appears by itself once Google is
// enabled there, and never shows while it isn't.
let cache = null;
let lastProblem = null; // why the last check couldn't tell (for /status.json)
export const googleCheckProblem = () => lastProblem;
export async function googleEnabled() {
  if (previewEnabled()) return process.env.PAYTRAIL_PREVIEW_GOOGLE === "1";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.on;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(3000) });
    const on = res.ok ? Boolean((await res.json())?.external?.google) : false;
    lastProblem = res.ok ? null : `Supabase answered ${res.status} when asked which sign-in methods are on`;
    cache = { at: Date.now(), on };
    return on;
  } catch (e) {
    lastProblem = `Couldn't reach Supabase: ${String(e?.message || e).slice(0, 120)}`;
    return cache?.on ?? false; // Supabase slow: keep the last answer, default to hidden
  }
}
