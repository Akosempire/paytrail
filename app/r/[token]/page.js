import { notFound } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";
import { createSupabaseService } from "@/lib/supabase/server";
import { logoUrl } from "@/lib/site";
import { formatMoney } from "@/lib/money";
import { formatDate, PAYMENT_METHODS } from "@/lib/format";
import { Button, Logo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receipt", robots: { index: false, follow: false } };

export default async function ReceiptPage({ params }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const service = createSupabaseService();
  const { data: receipt } = await service.from("receipts").select("*").eq("access_token", token).maybeSingle();
  if (!receipt) notFound();
  const [{ data: payment }, { data: doc }, { data: business }] = await Promise.all([
    service.from("payments").select("method, reference, paid_at").eq("id", receipt.payment_id).single(),
    service.from("documents").select("kind, number, title, total_minor, customer_name, customer_company, access_token").eq("id", receipt.document_id).single(),
    service.from("businesses").select("name, logo_path, brand_color, email, phone, footer_note").eq("id", receipt.business_id).single(),
  ]);
  const logo = logoUrl(business.logo_path);
  const money = (v) => formatMoney(v, receipt.currency, { decimals: 2 });
  return (
    <div className="min-h-dvh bg-[#f5f7fa] px-4 py-8 text-[#101828] sm:py-14" style={{ "--doc-brand": business.brand_color }}>
      <div className="mx-auto max-w-lg">
        <article className="overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)] ring-1 ring-[#eaecf0]">
          <div className="h-1.5 doc-brand-bg" />
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? <img src={logo} alt={business.name} className="h-10 max-w-[160px] object-contain" /> : <p className="text-lg font-bold">{business.name}</p>}
              <div className="text-right"><p className="text-lg font-bold tracking-[0.06em] doc-brand-text">RECEIPT</p><p className="font-mono text-[13px] text-[#475467]">{receipt.number}</p></div>
            </div>
            <div className="mt-8 rounded-xl p-5 text-white doc-brand-bg">
              <p className="text-sm opacity-85">Amount received</p>
              <p className="mt-1 text-[32px] leading-10 font-bold tabular">{money(receipt.amount_minor)}</p>
              <p className="mt-1 text-sm opacity-85">from {doc.customer_company || doc.customer_name}</p>
            </div>
            <dl className="mt-6 divide-y divide-[#eaecf0] text-sm">
              {[["Paid on", formatDate(payment.paid_at, { day: "numeric", month: "long", year: "numeric" })], ["Method", PAYMENT_METHODS[payment.method]], payment.reference && ["Reference", payment.reference],
                ["For", `${doc.kind === "invoice" ? "Invoice" : "Quote"} ${doc.number}`], ["Invoice total", money(doc.total_minor)], ["Balance remaining", money(receipt.balance_after_minor)]].filter(Boolean).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-[#475467]">{k}</dt><dd className="text-right font-medium break-all">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-6 flex items-center gap-2 text-sm font-medium text-[#067647]"><CheckCircle2 className="size-4" />{Number(receipt.balance_after_minor) === 0 ? "Paid in full. Thank you!" : "Part payment received. Thank you!"}</p>
            {business.footer_note && <p className="mt-6 border-t border-[#eaecf0] pt-4 text-center text-xs text-[#98a2b3]">{business.footer_note}</p>}
          </div>
        </article>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button href={`/r/${token}/pdf`} icon={Download} target="_blank">Download PDF</Button>
          <Button href={`/d/${doc.access_token}`} variant="ghost">View {doc.kind}</Button>
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#98a2b3]"><Logo className="size-4" />Issued with PayTrail · <a href="/privacy" className="underline underline-offset-2 hover:text-[#667085]">Privacy</a></p>
      </div>
    </div>
  );
}
