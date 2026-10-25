import { googleCheckProblem, googleEnabled } from "@/lib/auth-providers";

// Public, non-secret health check: which deploy is live and whether
// "Continue with Google" is switched on in Supabase. Helps confirm setup.
export const dynamic = "force-dynamic";

export async function GET() {
  const google = await googleEnabled();
  return Response.json({
    ok: true,
    version: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
    deployedFrom: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] || null,
    google: { enabled: google, note: google ? "Google sign-in button is showing" : googleCheckProblem() || "Supabase reports Google as switched off (Authentication → Sign In / Providers → Google)" },
  }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
