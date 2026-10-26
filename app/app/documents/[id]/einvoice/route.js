import { requireBusiness } from "@/lib/context";
import { getDocument } from "@/lib/documents";
import { ubl } from "@/lib/einvoice";

// GET /app/documents/<id>/einvoice → the invoice as a UBL (BIS Billing 3.0) XML file
export async function GET(_request, { params }) {
  const { id } = await params;
  const ctx = await requireBusiness();
  const full = await getDocument(ctx, id);
  if (!full || full.doc.kind !== "invoice") return new Response("Not found", { status: 404 });
  const xml = ubl({ doc: full.doc, items: full.items, business: ctx.business });
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${full.doc.number.replace(/[^\w.-]+/g, "_")}-einvoice.xml"`, "Cache-Control": "no-store" } });
}
