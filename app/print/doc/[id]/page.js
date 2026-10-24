import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/context";
import { documentModel, printablePapers } from "@/lib/pdf-response";
import { DocPrint } from "@/components/doc-print";

export const metadata = { title: "Print", robots: { index: false } };

// team print view: signed in, same business only
export default async function PrintDocument({ params, searchParams }) {
  const { id } = await params;
  const { paper, auto } = await searchParams;
  const ctx = await requireBusiness();
  const { data: doc } = await ctx.supabase.from("documents").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!doc) notFound();
  const model = await documentModel(ctx.supabase, doc, { paper });
  return <DocPrint model={model} papers={printablePapers(doc.kind, model.template)} basePath={`/print/doc/${id}`}
    pdfHref={`/app/documents/${id}/pdf?download&paper=${model.paper}`} backHref={`/app/documents/${id}`} autoPrint={auto === "1"} />;
}
