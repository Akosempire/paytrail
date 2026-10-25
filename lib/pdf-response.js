import "server-only";
import { renderPdf } from "@/lib/pdf";
import { buildModel } from "@/lib/doc-model";
import { fits, PAPERS, resolveLayout } from "@/lib/doc-templates";
import { siteUrl } from "@/lib/site";
import { selectBusiness } from "@/lib/business";
import { testPaymentsAllowed } from "@/lib/payments";

// Loads what a renderer needs for one document or receipt. `client` is the
// signed-in user's Supabase client (team) or the service client (customer
// links, already authorised by their access token). Never reads hidden costs.

export const BUSINESS_FIELDS = "id, name, legal_name, email, phone, website, address, city, country, tax_id, logo_path, brand_color, footer_note, bank_name, bank_account_name, bank_account_number, document_prefs";

// pass the business's payment_connections rows if you already have them, to skip a query
export async function payLinkFor(client, doc, connections) {
  if (doc.kind === "quote" ? !["sent", "viewed", "accepted"].includes(doc.status) : !["sent", "viewed", "partially_paid"].includes(doc.status)) return null;
  const data = connections || (await client.from("payment_connections").select("provider, mode, payment_confirmed_at, webhook_confirmed_at, enabled").eq("business_id", doc.business_id)).data;
  const online = (data || []).some((c) => c.enabled && c.payment_confirmed_at && c.webhook_confirmed_at && (c.mode === "live" || testPaymentsAllowed()));
  return online ? `${siteUrl()}/d/${doc.access_token}` : null;
}

// a paper size asked for in the URL, if it suits the document's template
export function paperOverride(kind, template, requested) {
  if (!requested || !PAPERS[requested]) return null;
  if (fits(kind, template, requested)) return { paper: requested };
  // thermal sizes switch to the POS template; sheet sizes switch away from it
  if (PAPERS[requested].thermal && fits(kind, "pos", requested)) return { template: "pos", paper: requested };
  if (!PAPERS[requested].thermal && template === "pos" && fits(kind, "signature", requested)) return { template: "signature", paper: requested };
  return null;
}

export async function documentModel(client, doc, { paper } = {}) {
  const [{ data: items }, { data: business }, payLink] = await Promise.all([
    client.from("document_items").select("description, details, quantity, unit_price_minor").eq("document_id", doc.id).order("sort_order"),
    selectBusiness(client, doc.business_id, BUSINESS_FIELDS),
    payLinkFor(client, doc),
  ]);
  const template = resolveLayout({ kind: doc.kind, template: doc.template, paper: doc.paper, layout: doc.layout }, business).template;
  const override = paperOverride(doc.kind, template, paper) || {};
  return buildModel({ doc, items: items || [], business, payLink, override });
}

export async function receiptModel(client, receipt, { paper } = {}) {
  const [{ data: payment }, { data: doc }, { data: business }] = await Promise.all([
    client.from("payments").select("method, reference, paid_at, amount_minor").eq("id", receipt.payment_id).single(),
    client.from("documents").select("*").eq("id", receipt.document_id).single(),
    selectBusiness(client, receipt.business_id, BUSINESS_FIELDS),
  ]);
  const { data: items } = await client.from("document_items").select("description, details, quantity, unit_price_minor").eq("document_id", doc.id).order("sort_order");
  const template = resolveLayout({ kind: "receipt", template: receipt.template, paper: receipt.paper }, business).template;
  const override = paperOverride("receipt", template, paper) || {};
  return { model: buildModel({ doc, items: items || [], business, receipt, payment, override }), doc, business };
}

function pdfResponse(bytes, filename, download) {
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function documentPdf(client, doc, request) {
  const url = request ? new URL(request.url) : null;
  const model = await documentModel(client, doc, { paper: url?.searchParams.get("paper") });
  return pdfResponse(await renderPdf(model), `${doc.number}.pdf`, url?.searchParams.has("download"));
}

export async function receiptPdf(client, receipt, request) {
  const url = request ? new URL(request.url) : null;
  const { model } = await receiptModel(client, receipt, { paper: url?.searchParams.get("paper") });
  return pdfResponse(await renderPdf(model), `${receipt.number}.pdf`, url?.searchParams.has("download"));
}

// paper sizes offered on a print page for this document and template
export function printablePapers(kind, template) {
  return Object.keys(PAPERS).filter((p) => fits(kind, template, p) || paperOverride(kind, template, p));
}
