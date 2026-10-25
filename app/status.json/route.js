import { googleCheckProblem, googleEnabled } from "@/lib/auth-providers";
import { emailStatus, lastEmailFailure } from "@/lib/email";
import { supabaseUrl } from "@/lib/supabase/url";
import { r2Check } from "@/lib/storage";

// Public, non-secret health check: which deploy is live, whether the site can
// talk to Supabase, how email is sent and the last email problem, and whether
// "Continue with Google" is on. Never includes keys, passwords or addresses.
export const dynamic = "force-dynamic";

async function supabaseCheck() {
  const typed = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const raw = supabaseUrl();
  let host = null, extraPath = null;
  try { const u = new URL(raw); host = u.host; } catch {}
  try { extraPath = new URL(typed.trim()).pathname.replace(/\/+$/, "") || null; } catch {}
  const out = { urlSet: Boolean(raw), host, extraPath, extraPathIgnored: Boolean(extraPath), anonKeySet: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), serviceKeySet: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) };
  if (!host) return out;
  try {
    const res = await fetch(`${raw.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    out.authSettings = res.status;
    if (res.ok) { const j = await res.json(); out.signInMethods = Object.entries(j.external || {}).filter(([, on]) => on).map(([k]) => k); out.emailCodeLength = j.mailer_otp_length || null; }
  } catch (e) { out.authSettings = `error: ${String(e?.message || e).slice(0, 80)}`; }
  return out;
}

export async function GET() {
  const [google, supabase, email, r2] = await Promise.all([googleEnabled(), supabaseCheck(), emailStatus().catch(() => null), r2Check()]);
  return Response.json({
    ok: true,
    version: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
    deployedFrom: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] || null,
    supabase,
    email: email && {
      sendingWith: email.source === "vercel-sendhiiv" ? "sendhiiv (SENDHIIV_API_KEY in Vercel)" : email.source === "dashboard" ? `${email.provider} (admin settings)` : email.source === "vercel" ? "SMTP settings in Vercel" : "not set up (Supabase sends its own emails)",
      settingsProblems: email.env?.hints || [],
      lastFailure: lastEmailFailure(),
    },
    storage: { images: r2.ready ? "cloudflare-r2" : "supabase", note: r2.note, target: r2.target || null, maxImageSize: "1 MB" },
    google: { enabled: google, note: google ? "Google sign-in button is showing" : googleCheckProblem() || "Supabase reports Google as switched off (Authentication → Sign In / Providers → Google)" },
  }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
