// "Sign in with Usetally" for AI assistants (ChatGPT, Claude, Grok), over
// OAuth 2.1 as the MCP spec asks: authorization code + PKCE (S256), apps
// identify themselves by registering (DCR, RFC 7591) or with a metadata URL
// (CIMD), refresh tokens rotate. Pure helpers, tested in node.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCESS_TTL_S = 60 * 60;              // 1 hour
export const REFRESH_TTL_S = 60 * 60 * 24 * 90;   // 90 days, renewed each refresh
export const CODE_TTL_S = 10 * 60;                // 10 minutes

// what the person can allow on the consent screen
export const ACCESS = {
  "read write": { label: "Full access", summary: "Create and edit quotes and invoices, send them to customers, record payments and see your documents." },
  read: { label: "View only", summary: "See your quotes, invoices, customers, products and totals. It can't change or send anything." },
};
export const SCOPES = ["usetally.read", "usetally.write"];

// what the app asked for → what we store ("read" or "read write")
export function scopeFrom(requested) {
  const s = String(requested || "").split(/\s+/);
  return s.includes("usetally.read") && !s.includes("usetally.write") ? "read" : "read write";
}
export const scopeOut = (scope) => (scope === "read" ? "usetally.read" : "usetally.read usetally.write");
export const canWrite = (scope) => String(scope || "").split(" ").includes("write");

// tokens: random, prefixed so they're recognisable in logs; only hashes stored
export const newToken = (prefix) => `${prefix}_${randomBytes(32).toString("base64url")}`;
export const hashToken = (t) => createHash("sha256").update(String(t)).digest("hex");

export function pkceOk(verifier, challenge) {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(String(verifier || ""))) return false;
  const a = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const b = Buffer.from(String(challenge || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

// redirect URIs an app may register: https anywhere, or http on this computer
// (desktop apps such as Claude Code)
export function redirectUriOk(uri) {
  let u;
  try { u = new URL(String(uri)); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && LOOPBACK.test(u.hostname);
}

// does the redirect in this request match one the app registered? Loopback
// addresses match on any port (RFC 8252 §7.3), everything else exactly.
export function redirectMatches(registered, given) {
  if ((registered || []).includes(given)) return true;
  let g;
  try { g = new URL(given); } catch { return false; }
  if (g.protocol !== "http:" || !LOOPBACK.test(g.hostname)) return false;
  return (registered || []).some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === "http:" && LOOPBACK.test(u.hostname) && u.hostname.toLowerCase() === g.hostname.toLowerCase() && u.pathname === g.pathname;
    } catch { return false; }
  });
}

// Who is asking, from where they'll send the person back. The app's own name
// is whatever it typed when registering, so the consent screen leads with the
// address, and only trusted addresses get a familiar name.
const KNOWN = [
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, "ChatGPT"],
  [/(^|\.)claude\.ai$|(^|\.)claude\.com$|(^|\.)anthropic\.com$/, "Claude"],
  [/(^|\.)grok\.com$|(^|\.)x\.ai$/, "Grok"],
  [/(^|\.)cursor\.(com|sh)$/, "Cursor"],
];
export function appFor(redirectUri, declaredName = "") {
  let host = "";
  try { host = new URL(redirectUri).hostname.toLowerCase(); } catch { /* invalid */ }
  if (LOOPBACK.test(host)) return { name: String(declaredName || "An app on your computer").slice(0, 80), host: "this computer", known: false, local: true };
  const hit = KNOWN.find(([re]) => re.test(host));
  return { name: hit ? hit[1] : String(declaredName || host || "An app").slice(0, 80), host, known: Boolean(hit), local: false };
}

// a client ID that is a metadata URL (CIMD): https, with a path
export function isCimdId(clientId) {
  try {
    const u = new URL(String(clientId));
    return u.protocol === "https:" && u.pathname.length > 1 && !u.hash;
  } catch { return false; }
}

// checks a fetched CIMD document
export function checkCimd(clientId, doc) {
  if (!doc || typeof doc !== "object") return { error: "That app's details couldn't be read." };
  if (doc.client_id !== clientId) return { error: "That app's details don't match its address." };
  const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map(String).slice(0, 20) : [];
  if (!uris.length || !uris.every(redirectUriOk)) return { error: "That app's return addresses aren't allowed." };
  return { name: String(doc.client_name || "").slice(0, 120), redirect_uris: uris };
}

// checks a registration (DCR) request
export function checkRegistration(body) {
  if (!body || typeof body !== "object") return { error: "invalid_client_metadata", description: "Send the app's details as JSON." };
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String).slice(0, 20) : [];
  if (!uris.length) return { error: "invalid_redirect_uri", description: "Add at least one redirect URI." };
  if (!uris.every(redirectUriOk)) return { error: "invalid_redirect_uri", description: "Redirect URIs must use https, or http on localhost." };
  const method = body.token_endpoint_auth_method || "none";
  if (method !== "none") return { error: "invalid_client_metadata", description: "Usetally issues public clients: use token_endpoint_auth_method \"none\" with PKCE." };
  const grants = body.grant_types || ["authorization_code"];
  if (!Array.isArray(grants) || grants.some((g) => !["authorization_code", "refresh_token"].includes(g))) return { error: "invalid_client_metadata", description: "Only authorization_code and refresh_token are supported." };
  return { name: String(body.client_name || "").slice(0, 120), redirect_uris: uris };
}

// discovery documents
export function protectedResourceMetadata(site) {
  return {
    resource: `${site}/mcp`,
    authorization_servers: [site],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Usetally",
    resource_documentation: `${site}/app/settings/ai`,
  };
}
export function authServerMetadata(site) {
  return {
    issuer: site,
    authorization_endpoint: `${site}/oauth/authorize`,
    token_endpoint: `${site}/oauth/token`,
    registration_endpoint: `${site}/oauth/register`,
    revocation_endpoint: `${site}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SCOPES, "offline_access"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${site}/app/settings/ai`,
  };
}

// the 401 that starts sign-in (MCP spec / RFC 9728)
export function challenge(site, error) {
  return `Bearer resource_metadata="${site}/.well-known/oauth-protected-resource/mcp"${error ? `, error="${error}"` : ""}, scope="${SCOPES.join(" ")}"`;
}

// the resource an app asked a token for must be this server (RFC 8707)
export function resourceOk(site, resource) {
  if (!resource) return true;
  const r = String(resource).replace(/\/$/, "");
  return r === `${site}/mcp` || r === site;
}

// validates the /oauth/authorize request (before the person sees anything)
export function checkAuthorizeRequest(params, client, site) {
  const p = (k) => String(params[k] ?? "");
  if (!client) return { fatal: "This app isn't registered with Usetally. Go back to the app and try connecting again." };
  const redirect = p("redirect_uri") || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : "");
  if (!redirect || !redirectMatches(client.redirect_uris, redirect)) return { fatal: "This app gave a return address it didn't register. For your safety, nothing was shared." };
  // from here on, errors go back to the app
  if (p("response_type") !== "code") return { redirect, error: "unsupported_response_type" };
  if (!p("code_challenge") || p("code_challenge_method") !== "S256") return { redirect, error: "invalid_request", description: "PKCE with S256 is required." };
  if (!resourceOk(site, p("resource"))) return { redirect, error: "invalid_target" };
  return { ok: true, redirect, scope: scopeFrom(p("scope")), state: p("state"), challenge: p("code_challenge"), resource: p("resource") };
}

export function redirectWith(redirect, params) {
  const u = new URL(redirect);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.searchParams.set(k, v);
  return u.toString();
}
