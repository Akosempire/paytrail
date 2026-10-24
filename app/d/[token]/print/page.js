import { notFound } from "next/navigation";
import { createSupabaseService } from "@/lib/supabase/server";
import { documentModel, printablePapers } from "@/lib/pdf-response";
import { DocPrint } from "@/components/doc-print";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print", robots: { index: false, follow: false } };

// customer print view: authorised by the document's secret link, like /d/[token]
export default async function PrintShared({ params, searchParams }) {
  const { token } = await params;
  const { paper, auto } = await searchParams;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const service = createSupabaseService();
  const { data: doc } = await service.from("documents").select("*").eq("access_token", token).maybeSingle();
  if (!doc || ["draft", "pending_approval"].includes(doc.status)) notFound();
  const model = await documentModel(service, doc, { paper });
  return <DocPrint model={model} papers={printablePapers(doc.kind, model.template)} basePath={`/d/${token}/print`}
    pdfHref={`/d/${token}/pdf?download&paper=${model.paper}`} backHref={`/d/${token}`} autoPrint={auto === "1"} />;
}
