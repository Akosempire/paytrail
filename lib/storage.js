import "server-only";
import { AwsClient } from "aws4fetch";

// Business images (logos, signatures) on Cloudflare R2, through its S3 API.
// The bucket stays private; files are served from usetally.cc/media/… (see
// app/media/[...key]/route.js). Paths saved in the database look like
// "r2:<business_id>/logo-<time>.png"; older ones without "r2:" are in
// Supabase Storage and keep working.
//
// Vercel settings: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
// (R2_ENDPOINT only for tests).

export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB for a logo or a signature

const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "");
// Forgiving about what gets pasted: the account ID may come as the bare
// 32-character ID, the S3 URL, or the dashboard address; the bucket may come
// as its URL. Anything else in R2_ENDPOINT (other than tests) is ignored.
export function r2Config() {
  const rawAccount = clean(process.env.R2_ACCOUNT_ID), rawBucket = clean(process.env.R2_BUCKET);
  const accountId = rawAccount.match(/[0-9a-f]{32}/i)?.[0]?.toLowerCase() || "";
  const bucket = rawBucket.replace(/^https?:\/\/[^/]+/i, "").split("/").filter(Boolean).pop() || "";
  const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID), secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY);
  const custom = clean(process.env.R2_ENDPOINT).match(/^https?:\/\/[^/]+/i)?.[0] || "";
  if (!bucket || !accessKeyId || !secretAccessKey || !(accountId || custom)) return null;
  // a pasted S3 address keeps its jurisdiction (e.g. ….eu.r2.cloudflarestorage.com)
  const pasted = rawAccount.match(/^https?:\/\/[0-9a-f]{32}\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com/i)?.[0]?.toLowerCase();
  const endpoint = custom || pasted || `https://${accountId}.r2.cloudflarestorage.com`;
  return { bucket, endpoint, accessKeyId, secretAccessKey };
}
// what the status page may show: the address and bucket, never the keys
function describe(cfg) {
  const host = cfg.endpoint.replace(/^https?:\/\//, "").replace(/^([0-9a-f]{4})[0-9a-f]{24}([0-9a-f]{4})/, "$1…$2");
  return `${host}, bucket "${cfg.bucket}"`;
}
function settingsHint() {
  const raw = clean(process.env.R2_ACCOUNT_ID);
  if (!clean(process.env.R2_ENDPOINT) && !/[0-9a-f]{32}/i.test(raw)) return raw ? "R2_ACCOUNT_ID doesn't contain a 32-character account ID (find it on the R2 overview page, right side)." : "R2_ACCOUNT_ID is empty.";
  return null;
}
export const r2Ready = () => Boolean(r2Config());

let signer = null, signerFor = "";
function aws(cfg) {
  if (!signer || signerFor !== cfg.accessKeyId) { signer = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: "s3", region: "auto" }); signerFor = cfg.accessKeyId; }
  return signer;
}
const objectUrl = (cfg, key) => `${cfg.endpoint}/${cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

// only our own image names may be read or written
export const SAFE_KEY = /^[0-9a-f-]{36}\/(logo|signature)-\d+\.(png|jpg|webp)$/;
// files attached to documents: private, only served after a permission check
export const DOC_KEY = /^[0-9a-f-]{36}\/docs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

export async function r2Put(key, body, contentType) {
  const cfg = r2Config();
  if (!cfg) throw new Error("Cloudflare R2 isn't set up.");
  const res = await aws(cfg).fetch(objectUrl(cfg, key), { method: "PUT", body, headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" } });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status})`);
}

export async function r2Get(key) {
  const cfg = r2Config();
  if (!cfg || !(SAFE_KEY.test(key) || DOC_KEY.test(key))) return null;
  const res = await aws(cfg).fetch(objectUrl(cfg, key), { method: "GET" });
  return res.ok ? res : null;
}

export async function r2Delete(key) {
  const cfg = r2Config();
  if (!cfg || !(SAFE_KEY.test(key) || DOC_KEY.test(key))) return false;
  return (await aws(cfg).fetch(objectUrl(cfg, key), { method: "DELETE" })).ok;
}

export async function r2DeletePrefix(prefix) {
  const cfg = r2Config();
  if (!cfg) return 0;
  const list = await aws(cfg).fetch(`${cfg.endpoint}/${cfg.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`);
  if (!list.ok) return 0;
  const keys = [...(await list.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((x) => x[1]);
  await Promise.all(keys.map((k) => aws(cfg).fetch(objectUrl(cfg, k), { method: "DELETE" })));
  return keys.length;
}

// for the status page and admin card: can we list the bucket with this key?
export async function r2Check() {
  const cfg = r2Config();
  if (!cfg) {
    const missing = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter((k) => !clean(process.env[k]));
    return { ready: false, note: missing.length ? `Not set up: ${missing.join(", ")} missing in Vercel` : settingsHint() || "Not set up" };
  }
  try {
    const res = await aws(cfg).fetch(`${cfg.endpoint}/${cfg.bucket}?list-type=2&max-keys=1`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) return { ready: true, note: `Connected to bucket ${cfg.bucket}`, target: describe(cfg) };
    if (res.status === 403 || res.status === 401) return { ready: false, target: describe(cfg), note: "Cloudflare refused the key. Check R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY, and that the token has Object Read & Write on this bucket." };
    if (res.status === 404) return { ready: false, target: describe(cfg), note: `Bucket "${cfg.bucket}" wasn't found. Check R2_BUCKET and R2_ACCOUNT_ID.` };
    const body = (await res.text().catch(() => "")).match(/<Code>([^<]+)<\/Code>/)?.[1];
    return { ready: false, target: describe(cfg), note: `Cloudflare answered ${res.status}${body ? ` (${body})` : ""}` };
  } catch (e) {
    const code = e?.cause?.code || e?.name || "";
    const why = code === "ENOTFOUND" || code === "EAI_AGAIN" ? "the address doesn't exist, so R2_ACCOUNT_ID is probably wrong" : code === "TimeoutError" ? "it didn't answer in time" : String(e?.cause?.message || e?.message || e).slice(0, 80);
    return { ready: false, target: describe(cfg), note: `Couldn't reach Cloudflare (${code || "error"}): ${why}. ${settingsHint() || ""}`.trim() };
  }
}
