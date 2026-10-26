import { getContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { emailConfigured } from "@/lib/email";

// Everything the offline app needs for this business, for this person (row-level
// security applies: hidden costs only for people allowed to see them). Saved on
// the device and refreshed whenever the app is online.
export const dynamic = "force-dynamic";

const BUSINESS_KEYS = ["id", "name", "kind", "legal_name", "email", "phone", "website", "address", "city", "country", "tax_id", "logo_path", "brand_color", "footer_note",
  "bank_name", "bank_account_name", "bank_account_number", "currency", "tax_rate", "tax_label", "default_terms", "quote_validity_days", "invoice_due_days", "require_approval",
  "document_prefs", "signature_path", "signatory_name", "signatory_title", "quote_prefix", "invoice_prefix", "receipt_prefix"];

export async function GET() {
  const ctx = await getContext().catch(() => null);
  if (!ctx?.user || !ctx.business) return Response.json({ error: "signed_out" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const b = ctx.business, sb = ctx.supabase, showCosts = can(ctx.member, "costs.view");
  const docs = await sb.from("documents").select("*").eq("business_id", b.id).order("created_at", { ascending: false }).limit(1500);
  const ids = (docs.data || []).map((d) => d.id);
  const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const byDocs = async (table, select, order) => (await Promise.all(chunks(ids, 200).map((c) => sb.from(table).select(select).in("document_id", c).order(order)))).flatMap((r) => r.data || []);
  const [items, costs, customers, payments, receipts, presets] = await Promise.all([
    byDocs("document_items", "*", "sort_order"),
    showCosts ? byDocs("document_costs", "id, document_id, label, category, amount_minor, note, sort_order", "sort_order") : Promise.resolve([]),
    sb.from("customers").select("id, name, company, email, phone, address, notes, archived_at, created_at, updated_at").eq("business_id", b.id).order("name").limit(3000),
    sb.from("payments").select("id, document_id, method, reference, amount_minor, currency, paid_at, note, created_at").eq("business_id", b.id).order("paid_at", { ascending: false }).limit(3000),
    sb.from("receipts").select("id, document_id, payment_id, number, amount_minor, currency, balance_after_minor, issued_at, access_token").eq("business_id", b.id).order("issued_at", { ascending: false }).limit(3000),
    showCosts ? sb.from("cost_presets").select("*").eq("business_id", b.id).order("label") : Promise.resolve({ data: [] }),
  ]);
  const business = Object.fromEntries(BUSINESS_KEYS.filter((k) => k in b).map((k) => [k, b[k]]));
  return Response.json({
    v: 1, at: new Date().toISOString(), userId: ctx.user.id,
    business, member: { role: ctx.member.role, name: ctx.member.full_name || ctx.user.email },
    perms: { costs: showCosts, send: can(ctx.member, "documents.send"), payments: can(ctx.member, "payments.record"), approval: ctx.member.role === "junior_finance" && Boolean(b.require_approval) },
    emailReady: await emailConfigured(),
    documents: docs.data || [], items, costs, customers: customers.data || [], payments: payments.data || [], receipts: receipts.data || [], presets: presets.data || [],
  }, { headers: { "Cache-Control": "no-store" } });
}
