import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { MAX_STOCK_ATTEMPTS, bearerKey, cleanCatalog, cleanText, hashSecret, nextAttemptDelayMs, sameHash } from "@/lib/pos-core";

// TrackOja POS ↔ Usetally (docs/POS_CONNECT.md): the server side. Keys are
// never logged, and never returned except once by POST /api/pos/link.

export const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (status, error) => json({ error }, status);

// reads a JSON body of at most `max` bytes; { body } or { response }
export async function readJson(request, max = 256_000) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > max) return { response: fail(413, "Request is too large") };
  let text;
  try { text = await request.text(); } catch { return { response: fail(400, "Could not read the request") }; }
  if (text.length > max) return { response: fail(413, "Request is too large") };
  if (!text.trim()) return { body: {} };
  try { return { body: JSON.parse(text) }; } catch { return { response: fail(400, "Send valid JSON") }; }
}

// Authorization: Bearer utpos_… → the active connection and its business, or a 401/429 response
export async function authenticate(request) {
  const key = bearerKey(request.headers.get("authorization"));
  if (!key) return { response: fail(401, "Unauthorized") };
  const hash = hashSecret(key);
  const { underLimit } = await import("@/lib/guard");
  if (!(await underLimit("pos", hash, 60, 300))) return { response: fail(429, "Too many requests. Slow down and retry.") };
  const service = createSupabaseService();
  const { data: conn } = await service.from("pos_connections").select("id, business_id, key_hash, store_id, store_name, created_at, last_used_at, businesses(id, name, currency)")
    .eq("key_hash", hash).is("revoked_at", null).maybeSingle();
  if (!conn || !sameHash(conn.key_hash, hash)) return { response: fail(401, "Unauthorized") };
  // last_used_at at most once a minute
  if (!conn.last_used_at || Date.now() - new Date(conn.last_used_at).getTime() > 60000) {
    await service.from("pos_connections").update({ last_used_at: new Date().toISOString() }).eq("id", conn.id);
  }
  return { conn, service };
}

// database errors from pos_* functions: "POS422: …" → 422 with the message
export function dbError(error) {
  const m = /POS(4\d\d):\s*([^\n]*)/.exec(String(error?.message || ""));
  if (m) return fail(Number(m[1]) === 401 ? 401 : Number(m[1]), m[2].trim() || "Request refused");
  console.error("pos.db_error", { message: String(error?.message || error).slice(0, 300) });
  return fail(500, "Something went wrong. Retry later.");
}

// the active connection for a business, with its key decrypted (server only)
async function activeLink(service, businessId) {
  const { data } = await service.from("pos_connections").select("id, business_id, key_enc, store_id, store_name, callback_base").eq("business_id", businessId).is("revoked_at", null).maybeSingle();
  return data || null;
}

// calls one of TrackOja's Edge Functions. A 401 means TrackOja dropped the
// link: it is revoked here too (contract §2).
async function callTrackOja(service, link, path, { method = "GET", query, body } = {}) {
  const url = new URL(`${link.callback_base}/${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url, {
      method, redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${decryptSecret(link.key_enc)}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, error: e?.name === "TimeoutError" ? "TrackOja didn't answer in time" : "Couldn't reach TrackOja" };
  }
  if (res.status === 401) {
    await service.rpc("pos_revoke", { conn_id: link.id });
    return { ok: false, status: 401, error: "TrackOja no longer accepts this link. Connect again from TrackOja." };
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) return { ok: false, status: res.status, error: cleanText(data?.error, 200) || `TrackOja answered ${res.status}` };
  return { ok: true, status: res.status, data };
}

// "Add from TrackOja" in the editor
export async function searchCatalog(businessId, q) {
  const service = createSupabaseService();
  const link = await activeLink(service, businessId);
  if (!link) return { error: "TrackOja isn't connected." };
  const r = await callTrackOja(service, link, "usetally-catalog", { query: { q: cleanText(q, 100), limit: 50 } });
  if (!r.ok) return { error: r.error };
  return { products: cleanCatalog(r.data), store: link.store_name };
}

// sends one queued stock update (pos_stock_pushes) to TrackOja's usetally-stock
async function sendStockPush(service, row) {
  const now = new Date();
  let { data: link } = await service.from("pos_connections").select("id, business_id, key_enc, store_id, store_name, callback_base, revoked_at").eq("id", row.connection_id).maybeSingle();
  // re-linked to the same store since the invoice was paid: use the new link
  if (link?.revoked_at) {
    const { data: again } = await service.from("pos_connections").select("id, business_id, key_enc, store_id, store_name, callback_base, revoked_at")
      .eq("business_id", row.business_id).eq("store_id", link.store_id).is("revoked_at", null).maybeSingle();
    link = again || null;
  }
  if (!link) {
    await service.from("pos_stock_pushes").update({ status: "failed", last_error: "TrackOja isn't connected any more", attempts: row.attempts + 1 }).eq("document_id", row.document_id).eq("status", "pending");
    return "failed";
  }
  const r = await callTrackOja(service, link, "usetally-stock", { method: "POST", body: { document_id: row.document_id, number: row.number, lines: row.lines } });
  const attempts = row.attempts + 1;
  if (r.ok) {
    await service.from("pos_stock_pushes").update({ status: "sent", sent_at: now.toISOString(), attempts, last_error: "" }).eq("document_id", row.document_id);
    await service.from("activity").insert({ business_id: row.business_id, document_id: row.document_id, actor_label: "TrackOja POS", action: "pos.stock_updated",
      detail: { store: link.store_name, lines: row.lines.length, applied: r.data?.applied !== false } });
    return "sent";
  }
  const final = r.status === 401 || (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) || attempts >= MAX_STOCK_ATTEMPTS;
  await service.from("pos_stock_pushes").update({
    status: final ? "failed" : "pending", attempts, last_error: String(r.error || "").slice(0, 300),
    next_attempt_at: new Date(now.getTime() + nextAttemptDelayMs(attempts)).toISOString(),
  }).eq("document_id", row.document_id);
  if (final) console.error("pos.stock_failed", { document: row.document_id, status: r.status });
  return final ? "failed" : "retry";
}

// sends due stock updates: right after a payment (for that business) and from
// the daily job (everyone). Never throws.
export async function pushPendingStock({ businessId, limit = 25 } = {}) {
  try {
    const service = createSupabaseService();
    let q = service.from("pos_stock_pushes").select("*").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
    if (businessId) q = q.eq("business_id", businessId);
    const { data } = await q;
    const results = [];
    for (const row of data || []) {
      try { results.push({ document: row.document_id, state: await sendStockPush(service, row) }); }
      catch (e) { results.push({ document: row.document_id, state: "error" }); console.error("pos.stock_error", { document: row.document_id, message: String(e?.message || e).slice(0, 200) }); }
    }
    return results;
  } catch (e) {
    return [{ state: "error", error: String(e?.message || e).slice(0, 200) }];
  }
}

// light, throttled retry when someone in the business opens the app
const lastStockRun = new Map();
export function pushStockSoon(businessId) {
  const now = Date.now();
  if (now - (lastStockRun.get(businessId) || 0) < 120000) return;
  lastStockRun.set(businessId, now);
  return pushPendingStock({ businessId, limit: 3 });
}
