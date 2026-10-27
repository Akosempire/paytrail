import "server-only";
import { CURRENCIES } from "@/lib/money";
import { MAX_IMAGE_BYTES, r2Put, r2Ready } from "@/lib/storage";

const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// Uploads a logo or signature: to Cloudflare R2 when it's set up
// ("r2:<business_id>/<kind>-<time>.<ext>"), otherwise to Supabase Storage's
// public "logos" bucket as before. The pickers resize in the browser, so
// files are normally well under the 1 MB limit.
async function uploadImage(supabase, businessId, file, kind) {
  if (!file || typeof file === "string" || !file.size) return { path: null };
  if (!LOGO_TYPES[file.type]) return { error: `Upload your ${kind} as an image (PNG, JPG, SVG, WebP or a photo).` };
  if (file.size > MAX_IMAGE_BYTES) return { error: `That ${kind} is over 1 MB even after resizing. Try a simpler image.` };
  const name = `${businessId}/${kind}-${Date.now()}.${LOGO_TYPES[file.type]}`;
  if (await r2Ready()) {
    try { await r2Put(name, new Uint8Array(await file.arrayBuffer()), file.type); return { path: `r2:${name}` }; }
    catch (e) { console.error("storage.r2_upload_failed", { message: e?.message }); return { error: `The ${kind} could not be uploaded: ${e?.message || "unknown problem"}. Try again.` }; }
  }
  const { error } = await supabase.storage.from("logos").upload(name, file, { contentType: file.type, upsert: true });
  if (error) return { error: `The ${kind} could not be uploaded. Try a smaller image.` };
  return { path: name };
}
export const uploadLogo = (supabase, businessId, file) => uploadImage(supabase, businessId, file, "logo");
export const uploadSignature = (supabase, businessId, file) => uploadImage(supabase, businessId, file, "signature");

// Business branding plus the signature columns. Until the signature SQL has
// been run those columns don't exist; then this quietly loads without them,
// so documents keep working either way.
export const SIGNATURE_FIELDS = "signature_path, signatory_name, signatory_title";
export async function selectBusiness(client, id, fields) {
  // plus what's needed to know if the business is on the free tier
  const extra = ["subscription_status", "current_period_end", "trial_ends_at"].filter((f) => !new RegExp(`\\b${f}\\b`).test(fields)).concat("plans(price_minor)").join(", ");
  const first = await client.from("businesses").select(`${fields}, ${SIGNATURE_FIELDS}, ${extra}`).eq("id", id).single();
  if (!first.error) return first;
  const second = await client.from("businesses").select(`${fields}, ${SIGNATURE_FIELDS}`).eq("id", id).single();
  if (second.error && /signat/i.test(second.error.message || "")) return client.from("businesses").select(fields).eq("id", id).single();
  return second;
}

const text = (form, key, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);

// fields an owner or manager can edit, read from a form
export function businessFieldsFrom(form, keys) {
  const out = {};
  const has = (k) => keys.includes(k) && form.has(k);
  for (const k of ["name", "legal_name", "email", "phone", "website", "city", "country", "tax_id", "tax_label", "bank_name", "bank_account_name", "bank_account_number", "signatory_name", "signatory_title"]) {
    if (has(k)) out[k] = text(form, k, ["name", "signatory_name", "signatory_title"].includes(k) ? 120 : 200);
  }
  for (const k of ["address", "default_terms", "footer_note"]) if (has(k)) out[k] = text(form, k, 2000);
  if (has("brand_color")) {
    const color = text(form, "brand_color").toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(color)) out.brand_color = color;
  }
  if (has("currency")) {
    const c = text(form, "currency").toUpperCase();
    if (CURRENCIES.includes(c)) out.currency = c;
  }
  if (has("tax_rate")) {
    const r = Number(text(form, "tax_rate") || 0);
    if (Number.isFinite(r) && r >= 0 && r <= 100) out.tax_rate = Math.round(r * 100) / 100;
  }
  for (const k of ["quote_validity_days", "invoice_due_days"]) {
    if (has(k)) { const n = parseInt(text(form, k), 10); if (Number.isFinite(n) && n >= 0 && n <= 365) out[k] = n; }
  }
  for (const k of ["quote_prefix", "invoice_prefix", "receipt_prefix"]) {
    if (has(k)) { const p = text(form, k).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); if (p) out[k] = p; }
  }
  if (keys.includes("require_approval")) out.require_approval = form.get("require_approval") === "on";
  return out;
}
