import { notFound } from "next/navigation";
import { CheckCircle2, Download, Printer } from "lucide-react";
import { createSupabaseService } from "@/lib/supabase/server";
import { receiptModel } from "@/lib/pdf-response";
import { Button, Logo } from "@/components/ui";
import { DocPreview } from "@/components/doc-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receipt", robots: { index: false, follow: false } };

// A receipt only exists after a payment was verified with the provider (or
// recorded by the business), so this page never shows a pending payment.
export default async function ReceiptPage({ params }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const service = createSupabaseService();
  const { data: receipt } = await service.from("receipts").select("*").eq("access_token", token).maybeSingle();
  if (!receipt) notFound();
  const { model, doc } = await receiptModel(service, receipt);
  return (
    <div className="min-h-dvh bg-[#f5f7fa] px-4 py-8 text-[#101828] sm:py-12" data-theme="light" style={{ colorScheme: "light" }}>
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-[#067647]"><CheckCircle2 className="size-4" />{model.receipt.fullyPaid ? "Paid in full" : "Part payment received"} · {model.receipt.amount}</p>
          <div className="flex flex-wrap gap-2">
            <Button href={`/r/${token}/print`} size="sm" icon={Printer}>Print</Button>
            <a href={`/r/${token}/pdf?download`} className="inline-flex h-8 items-center gap-2 rounded-sm bg-white px-3 text-[13px] font-medium shadow-[var(--shadow-xs)] ring-1 ring-inset ring-[#d0d5dd] hover:bg-[#f9fafb]"><Download className="size-3.5" />PDF</a>
            <Button href={`/d/${doc.access_token}`} size="sm" variant="ghost">View {doc.kind}</Button>
          </div>
        </div>
        <div className="rounded-2xl bg-[#eceeef] p-2 sm:p-4">
          <DocPreview model={model} label={`Receipt ${model.number}`} />
        </div>
        <p className="flex items-center justify-center gap-1.5 text-xs text-[#98a2b3]"><Logo className="size-4" />Issued with Usetally · <a href="/privacy" className="underline underline-offset-2 hover:text-[#667085]">Privacy</a></p>
      </div>
    </div>
  );
}
