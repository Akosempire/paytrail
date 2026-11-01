import "server-only";
import { isIP } from "node:net";
import {
  ACCESS_TTL_S, CODE_TTL_S, REFRESH_TTL_S, appFor, checkCimd, checkRegistration, hashToken, isCimdId, newToken,
  pkceOk, redirectMatches, resourceOk, scopeOut,
} from "@/lib/ai/oauth-core";

// The database side of "Sign in with Usetally" for AI assistants. Every
// function takes the service client; nothing here is reachable from a browser.

const iso = (secondsFromNow) => new Date(Date.now() + secondsFromNow * 1000).toISOString();
const CIMD_FRESH_MS = 24 * 3600_000;

// An app that identifies itself with a URL (CIMD): read its details from that
// URL (https, public host, small JSON, no redirects), cached for a day.
async function fetchCimd(clientId) {
  const u = new URL(clientId);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || /^(localhost|.*\.local|.*\.internal)$/i.test(host)) return { error: "That app's address isn't allowed." };
  try {
    const r = await fetch(clientId, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
    if (!r.ok) return { error: "That app's details couldn't be read." };
    const text = await r.text();
    if (text.length > 64_000) return { error: "That app's details are too large." };
    return checkCimd(clientId, JSON.parse(text));
  } catch { return { error: "That app's details couldn't be read." }; }
}

export async function getClient(service, clientId) {
  const id = String(clientId || "").slice(0, 500);
  if (!id) return null;
  const { data: row } = await service.from("oauth_clients").select("id, kind, name, redirect_uris, fetched_at").eq("id", id).maybeSingle();
  if (!isCimdId(id)) return row || null;
  if (row && row.fetched_at && Date.now() - new Date(row.fetched_at).getTime() < CIMD_FRESH_MS) return row;
  const doc = await fetchCimd(id);
  if (doc.error) return row || null;
  const fresh = { id, kind: "cimd", name: doc.name, redirect_uris: doc.redirect_uris, fetched_at: new Date().toISOString() };
  await service.from("oauth_clients").upsert(fresh);
  return fresh;
}

export async function registerClient(service, body) {
  const c = checkRegistration(body);
  if (c.error) return c;
  const id = `utc_${newToken("c").slice(2, 34)}`;
  const { error } = await service.from("oauth_clients").insert({ id, kind: "dcr", name: c.name, redirect_uris: c.redirect_uris });
  if (error) return { error: "server_error", description: "Couldn't register the app. Try again." };
  return {
    client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: c.name, redirect_uris: c.redirect_uris,
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
  };
}

// the person said yes: a one-time code for the app to swap for tokens
export async function createCode(service, { client, userId, businessId, scope, redirect, challenge, resource }) {
  const code = newToken("utcode");
  const app = appFor(redirect, client.name);
  const { error } = await service.from("oauth_codes").insert({
    code_hash: hashToken(code), client_id: client.id, user_id: userId, business_id: businessId, scope, redirect_uri: redirect,
    code_challenge: challenge, resource: resource || "", app_name: app.name, app_host: app.host, expires_at: iso(CODE_TTL_S),
  });
  return error ? { error: "Couldn't finish connecting. Try again." } : { code };
}

async function issueTokens(service, connection) {
  const access = newToken("ut_at");
  const refresh = newToken("ut_rt");
  const { error } = await service.from("oauth_tokens").insert([
    { token_hash: hashToken(access), connection_id: connection.id, kind: "access", expires_at: iso(ACCESS_TTL_S) },
    { token_hash: hashToken(refresh), connection_id: connection.id, kind: "refresh", expires_at: iso(REFRESH_TTL_S) },
  ]);
  if (error) return { error: "server_error" };
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopeOut(connection.scope) };
}

const bad = (description) => ({ error: "invalid_grant", description });

export async function exchangeCode(service, { code, clientId, redirect, verifier, resource, site }) {
  // single use: claim the code atomically
  const { data: rows } = await service.from("oauth_codes").update({ used_at: new Date().toISOString() })
    .eq("code_hash", hashToken(code)).is("used_at", null).gt("expires_at", new Date().toISOString()).select("*");
  const c = rows?.[0];
  if (!c) return bad("The sign-in code is invalid, used or expired. Connect again.");
  if (c.client_id !== clientId) return bad("This code was issued to another app.");
  if (redirect && !redirectMatches([c.redirect_uri], redirect)) return bad("The redirect URI doesn't match.");
  if (!pkceOk(verifier, c.code_challenge)) return bad("PKCE verification failed.");
  if (resource && !resourceOk(site, resource)) return { error: "invalid_target" };
  const { data: connection, error } = await service.from("ai_connections").insert({
    business_id: c.business_id, user_id: c.user_id, client_id: c.client_id, app_name: c.app_name, app_host: c.app_host, scope: c.scope, last_used_at: new Date().toISOString(),
  }).select("id, scope").single();
  if (error) return { error: "server_error" };
  return issueTokens(service, connection);
}

export async function refreshTokens(service, { refreshToken, clientId }) {
  const hash = hashToken(refreshToken);
  const now = new Date().toISOString();
  const { data: rows } = await service.from("oauth_tokens").update({ used_at: now })
    .eq("token_hash", hash).eq("kind", "refresh").is("used_at", null).gt("expires_at", now).select("connection_id");
  if (!rows?.[0]) {
    // a refresh token used twice may have been stolen: end that connection
    const { data: seen } = await service.from("oauth_tokens").select("connection_id, used_at").eq("token_hash", hash).eq("kind", "refresh").maybeSingle();
    if (seen?.used_at) await service.from("ai_connections").update({ revoked_at: now }).eq("id", seen.connection_id).is("revoked_at", null);
    return bad("The refresh token is invalid or expired. Connect again.");
  }
  const { data: connection } = await service.from("ai_connections").select("id, scope, client_id, revoked_at").eq("id", rows[0].connection_id).maybeSingle();
  if (!connection || connection.revoked_at) return bad("This connection was removed. Connect again.");
  if (clientId && connection.client_id !== clientId) return bad("This token was issued to another app.");
  return issueTokens(service, connection);
}

// RFC 7009: revoking either token ends the connection; unknown tokens are fine
export async function revokeToken(service, token) {
  const { data } = await service.from("oauth_tokens").select("connection_id").eq("token_hash", hashToken(token)).maybeSingle();
  if (data) await service.from("ai_connections").update({ revoked_at: new Date().toISOString() }).eq("id", data.connection_id).is("revoked_at", null);
}

// who is calling /mcp: a live access token, a live connection, and someone who
// is still a member of that business
export async function authenticate(service, header) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(header || "").trim());
  if (!m) return { error: null };
  const now = new Date().toISOString();
  const { data: t } = await service.from("oauth_tokens").select("connection_id").eq("token_hash", hashToken(m[1])).eq("kind", "access").gt("expires_at", now).maybeSingle();
  if (!t) return { error: "invalid_token" };
  const { data: connection } = await service.from("ai_connections").select("id, business_id, user_id, scope, app_name, last_used_at, revoked_at").eq("id", t.connection_id).maybeSingle();
  if (!connection || connection.revoked_at) return { error: "invalid_token" };
  const [{ data: member }, { data: business }] = await Promise.all([
    service.from("memberships").select("role, can_view_costs, full_name, email").eq("business_id", connection.business_id).eq("user_id", connection.user_id).maybeSingle(),
    service.from("businesses").select("id, name, kind, currency, require_approval, subscription_status, deletion_requested_at, tax_rate, tax_label, tax2_rate, tax2_label, default_terms, invoice_due_days, quote_validity_days").eq("id", connection.business_id).maybeSingle(),
  ]);
  if (!member || !business) return { error: "invalid_token" };
  if (!connection.last_used_at || Date.now() - new Date(connection.last_used_at).getTime() > 5 * 60_000) {
    service.from("ai_connections").update({ last_used_at: now }).eq("id", connection.id).then(() => null, () => null);
  }
  return { connection, member, business, userId: connection.user_id };
}
