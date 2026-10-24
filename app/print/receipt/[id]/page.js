import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/context";
import { printablePapers, receiptModel } from "@/lib/pdf-response";
import { DocPrint } from "@/components/doc-print";

export const metadata = { title: "Print receipt", robots: { index: false } };

export default async function PrintReceipt({ params, searchParams }) {
  const { id } = await params;
  const { paper, auto } = await searchParams;
  const ctx = await requireBusiness();
  const { data: receipt } = await ctx.supabase.from("receipts").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!receipt) notFound();
  const { model, doc } = await receiptModel(ctx.supabase, receipt, { paper });
  return <DocPrint model={model} papers={printablePapers("receipt", model.template)} basePath={`/print/receipt/${id}`}
    pdfHref={`/app/receipts/${id}/pdf?download&paper=${model.paper}`} backHref={`/app/documents/${doc.id}`} autoPrint={auto === "1"} />;
}
