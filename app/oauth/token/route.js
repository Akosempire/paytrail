import { createSupabaseService } from "@/lib/supabase/server";
import { exchangeCode, refreshTokens } from "@/lib/ai/oauth";
import { aiSite, json, preflight, readBody } from "@/lib/ai/http";
import { clientIp, underLimit } from "@/lib/guard";

// swaps the one-time sign-in code (with its PKCE verifier) for tokens, and
// refreshes them; refresh tokens are single use and rotate
export async function POST(request) {
  if (!(await underLimit("oauth_token", await clientIp(), 60, 60))) return json({ error: "slow_down" }, 429);
  const b = await readBody(request);
  const service = createSupabaseService();
  let r;
  if (b.grant_type === "authorization_code") {
    if (!b.code || !b.client_id || !b.code_verifier) return json({ error: "invalid_request", error_description: "code, client_id and code_verifier are required." }, 400);
    r = await exchangeCode(service, { code: String(b.code), clientId: String(b.client_id), redirect: b.redirect_uri ? String(b.redirect_uri) : "", verifier: String(b.code_verifier), resource: b.resource, site: aiSite() });
  } else if (b.grant_type === "refresh_token") {
    if (!b.refresh_token) return json({ error: "invalid_request", error_description: "refresh_token is required." }, 400);
    r = await refreshTokens(service, { refreshToken: String(b.refresh_token), clientId: b.client_id ? String(b.client_id) : "" });
  } else {
    return json({ error: "unsupported_grant_type" }, 400);
  }
  if (r.error) return json({ error: r.error, ...(r.description ? { error_description: r.description } : {}) }, r.error === "server_error" ? 500 : 400);
  return json(r, 200, { pragma: "no-cache" });
}
export const OPTIONS = preflight;
