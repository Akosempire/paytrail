import "server-only";
import { CURRENCIES } from "@/lib/money";

const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// uploads to the public "logos" bucket as <business_id>/logo-<time>.<ext>;
// the storage policy only lets owners and managers of that business write there
export async function uploadLogo(supabase, businessId, file) {
  if (!file || typeof file === "string" || !file.size) return { path: null };
  // the logo picker resizes in the browser, so uploads are normally small PNG/JPGs
  if (!LOGO_TYPES[file.type]) return { error: "Upload your logo as an image (PNG, JPG, SVG, WebP or a photo)." };
  if (file.size > 2.5 * 1024 * 1024) return { error: "That logo is still too large. Try a smaller image." };
  const path = `${businessId}/logo-${Date.now()}.${LOGO_TYPES[file.type]}`;
  const { error } = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: true });
  if (error) return { error: "The logo could not be uploaded. Try a smaller image." };
  return { path };
}

const text = (form, key, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);

// fields an owner or manager can edit, read from a form
export function businessFieldsFrom(form, keys) {
  const out = {};
  const has = (k) => keys.includes(k) && form.has(k);
  for (const k of ["name", "legal_name", "email", "phone", "website", "city", "country", "tax_id", "tax_label", "bank_name", "bank_account_name", "bank_account_number"]) {
    if (has(k)) out[k] = text(form, k, k === "name" ? 120 : 200);
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
