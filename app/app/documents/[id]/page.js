import { ShowToast } from "@/components/show-toast";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, EyeOff, Printer, Link2, Receipt, Wallet, History, ExternalLink, MessageCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { getDocument } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { emailConfigured } from "@/lib/email";
import { formatMoney, marginOf } from "@/lib/money";
import { COST_CATEGORIES, PAYMENT_METHODS, formatDate, timeAgo } from "@/lib/format";
import { Button, Callout, Card, CardHeader, cx } from "@/components/ui";
import { CopyButton } from "@/components/ui-client";
import { DocumentLayoutEditor } from "@/components/document-layout-editor";
import { payLinkFor } from "@/lib/pdf-response";
import { DocumentActions } from "@/components/document-actions";
import { StatusBadge, activityText } from "@/components/doc-bits";
import { DocumentFiles } from "@/components/document-files";
import { PaymentClaims } from "@/components/payment-claims";
import { r2Ready } from "@/lib/storage";
import { readyTemplates } from "@/lib/templates-ready";

// files attached to this document (null when the table isn't installed yet)
async function filesFor(ctx, documentId) {
  const { data, error } = await ctx.supabase.from("document_files").select("id, name, content_type, size_bytes, shared, uploaded_by, uploaded_by_name, created_at")
    .eq("document_id", documentId).order("created_at");
  return error ? null : data.map((f) => ({ ...f, when: timeAgo(f.created_at) }));
}

export async function generateMetadata({ params }) {
  return { title: "Document" };
}

export default async function DocumentPage({ params, searchParams }) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, requireBusiness()]);
  const full = await getDocument(ctx, id);
  if (!full) notFound();
  const { doc, items, costs, payments, receipts, activity, related, link } = full;
  const quote = doc.kind === "quote";
  const money = (v) => formatMoney(v, doc.currency);
  const balance = doc.total_minor - doc.amount_paid_minor;
  const draft = ["draft", "pending_approval"].includes(doc.status);
  const showCosts = costs !== null;
  const costTotal = (costs || []).reduce((s, c) => s + Number(c.amount_minor), 0);
  const revenue = doc.subtotal_minor - doc.discount_minor;
  const { profit, pct } = marginOf(revenue, costTotal);
  const source = related.find((r) => r.id === doc.source_quote_id);
  const converted = related.find((r) => r.id === doc.converted_invoice_id);
  const whatsapp = `https://wa.me/${(doc.customer_phone || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hello ${doc.customer_name.split(" ")[0] || ""}, here is ${quote ? "our quotation" : "your invoice"} ${doc.number} from ${ctx.business.name} for ${money(quote ? doc.total_minor : balance)}: ${link}`)}`;
  const lastReturn = activity.find((a) => a.action === "document.returned");
  const payLink = await payLinkFor(ctx.supabase, doc, full.connections);
  const canEditLayout = draft || can(ctx.member, "documents.send");
  const files = await filesFor(ctx, doc.id);
  // customers who said "I've sent it" (empty until the payment claims SQL is run)
  const { data: claimRows } = await ctx.supabase.from("payment_claims").select("id, amount_minor, payer_name, paid_on, note, file_id, created_at")
    .eq("document_id", doc.id).eq("status", "pending").order("created_at");
  const claims = (claimRows || []).map((c) => ({ ...c, amountLabel: money(c.amount_minor), paidLabel: formatDate(c.paid_on, { day: "numeric", month: "short" }), when: timeAgo(c.created_at) }));
  const storageOn = await r2Ready();
  const extraTemplates = await readyTemplates(ctx.supabase);

  return (
    <div className="flex flex-col gap-6">
      <Link href={quote ? "/app/quotes" : "/app/invoices"} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" />{quote ? "Quotes" : "Invoices"}
      </Link>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title-1 text-ink">{doc.number}</h1>
            <StatusBadge doc={doc} />
          </div>
          <p className="mt-1 text-sm text-ink-2">{doc.title || (quote ? "Quotation" : "Invoice")} · {doc.customer_name}{doc.customer_company ? `, ${doc.customer_company}` : ""}</p>
        </div>
        <DocumentActions doc={doc} balance={balance} emailReady={await emailConfigured()} link={link} printHref={`/print/doc/${doc.id}`} pdfHref={`/app/documents/${doc.id}/pdf?download`}
          perms={{ canSend: can(ctx.member, "documents.send"), needsApproval: ctx.member.role === "junior_finance" && ctx.business.require_approval, canApprove: can(ctx.member, "documents.approve"),
            canRecord: can(ctx.member, "payments.record"), canConvert: can(ctx.member, "documents.convert"), canVoid: can(ctx.member, "documents.void") }} />
      </div>

      {sp.converted && <ShowToast title="Invoice created from the quote" message="Items and hidden costs were copied across. It's ready to share with your customer." clear={["converted"]} />}
      {sp.sent && <ShowToast title={`${quote ? "Quote" : "Invoice"} sent`} message={`Your customer can open it from the link, ${quote ? "accept it and pay" : "and pay online"}.`} clear={["sent"]} />}
      <PaymentClaims claims={claims} documentId={doc.id} currency={doc.currency} canConfirm={can(ctx.member, "payments.record")} />
      {doc.status === "pending_approval" && <Callout tone="violet" icon={ShieldCheck} title="Waiting for approval">{can(ctx.member, "documents.approve") ? "Check it, then approve & send, or return it with a note." : "A manager or finance officer will review it before it goes to the customer."}</Callout>}
      {doc.status === "draft" && lastReturn && <Callout tone="warn" title="Returned for changes">{lastReturn.actor_label}: "{lastReturn.detail?.reason || "Please review."}"</Callout>}
      {doc.status === "declined" && <Callout tone="danger" title="Your customer declined this quote">{doc.decline_reason ? `"${doc.decline_reason}"` : "No reason given."}</Callout>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <DocumentLayoutEditor doc={doc} items={items.map(({ description, details, quantity, unit_price_minor }) => ({ description, details, quantity, unit_price_minor }))}
            business={ctx.business} payLink={payLink} canEdit={canEditLayout} canSetDefault={can(ctx.member, "settings.business")}
            printHref={`/print/doc/${doc.id}`} pdfHref={`/app/documents/${doc.id}/pdf?download`} extraTemplates={extraTemplates} />
        </div>

        <aside className="flex flex-col gap-4">
          {!draft && doc.status !== "void" && (
            <Card>
              <CardHeader title="Customer link" icon={Link2} description={doc.viewed_at ? `Opened ${timeAgo(doc.viewed_at)}` : "Not opened yet"} />
              <div className="flex flex-col gap-3 p-5">
                <p className="truncate rounded-md bg-subtle px-3 py-2 font-mono text-[12px] text-ink-2 ring-1 ring-inset ring-line">{link}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={link} label="Copy link" />
                  <Button size="sm" href={whatsapp} icon={MessageCircle}>WhatsApp</Button>
                  <Button size="sm" variant="ghost" href={link} icon={ExternalLink}>Open</Button>
                </div>
              </div>
            </Card>
          )}

          {showCosts && (
            <Card>
              <div className="flex items-start gap-3 border-b border-line bg-violet-soft/60 px-5 py-4">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-violet/30"><EyeOff className="size-4 text-violet" /></span>
                <div><h3 className="text-title-3 text-ink">Costs & profit</h3><p className="text-[12.5px] text-ink-2">Only your team sees this.</p></div>
              </div>
              {costs.length ? (
                <ul className="divide-y divide-line">
                  {costs.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                      <span className="min-w-0"><span className="block truncate text-ink">{c.label}</span><span className="text-xs text-ink-3">{COST_CATEGORIES[c.category]}</span></span>
                      <span className="shrink-0 text-ink tabular">{money(c.amount_minor)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-5 py-4 text-[13px] text-ink-3">No costs added. {draft && <Link className="font-medium text-brand-ink" href={`/app/documents/${doc.id}/edit`}>Add some</Link>}</p>}
              <dl className="space-y-1.5 border-t border-line bg-subtle px-5 py-4 text-[13px]">
                <div className="flex justify-between"><dt className="text-ink-2">Revenue (before tax)</dt><dd className="tabular">{money(revenue)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-2">Costs</dt><dd className="tabular">− {money(costTotal)}</dd></div>
                <div className="flex justify-between border-t border-line pt-2"><dt className="font-semibold text-ink">Profit</dt>
                  <dd className={cx("font-semibold tabular", profit < 0 ? "text-danger-ink" : "text-success-ink")}>{money(profit)} {revenue > 0 && <span className="font-normal text-ink-3">({pct.toFixed(0)}%)</span>}</dd></div>
              </dl>
            </Card>
          )}

          {(!quote || payments.length > 0) && !draft && (
            <Card>
              <CardHeader title="Payments & receipts" icon={Wallet} description={doc.status === "paid" ? `Paid in full ${doc.paid_at ? formatDate(doc.paid_at) : ""}` : `${money(balance)} outstanding`} />
              {payments.length ? (
                <ul className="divide-y divide-line">
                  {payments.map((p) => {
                    const r = receipts.find((x) => x.payment_id === p.id);
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                        <span className="min-w-0">
                          <span className="block font-medium text-ink tabular">{money(p.amount_minor)}</span>
                          <span className="text-xs text-ink-3">{PAYMENT_METHODS[p.method]} · {formatDate(p.paid_at)}</span>
                        </span>
                        {r && <span className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" icon={Receipt} href={`/r/${r.access_token}`}>{r.number}</Button>
                          <Button size="sm" variant="ghost" icon={Printer} href={`/print/receipt/${r.id}`} aria-label={`Print receipt ${r.number}`} className="!px-2" />
                        </span>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="px-5 py-4 text-[13px] text-ink-3">No payments yet. Online payments appear here automatically.</p>}
            </Card>
          )}

          {(source || converted) && (
            <Card className="p-4">
              {source && <Link href={`/app/documents/${source.id}`} className="flex items-center justify-between text-[13px] font-medium text-ink hover:text-brand-ink">From quote {source.number}<ArrowRight className="size-4" /></Link>}
              {converted && <Link href={`/app/documents/${converted.id}`} className="flex items-center justify-between text-[13px] font-medium text-ink hover:text-brand-ink">Invoice {converted.number}<ArrowRight className="size-4" /></Link>}
            </Card>
          )}

          <DocumentFiles documentId={doc.id} files={files || []} userId={ctx.user.id}
            canAdd={can(ctx.member, "documents.create")} canShare={can(ctx.member, "documents.send")}
            ready={storageOn && files !== null}
            problem={!storageOn ? "File storage isn't connected yet. Once Cloudflare R2 is set up, you can attach files here." : "Attachments need a quick database update. Ask the Usetally team to run the latest SQL."} />

          <Card>
            <CardHeader title="Activity" icon={History} />
            <ol className="space-y-3.5 px-5 py-4">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 text-[13px]">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-line-strong" />
                  <span className="min-w-0">
                    <span className="text-ink"><strong className="font-medium">{a.actor_label || "Customer"}</strong> {activityText(a)}{a.detail?.amount_minor ? ` — ${money(a.detail.amount_minor)}` : ""}{a.detail?.name ? `: ${a.detail.name}` : ""}</span>
                    <span className="block text-xs text-ink-3">{timeAgo(a.created_at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
