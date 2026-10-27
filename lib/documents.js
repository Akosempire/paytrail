import { selectBusiness } from "@/lib/business";
import "server-only";
import { can } from "@/lib/permissions";
import { createSupabaseService } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { testPaymentsAllowed } from "@/lib/payments";

const LIST_COLUMNS = "id, kind, number, title, customer_name, customer_company, currency, status, issue_date, due_date, valid_until, total_minor, amount_paid_minor, created_at, sent_at, converted_invoice_id";

export async function listDocuments(ctx, { kind, status, q, customerId, limit = 100 } = {}) {
  let query = ctx.supabase.from("documents").select(LIST_COLUMNS).eq("business_id", ctx.business.id).order("created_at", { ascending: false }).limit(limit);
  if (kind) query = query.eq("kind", kind);
  if (customerId) query = query.eq("customer_id", customerId);
  const today = new Date().toISOString().slice(0, 10);
  if (status === "overdue") query = query.in("status", ["sent", "viewed", "partially_paid"]).lt("due_date", today);
  else if (status === "open") query = query.in("status", kind === "quote" ? ["sent", "viewed"] : ["sent", "viewed", "partially_paid"]);
  else if (status === "drafts") query = query.in("status", ["draft", "pending_approval"]);
  else if (status) query = query.eq("status", status);
  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    if (term) query = query.or(`number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_company.ilike.%${term}%,title.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function documentCounts(ctx, kind) {
  const { data } = await ctx.supabase.from("documents").select("status, due_date").eq("business_id", ctx.business.id).eq("kind", kind);
  const today = new Date().toISOString().slice(0, 10);
  const rows = data || [];
  const open = kind === "quote" ? ["sent", "viewed"] : ["sent", "viewed", "partially_paid"];
  return {
    all: rows.length,
    drafts: rows.filter((r) => ["draft", "pending_approval"].includes(r.status)).length,
    open: rows.filter((r) => open.includes(r.status)).length,
    overdue: kind === "invoice" ? rows.filter((r) => open.includes(r.status) && r.due_date && r.due_date < today).length : 0,
    accepted: rows.filter((r) => r.status === "accepted").length,
    paid: rows.filter((r) => r.status === "paid").length,
  };
}

// a full document for the team, including hidden costs only when this member may see them
export async function getDocument(ctx, id) {
  // everything in one round trip; the child rows are discarded if the
  // document isn't in this business (row-level security guards them too)
  const showCosts = can(ctx.member, "costs.view");
  const none = "00000000-0000-0000-0000-000000000000";
  const [{ data: doc }, items, costs, payments, receipts, activity, connections] = await Promise.all([
    ctx.supabase.from("documents").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle(),
    ctx.supabase.from("document_items").select("*").eq("document_id", id).order("sort_order"),
    showCosts ? ctx.supabase.from("document_costs").select("*").eq("document_id", id).order("sort_order") : Promise.resolve({ data: null }),
    ctx.supabase.from("payments").select("*").eq("document_id", id).order("paid_at", { ascending: false }),
    ctx.supabase.from("receipts").select("*").eq("document_id", id).order("issued_at", { ascending: false }),
    ctx.supabase.from("activity").select("*").eq("document_id", id).order("created_at", { ascending: false }).limit(30),
    ctx.supabase.from("payment_connections").select("provider, mode, payment_confirmed_at, webhook_confirmed_at, enabled").eq("business_id", ctx.business.id),
  ]);
  if (!doc) return null;
  const related = doc.source_quote_id || doc.converted_invoice_id
    ? await ctx.supabase.from("documents").select("id, kind, number, status").or(`id.eq.${doc.source_quote_id || none},id.eq.${doc.converted_invoice_id || none}`)
    : { data: [] };
  return {
    doc,
    items: items.data || [],
    costs: costs.data,
    payments: payments.data || [],
    receipts: receipts.data || [],
    activity: activity.data || [],
    related: related.data || [],
    connections: connections.data || [],
    link: `${siteUrl()}/d/${doc.access_token}`,
  };
}

// customer view: never selects document_costs
export async function getPublicDocument(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token))) return null;
  const service = createSupabaseService();
  const { data: doc } = await service.from("documents").select("*").eq("access_token", token).maybeSingle();
  if (!doc || ["draft", "pending_approval"].includes(doc.status)) return null;
  const [{ data: items }, { data: business }, { data: receipts }, { data: connections }] = await Promise.all([
    service.from("document_items").select("*").eq("document_id", doc.id).order("sort_order"),
    selectBusiness(service, doc.business_id, "id, name, legal_name, email, phone, website, address, city, country, tax_id, logo_path, brand_color, footer_note, bank_name, bank_account_name, bank_account_number, subscription_status, document_prefs"),
    service.from("receipts").select("number, amount_minor, currency, issued_at, access_token, balance_after_minor").eq("document_id", doc.converted_invoice_id || doc.id).order("issued_at"),
    service.from("payment_connections").select("provider, mode, enabled, payment_confirmed_at, webhook_confirmed_at").eq("business_id", doc.business_id),
  ]);
  const providers = (connections || []).filter((c) => c.enabled && c.payment_confirmed_at && c.webhook_confirmed_at && (c.mode === "live" || testPaymentsAllowed())).map((c) => ({ provider: c.provider, mode: c.mode }));
  let invoice = null;
  if (doc.converted_invoice_id) {
    const { data } = await service.from("documents").select("id, number, status, total_minor, amount_paid_minor, access_token").eq("id", doc.converted_invoice_id).maybeSingle();
    invoice = data;
  }
  return { doc, items: items || [], business, receipts: receipts || [], providers, invoice, service };
}

// the payload save_document expects, built from the editor's JSON
export function cleanPayload(input) {
  const str = (v, max = 2000) => String(v ?? "").slice(0, max);
  const int = (v) => Math.max(0, Math.round(Number(v) || 0));
  const payload = {
    title: str(input.title, 200),
    issue_date: str(input.issue_date, 10) || null,
    due_date: str(input.due_date, 10),
    valid_until: str(input.valid_until, 10),
    discount_minor: int(input.discount_minor),
    tax_rate: Math.min(100, Math.max(0, Number(input.tax_rate) || 0)),
    tax_label: str(input.tax_label, 30),
    notes: str(input.notes),
    terms: str(input.terms),
    items: (input.items || []).slice(0, 200).map((i) => ({
      description: str(i.description, 300), details: str(i.details, 1000),
      quantity: Math.max(0.01, Math.round((Number(i.quantity) || 1) * 100) / 100), unit_price_minor: int(i.unit_price_minor),
      vat_category: ["zero", "exempt"].includes(i.vat_category) ? i.vat_category : "standard",
    })),
  };
  if (input.kind) payload.kind = input.kind === "invoice" ? "invoice" : "quote";
  if (input.prices_include_vat !== undefined) payload.prices_include_vat = Boolean(input.prices_include_vat);
  if (input.customer_id) payload.customer_id = str(input.customer_id, 36);
  else if (input.customer?.name) payload.customer = {
    name: str(input.customer.name, 120), company: str(input.customer.company, 120), email: str(input.customer.email, 200).toLowerCase(),
    phone: str(input.customer.phone, 40), address: str(input.customer.address, 500), postcode: str(input.customer.postcode, 20),
  };
  if (input.delivery) payload.delivery = { address: str(input.delivery.address, 500), postcode: str(input.delivery.postcode, 20), contact: str(input.delivery.contact, 160) };
  if (Array.isArray(input.costs)) payload.costs = input.costs.slice(0, 100).map((c) => ({
    label: str(c.label, 120), category: str(c.category, 20), amount_minor: int(c.amount_minor), note: str(c.note, 300),
  }));
  return payload;
}
