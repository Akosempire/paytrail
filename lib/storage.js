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
export function r2Config() {
  const accountId = clean(process.env.R2_ACCOUNT_ID), bucket = clean(process.env.R2_BUCKET);
  const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID), secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY);
  if (!bucket || !accessKeyId || !secretAccessKey || !(accountId || process.env.R2_ENDPOINT)) return null;
  const endpoint = (clean(process.env.R2_ENDPOINT) || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");
  return { bucket, endpoint, accessKeyId, secretAccessKey };
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

export async function r2Put(key, body, contentType) {
  const cfg = r2Config();
  if (!cfg) throw new Error("Cloudflare R2 isn't set up.");
  const res = await aws(cfg).fetch(objectUrl(cfg, key), { method: "PUT", body, headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" } });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status})`);
}

export async function r2Get(key) {
  const cfg = r2Config();
  if (!cfg || !SAFE_KEY.test(key)) return null;
  const res = await aws(cfg).fetch(objectUrl(cfg, key), { method: "GET" });
  return res.ok ? res : null;
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
  if (!cfg) return { ready: false, note: "Not set up (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in Vercel)" };
  try {
    const res = await aws(cfg).fetch(`${cfg.endpoint}/${cfg.bucket}?list-type=2&max-keys=1`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) return { ready: true, note: `Connected to bucket ${cfg.bucket}` };
    if (res.status === 403 || res.status === 401) return { ready: false, note: "Cloudflare refused the key. Check R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY, and that the token has Object Read & Write on this bucket." };
    if (res.status === 404) return { ready: false, note: `Bucket "${cfg.bucket}" wasn't found. Check R2_BUCKET and R2_ACCOUNT_ID.` };
    return { ready: false, note: `Cloudflare answered ${res.status}` };
  } catch (e) { return { ready: false, note: `Couldn't reach Cloudflare: ${String(e?.message || e).slice(0, 80)}` }; }
}
