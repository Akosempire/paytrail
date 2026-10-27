import { ShowToast } from "@/components/show-toast";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { reconcileSoon } from "@/lib/payments";
import { CheckCircle2, Clock, Download, XCircle, Receipt, Ban, Printer, Paperclip } from "lucide-react";
import { formatSize } from "@/lib/file-types";
import { getPublicDocument } from "@/lib/documents";
import { createSupabaseService } from "@/lib/supabase/server";
import { logoUrl } from "@/lib/site";
import { formatMoney } from "@/lib/money";
import { formatDate, isExpired } from "@/lib/format";
import { Button, Logo } from "@/components/ui";
import { DocPreview } from "@/components/doc-preview";
import { buildModel } from "@/lib/doc-model";
import { CustomerPanel } from "./panel";
import { r2Ready } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { token } = await params;
  const found = await getPublicDocument(token).catch(() => null);
  if (!found) return { title: "Document", robots: { index: false } };
  const { doc, business } = found;
  return { title: `${doc.kind === "quote" ? "Quotation" : "Invoice"} ${doc.number} from ${business.name}`, robots: { index: false, follow: false } };
}

export default async function PublicDocument({ params, searchParams }) {
  const { token } = await params;
  const { payment } = await searchParams;
  const found = await getPublicDocument(token);
  if (!found) notFound();
  const { doc, items, business, receipts, providers, invoice } = found;
  // a customer coming back to their link is a good moment to re-check an unconfirmed payment
  after(() => reconcileSoon(`d:${doc.id}`, { businessId: doc.business_id }));

  // first open: sent → viewed, so the business sees it was read
  if (doc.status === "sent") {
    const service = createSupabaseService();
    const { data: changed } = await service.from("documents").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", doc.id).eq("status", "sent").select("id");
    if (changed?.length) {
      await service.from("activity").insert({ business_id: doc.business_id, document_id: doc.id, actor_label: doc.customer_name || "Customer", action: "document.viewed" });
      doc.status = "viewed";
    }
  }

  // files the business chose to show the customer (quote and its invoice)
  const { data: sharedFiles } = await createSupabaseService().from("document_files").select("id, name, size_bytes")
    .eq("shared", true).in("document_id", [doc.id, doc.converted_invoice_id].filter(Boolean)).order("created_at");

  const quote = doc.kind === "quote";
  const target = invoice || doc;
  // the customer's latest "I've sent it", so they can see where it stands
  const { data: lastClaim } = await createSupabaseService().from("payment_claims").select("status, amount_minor, paid_on, reply, created_at")
    .eq("document_id", target.id || doc.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    ;
  const storageOn = await r2Ready().catch(() => false);
  const balance = Number(target.total_minor) - Number(target.amount_paid_minor);
  const paid = target.status === "paid" || (quote && invoice?.status === "paid");
  const expired = isExpired(doc);
  const logo = logoUrl(business.logo_path);
  const money = (v) => formatMoney(v, doc.currency);

  let banner = null;
  if (payment === "succeeded" || (paid && payment)) banner = { tone: "success", icon: CheckCircle2, title: "Payment received", text: "Thank you! Your receipt is below." };
  else if (payment === "pending") banner = { tone: "info", icon: Clock, title: "Confirming your payment", text: "This usually takes a minute. Refresh this page shortly. You don't need to pay again." };
  else if (payment === "failed") banner = { tone: "danger", icon: XCircle, title: "The payment didn't go through", text: "No money was taken. You can try again or pay by bank transfer." };
  else if (payment === "cancelled") banner = { tone: "warn", icon: XCircle, title: "Payment cancelled", text: "You can try again whenever you're ready." };


  return (
    <div className="min-h-dvh bg-[#f5f7fa] text-[#101828]" data-theme="light" style={{ "--doc-brand": business.brand_color, colorScheme: "light" }}>
      <header className="no-print border-b border-[#eaecf0] bg-white">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt="" className="h-8 max-w-[120px] object-contain" /> : <span className="inline-flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white doc-brand-bg">{business.name[0]}</span>}
            <span className="truncate text-sm font-semibold">{business.name}</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button href={`/d/${token}/print`} size="sm" icon={Printer} className="max-sm:!px-2.5" aria-label="Print"><span className="max-sm:hidden">Print</span></Button>
            <a href={`/d/${token}/pdf?download`} className="inline-flex h-8 items-center gap-2 rounded-sm bg-white px-3 text-[13px] font-medium text-[#101828] shadow-[var(--shadow-xs)] ring-1 ring-inset ring-[#d0d5dd] hover:bg-[#f9fafb]"><Download className="size-3.5" />PDF</a>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-6 px-4 pt-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-10">
        <div className="flex min-w-0 flex-col gap-4">
          {banner && <ShowToast intent={{ success: "success", info: "info", danger: "error", warn: "warning" }[banner.tone]} title={banner.title} message={banner.text} clear={["payment"]} duration={banner.tone === "info" ? 9000 : undefined} />}
          {doc.status === "void" && <div className="flex gap-3 rounded-xl bg-[#f2f4f7] p-4 text-sm ring-1 ring-[#d0d5dd]"><Ban className="size-5 shrink-0 text-[#475467]" />This document has been cancelled by {business.name}.</div>}
          <div className="rounded-2xl bg-[#eceeef] p-2 sm:p-4">
            <DocPreview model={buildModel({ doc, items, business })} label={`${quote ? "Quotation" : "Invoice"} ${doc.number}`} />
          </div>
        </div>

        <aside id="respond" className="no-print flex scroll-mt-4 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <CustomerPanel
            token={token}
            doc={{ kind: doc.kind, status: doc.status, number: doc.number, customer_name: doc.customer_name, accepted_name: doc.accepted_name, valid_until: doc.valid_until }}
            amount={money(paid ? target.total_minor : balance)}
            paid={paid}
            expired={expired}
            providers={providers}
            hasBank={Boolean(business.bank_account_number)}
            bank={{ name: business.bank_name, number: business.bank_account_number, account: business.bank_account_name || business.name, reference: target.number || doc.number }}
            brandName={business.name}
            balance={paid ? 0 : balance}
            currency={doc.currency}
            claim={lastClaim && lastClaim.status !== "confirmed" && !paid ? { status: lastClaim.status, amount: money(lastClaim.amount_minor), date: formatDate(lastClaim.paid_on, { day: "numeric", month: "short" }), reply: lastClaim.reply } : null}
            proofUpload={storageOn}
            invoiceNumber={invoice?.number}
          />
          {receipts.length > 0 && (
            <div className="rounded-xl bg-white p-4 ring-1 ring-[#eaecf0]">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#98a2b3]">RECEIPTS</p>
              <ul className="space-y-1.5">
                {receipts.map((r) => (
                  <li key={r.number}>
                    <a href={`/r/${r.access_token}`} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-[#f8f9fb]">
                      <span className="flex items-center gap-2"><Receipt className="size-4 doc-brand-text" />{r.number}</span>
                      <span className="text-[#475467] tabular">{formatMoney(r.amount_minor, r.currency)} · {formatDate(r.issued_at, { day: "numeric", month: "short" })}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sharedFiles?.length > 0 && (
            <div className="rounded-xl bg-white p-4 ring-1 ring-[#eaecf0]">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[#98a2b3]">ATTACHED FILES</p>
              <ul className="space-y-1.5">
                {sharedFiles.map((f) => (
                  <li key={f.id}>
                    <a href={`/d/${token}/files/${f.id}`} target="_blank" rel="noopener" className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-[#f8f9fb]">
                      <span className="flex min-w-0 items-center gap-2"><Paperclip className="size-4 shrink-0 doc-brand-text" /><span className="truncate">{f.name}</span></span>
                      <span className="shrink-0 text-[#475467] tabular">{formatSize(f.size_bytes)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="flex items-center justify-center gap-1.5 text-xs text-[#98a2b3]"><Logo className="size-4" />Sent securely with Usetally · <a href="/privacy" className="underline underline-offset-2 hover:text-[#667085]">Privacy</a></p>
        </aside>
      </main>
      {(!paid && !["void", "declined"].includes(doc.status) && !(quote && expired && doc.status !== "accepted")) && (
        <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-[#eaecf0] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <a href="#respond" className="flex h-12 items-center justify-center gap-2 rounded-lg text-[15px] font-semibold text-white doc-brand-bg">
            {quote && doc.status !== "accepted" ? (providers.length ? `Accept & pay ${money(doc.total_minor)}` : `Accept · ${money(doc.total_minor)}`) : `Pay ${money(balance)}`}
          </a>
        </div>
      )}
    </div>
  );
}
