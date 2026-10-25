import "server-only";
import { AwsClient } from "aws4fetch";
import { decryptSecret } from "@/lib/crypto";

// Business files on Cloudflare R2, through its S3 API: logos and signatures
// (served from usetally.cc/media/…) and files attached to documents (only
// after a permission check). Image paths saved in the database look like
// "r2:<business_id>/logo-<time>.png"; older ones without "r2:" are in
// Supabase Storage and keep working.
//
// Set up once in Admin → Trial & billing → File storage (stored encrypted),
// or with Vercel settings R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY. The admin settings win. R2_ENDPOINT is for tests.

export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB for a logo or a signature

const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "").trim();

// Forgiving about what gets pasted: the account ID may come as the bare
// 32-character ID, the S3 address, or the dashboard link; the bucket may
// come as its address.
export function parseR2(raw) {
  const rawAccount = clean(raw.accountId), rawBucket = clean(raw.bucket);
  const accountId = rawAccount.match(/[0-9a-f]{32}/i)?.[0]?.toLowerCase() || "";
  const bucket = rawBucket.replace(/^https?:\/\/[^/]+/i, "").split("/").filter(Boolean).pop() || "";
  const accessKeyId = clean(raw.accessKeyId), secretAccessKey = clean(raw.secretAccessKey);
  const custom = clean(raw.endpoint).match(/^https?:\/\/[^/]+/i)?.[0] || "";
  // a pasted S3 address keeps its jurisdiction (e.g. ….eu.r2.cloudflarestorage.com)
  const pasted = rawAccount.match(/^https?:\/\/[0-9a-f]{32}\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com/i)?.[0]?.toLowerCase();
  if (!bucket || !accessKeyId || !secretAccessKey || !(accountId || custom)) return null;
  return { accountId, bucket, accessKeyId, secretAccessKey, endpoint: custom || pasted || `https://${accountId}.r2.cloudflarestorage.com` };
}

// What's wrong with pasted values, in plain words (null when they look right)
export function r2Problem(raw) {
  const a = clean(raw.accountId), id = clean(raw.accessKeyId), secret = clean(raw.secretAccessKey), bucket = clean(raw.bucket);
  if (!clean(raw.endpoint) && !/[0-9a-f]{32}/i.test(a)) return a ? "The Account ID should be 32 letters and numbers. Find it on Cloudflare's R2 overview page, on the right." : "Paste your Cloudflare Account ID.";
  if (!bucket) return "Enter the bucket name, like usetally-files.";
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(parseR2({ ...raw, accessKeyId: "x", secretAccessKey: "x" })?.bucket || "")) return "Bucket names use lowercase letters, numbers and dashes only.";
  if (!id) return "Paste the Access Key ID.";
  if (!secret) return "Paste the Secret Access Key.";
  if (/^cfat_|^cfut_/i.test(secret) || /^cfat_|^cfut_/i.test(id)) return "That's the token value. Use the Access Key ID and Secret Access Key shown below it when you create the R2 token.";
  if (id.length === 64 && secret.length === 32) return "The Access Key ID and Secret Access Key look swapped. The ID is the shorter one (32 characters).";
  if (!/^[0-9a-f]{32}$/i.test(id)) return "The Access Key ID should be 32 letters and numbers. Copy it again from the R2 token page.";
  if (!/^[0-9a-f]{64}$/i.test(secret)) return "The Secret Access Key should be 64 letters and numbers. Copy it again from the R2 token page (it's only shown once; create a new token if needed).";
  return null;
}

const envRaw = () => ({ accountId: process.env.R2_ACCOUNT_ID, bucket: process.env.R2_BUCKET, accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, endpoint: process.env.R2_ENDPOINT });

// loaded only when needed, so PDF and image code doesn't pull in request helpers
const service = async () => (await import("@/lib/supabase/server")).createSupabaseService();

// admin settings, read with the service key and kept for 30 seconds (5 while
// nothing is set up, so a fresh setup is picked up quickly everywhere)
let cache = null;
export function forgetStorageConfig() { cache = null; }
async function dashboardRaw() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.APP_ENCRYPTION_KEY) return { ok: true, raw: null };
  try {
    const { data, error } = await (await service()).from("platform_settings")
      .select("r2_account_id, r2_bucket, r2_access_key_id, r2_secret_enc").eq("id", true).maybeSingle();
    if (error) return { ok: /r2_/.test(error.message), raw: null }; // columns not added yet: fine, use Vercel
    if (!data?.r2_secret_enc) return { ok: true, raw: null };
    return { ok: true, raw: { accountId: data.r2_account_id, bucket: data.r2_bucket, accessKeyId: data.r2_access_key_id, secretAccessKey: decryptSecret(data.r2_secret_enc), endpoint: process.env.R2_ENDPOINT } };
  } catch { return { ok: false, raw: null }; }
}

export async function r2Config() {
  if (cache && Date.now() - cache.at < (cache.value ? 30_000 : 5_000)) return cache.value;
  const db = await dashboardRaw();
  const fromDb = db.raw && parseR2(db.raw);
  const value = fromDb ? { ...fromDb, source: "dashboard" } : (() => { const e = parseR2(envRaw()); return e ? { ...e, source: "vercel" } : null; })();
  if (db.ok) cache = { at: Date.now(), value };
  return value;
}
export const r2Ready = async () => Boolean(await r2Config());

const signers = new Map();
function aws(cfg) {
  const k = `${cfg.accessKeyId}:${cfg.secretAccessKey.length}:${cfg.secretAccessKey.slice(-6)}`;
  if (!signers.has(k)) { if (signers.size > 4) signers.clear(); signers.set(k, new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: "s3", region: "auto" })); }
  return signers.get(k);
}
const objectUrl = (cfg, key) => `${cfg.endpoint}/${cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

// only our own image names may be read or written
export const SAFE_KEY = /^[0-9a-f-]{36}\/(logo|signature)-\d+\.(png|jpg|webp)$/;
// files attached to documents: private, only served after a permission check
export const DOC_KEY = /^[0-9a-f-]{36}\/docs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

export async function r2Put(key, body, contentType) {
  const cfg = await r2Config();
  if (!cfg) throw new Error("Cloudflare R2 isn't set up.");
  const res = await aws(cfg).fetch(objectUrl(cfg, key), { method: "PUT", body, headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" } });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status})`);
}

export async function r2Get(key) {
  const cfg = await r2Config();
  if (!cfg || !(SAFE_KEY.test(key) || DOC_KEY.test(key))) return null;
  const res = await aws(cfg).fetch(objectUrl(cfg, key), { method: "GET" });
  return res.ok ? res : null;
}

export async function r2Delete(key) {
  const cfg = await r2Config();
  if (!cfg || !(SAFE_KEY.test(key) || DOC_KEY.test(key))) return false;
  return (await aws(cfg).fetch(objectUrl(cfg, key), { method: "DELETE" })).ok;
}

export async function r2DeletePrefix(prefix) {
  const cfg = await r2Config();
  if (!cfg) return 0;
  const list = await aws(cfg).fetch(`${cfg.endpoint}/${cfg.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`);
  if (!list.ok) return 0;
  const keys = [...(await list.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((x) => x[1]);
  await Promise.all(keys.map((k) => aws(cfg).fetch(objectUrl(cfg, k), { method: "DELETE" })));
  return keys.length;
}

// what the status page may show: the address and bucket, never the keys
function describe(cfg) {
  const host = cfg.endpoint.replace(/^https?:\/\//, "").replace(/^([0-9a-f]{4})[0-9a-f]{24}([0-9a-f]{4})/, "$1…$2");
  return `${host}, bucket "${cfg.bucket}"`;
}

// Can we use the bucket with these settings? Lists one object, then writes,
// reads and deletes a tiny test file, so a read-only token is caught too.
// With no argument it checks the settings in use.
export async function r2Check(candidate) {
  const cfg = candidate ? parseR2(candidate) : await r2Config();
  if (!cfg) {
    if (candidate) return { ready: false, note: r2Problem(candidate) || "Fill in all four fields." };
    const missing = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter((k) => !clean(process.env[k]));
    return { ready: false, note: missing.length === 4 ? "Not set up yet. Paste your Cloudflare R2 details in Admin → Trial & billing → File storage." : missing.length ? `Not set up: ${missing.join(", ")} missing in Vercel` : r2Problem(envRaw()) || "Not set up" };
  }
  const where = { target: describe(cfg), source: candidate ? "new" : cfg.source };
  const s = aws(cfg), timeout = () => AbortSignal.timeout(8000);
  try {
    const res = await s.fetch(`${cfg.endpoint}/${cfg.bucket}?list-type=2&max-keys=1`, { signal: timeout() });
    if (res.status === 403 || res.status === 401) {
      const code = (await res.text().catch(() => "")).match(/<Code>([^<]+)<\/Code>/)?.[1];
      return { ready: false, ...where, note: code === "SignatureDoesNotMatch"
        ? "Cloudflare knows the Access Key ID but the Secret Access Key doesn't match it. Copy the secret again, or create a new R2 token."
        : code === "InvalidAccessKeyId" ? "Cloudflare doesn't recognise that Access Key ID. Copy it again, or create a new R2 token (and check it's for this Cloudflare account)."
        : "Cloudflare refused the key. Make sure the R2 token has Object Read & Write and includes this bucket." };
    }
    if (res.status === 404) return { ready: false, ...where, note: `Bucket "${cfg.bucket}" wasn't found in this Cloudflare account. Check the bucket name and the Account ID.` };
    if (!res.ok) {
      const code = (await res.text().catch(() => "")).match(/<Code>([^<]+)<\/Code>/)?.[1];
      return { ready: false, ...where, note: `Cloudflare answered ${res.status}${code ? ` (${code})` : ""}` };
    }
    // the token must be able to write too
    const probe = `${cfg.endpoint}/${cfg.bucket}/_usetally-check.txt`;
    const put = await s.fetch(probe, { method: "PUT", body: "ok", headers: { "content-type": "text/plain" }, signal: timeout() });
    if (!put.ok) return { ready: false, ...where, note: put.status === 403 ? "This R2 token can read but not write. Give it Object Read & Write." : `Cloudflare refused a test upload (${put.status}).` };
    await s.fetch(probe, { method: "DELETE", signal: timeout() }).catch(() => {});
    return { ready: true, ...where, note: `Connected to bucket ${cfg.bucket}` };
  } catch (e) {
    const code = e?.cause?.code || e?.name || "";
    const why = code === "ENOTFOUND" || code === "EAI_AGAIN" ? "that address doesn't exist, so the Account ID is probably wrong" : code === "TimeoutError" ? "it didn't answer in time" : String(e?.cause?.message || e?.message || e).slice(0, 80);
    return { ready: false, ...where, note: `Couldn't reach Cloudflare (${code || "error"}): ${why}.` };
  }
}

// non-secret details of the saved settings, for the admin card
export async function storageSaved() {
  try {
    const { data } = await (await service()).from("platform_settings")
      .select("r2_account_id, r2_bucket, r2_key_hint, r2_checked_at").eq("id", true).maybeSingle();
    return data?.r2_key_hint ? { accountId: data.r2_account_id, bucket: data.r2_bucket, keyHint: data.r2_key_hint, checkedAt: data.r2_checked_at } : null;
  } catch { return null; }
}
