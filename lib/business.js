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
  const want = (list) => list.filter((f) => !new RegExp(`\\b${f}\\b`).test(fields)).concat("plans(price_minor)").join(", ");
  const first = await client.from("businesses").select(`${fields}, ${SIGNATURE_FIELDS}, ${want(["subscription_status", "current_period_end", "trial_ends_at", "postcode", "postcode_area"])}`).eq("id", id).single();
  if (!first.error) return first;
  // before the postcode SQL has run
  const noPostcode = await client.from("businesses").select(`${fields}, ${SIGNATURE_FIELDS}, ${want(["subscription_status", "current_period_end", "trial_ends_at"])}`).eq("id", id).single();
  if (!noPostcode.error) return noPostcode;
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
  // tax rates: 0–100 with up to three decimals (Québec QST is 9.975%)
  for (const k of ["tax_rate", "tax2_rate"]) {
    if (has(k)) { const r = Number(text(form, k) || 0); if (Number.isFinite(r) && r >= 0 && r <= 100) out[k] = Math.round(r * 1000) / 1000; }
  }
  if (has("tax2_label")) out.tax2_label = text(form, "tax2_label", 30);
  if (has("region")) out.region = text(form, "region", 6).toUpperCase().replace(/[^A-Z]/g, "");
  for (const k of ["quote_validity_days", "invoice_due_days"]) {
    if (has(k)) { const n = parseInt(text(form, k), 10); if (Number.isFinite(n) && n >= 0 && n <= 365) out[k] = n; }
  }
  for (const k of ["quote_prefix", "invoice_prefix", "receipt_prefix"]) {
    if (has(k)) { const p = text(form, k).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); if (p) out[k] = p; }
  }
  if (keys.includes("require_approval")) out.require_approval = form.get("require_approval") === "on";
  return out;
}

// the second tax and region need the tax SQL (RUN_NEW_2026-10-27d); until it
// has run, leave them out so saving still works. Returns an error when the
// owner set a second tax that can't be saved yet.
export function dropTax2IfNotReady(fields, business) {
  if ("tax2_rate" in (business || {})) return null;
  const wanted = Number(fields.tax2_rate) > 0;
  delete fields.tax2_label; delete fields.tax2_rate; delete fields.region;
  return wanted ? { error: "A second tax needs a quick database update first. Ask the platform admin to run the latest SQL, then try again." } : null;
}
