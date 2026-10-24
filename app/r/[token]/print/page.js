import { notFound } from "next/navigation";
import { createSupabaseService } from "@/lib/supabase/server";
import { printablePapers, receiptModel } from "@/lib/pdf-response";
import { DocPrint } from "@/components/doc-print";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print receipt", robots: { index: false, follow: false } };

export default async function PrintSharedReceipt({ params, searchParams }) {
  const { token } = await params;
  const { paper, auto } = await searchParams;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const service = createSupabaseService();
  const { data: receipt } = await service.from("receipts").select("*").eq("access_token", token).maybeSingle();
  if (!receipt) notFound();
  const { model } = await receiptModel(service, receipt, { paper });
  return <DocPrint model={model} papers={printablePapers("receipt", model.template)} basePath={`/r/${token}/print`}
    pdfHref={`/r/${token}/pdf?download&paper=${model.paper}`} backHref={`/r/${token}`} autoPrint={auto === "1"} />;
}
