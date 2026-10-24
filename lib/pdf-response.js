import "server-only";
import { buildDocumentPdf, buildReceiptPdf } from "@/lib/pdf";
import { logoUrl, siteUrl } from "@/lib/site";
import { testPaymentsAllowed } from "@/lib/payments";

const BUSINESS_FIELDS = "id, name, legal_name, email, phone, website, address, city, country, tax_id, logo_path, brand_color, footer_note, bank_name, bank_account_name, bank_account_number";

function pdfResponse(bytes, filename, inline = true) {
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// client is either the signed-in user's Supabase client or the service client
export async function documentPdf(client, doc) {
  const [{ data: items }, { data: business }, { data: connections }] = await Promise.all([
    client.from("document_items").select("description, details, quantity, unit_price_minor").eq("document_id", doc.id).order("sort_order"),
    client.from("businesses").select(BUSINESS_FIELDS).eq("id", doc.business_id).single(),
    client.from("payment_connections").select("provider, mode, payment_confirmed_at, webhook_confirmed_at, enabled").eq("business_id", doc.business_id),
  ]);
  const online = (connections || []).some((c) => c.enabled && c.payment_confirmed_at && c.webhook_confirmed_at && (c.mode === "live" || testPaymentsAllowed()));
  const bytes = await buildDocumentPdf({ doc, items: items || [], business, logoUrl: logoUrl(business.logo_path), payLink: online ? `${siteUrl()}/d/${doc.access_token}` : null });
  return pdfResponse(bytes, `${doc.number}.pdf`);
}

export async function receiptPdf(client, receipt) {
  const [{ data: payment }, { data: doc }, { data: business }] = await Promise.all([
    client.from("payments").select("*").eq("id", receipt.payment_id).single(),
    client.from("documents").select("*").eq("id", receipt.document_id).single(),
    client.from("businesses").select(BUSINESS_FIELDS).eq("id", receipt.business_id).single(),
  ]);
  const bytes = await buildReceiptPdf({ receipt, payment, doc, business, logoUrl: logoUrl(business.logo_path) });
  return pdfResponse(bytes, `${receipt.number}.pdf`);
}
