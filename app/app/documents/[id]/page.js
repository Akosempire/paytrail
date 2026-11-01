import { ShowToast } from "@/components/show-toast";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, EyeOff, Printer, Receipt, Wallet, History, ArrowRight, ShieldCheck, Clock, CalendarClock, Repeat, ListChecks, CheckCircle2, Circle, ChevronDown, Sparkles } from "lucide-react";
import { after } from "next/server";
import { requireBusiness } from "@/lib/context";
import { getDocument } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { emailConfigured } from "@/lib/email";
import { formatMoney, marginOf } from "@/lib/money";
import { COST_CATEGORIES, PAYMENT_METHODS, formatDate, timeAgo } from "@/lib/format";
import { Button, Callout, Card, CardHeader, cx } from "@/components/ui";
import { DocumentLayoutEditor } from "@/components/document-layout-editor";
import { payLinkFor } from "@/lib/pdf-response";
import { DocumentActions } from "@/components/document-actions";
import { StatusBadge } from "@/components/doc-bits";
import { DocTimeline, timelineItems } from "@/components/doc-timeline";
import { PaidCelebration } from "@/components/paid-celebration";
import { pickupSoon, savedMessage } from "@/lib/send-queue";
import { daysBetween, nextReminder } from "@/lib/send-core";
import { absoluteLogoUrl } from "@/lib/site";
import { DocumentFiles } from "@/components/document-files";
import { PaymentClaims } from "@/components/payment-claims";
import { countryCode, inNigeria, readiness } from "@/lib/einvoice";
import { sendChecklist, viewStats, viewText } from "@/lib/collect-core";
import { DocActionButton, DocActionLink, EInvoiceLine, LinkBar } from "@/components/doc-side";
import { r2Ready } from "@/lib/storage";
import { readyTemplates } from "@/lib/templates-ready";

// files attached to this document (null when the table isn't installed yet)
// emails waiting to go (scheduled or a repeat); [] until the send-sheet SQL is run
async function waitingSends(ctx, documentId) {
  const { data, error } = await ctx.supabase.from("document_sends").select("id, to_email, send_after, kind")
    .eq("document_id", documentId).eq("status", "queued").neq("kind", "now").order("send_after");
  return error ? [] : (data || []).map((s) => ({ ...s, label: new Date(s.send_after).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }) }));
}

// the next payment reminder for an unpaid invoice, from Settings → Reminders.
// { date } or { date: null } when there's none; null when reminders aren't set up
async function reminderPlan(ctx, doc, today) {
  if (doc.kind !== "invoice" || !doc.due_date || !doc.customer_email) return null;
  const [{ data: rules, error }, { data: log }, { data: biz }] = await Promise.all([
    ctx.supabase.from("reminder_rules").select("id, offset_days, enabled").eq("business_id", doc.business_id),
    ctx.supabase.from("reminder_log").select("rule_id").eq("document_id", doc.id),
    ctx.supabase.from("businesses").select("reminders_enabled").eq("id", doc.business_id).maybeSingle(),
  ]);
  if (error || !rules?.length) return null;
  if (biz && biz.reminders_enabled === false) return { date: null, off: true };
  return { date: nextReminder({ dueDate: doc.due_date, rules, sentRuleIds: (log || []).map((l) => l.rule_id), today }) };
}

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
  const revenue = doc.total_minor - doc.tax_minor; // before tax (also right for VAT-inclusive prices)
  const { profit, pct } = marginOf(revenue, costTotal);
  const source = related.find((r) => r.id === doc.source_quote_id);
  const converted = related.find((r) => r.id === doc.converted_invoice_id);
  const whatsapp = `https://wa.me/${(doc.customer_phone || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hello ${doc.customer_name.split(" ")[0] || ""}, here is ${quote ? "our quotation" : "your invoice"} ${doc.number} from ${ctx.business.name} for ${money(quote ? doc.total_minor : balance)}: ${link}`)}`;
  const lastReturn = activity.find((a) => a.action === "document.returned");
  const payLink = await payLinkFor(ctx.supabase, doc, full.connections);
  // templates are chosen while a document is made; a paid or cancelled one keeps its look
  const canEditLayout = !["paid", "void"].includes(doc.status) && (draft || can(ctx.member, "documents.send"));
  const files = await filesFor(ctx, doc.id);
  // customers who said "I've sent it" (empty until the payment claims SQL is run)
  const { data: claimRows } = await ctx.supabase.from("payment_claims").select("id, amount_minor, payer_name, paid_on, note, file_id, created_at")
    .eq("document_id", doc.id).eq("status", "pending").order("created_at");
  const claims = (claimRows || []).map((c) => ({ ...c, amountLabel: money(c.amount_minor), paidLabel: formatDate(c.paid_on, { day: "numeric", month: "short" }), when: timeAgo(c.created_at) }));
  const storageOn = await r2Ready();
  // emails waiting in the queue go out now if their time has come (the daily job is the backstop)
  after(() => pickupSoon(ctx.business.id));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const unpaid = !quote && ["sent", "viewed", "partially_paid"].includes(doc.status);
  const overdueDays = unpaid && doc.due_date && doc.due_date < today ? daysBetween(doc.due_date, today) : 0;
  const [scheduled, plan, message] = await Promise.all([waitingSends(ctx, doc.id), unpaid ? reminderPlan(ctx, doc, today) : null, savedMessage(ctx.supabase, ctx.business.id)]);
  const canSendDoc = can(ctx.member, "documents.send") || (ctx.member.role === "junior_finance" && !ctx.business.require_approval);
  const send = {
    business: { name: ctx.business.name, brand_color: ctx.business.brand_color, logoUrl: absoluteLogoUrl(ctx.business.logo_path) },
    savedMessage: message, canSaveDefault: can(ctx.member, "settings.business"), canRepeat: ["owner", "manager", "finance"].includes(ctx.member.role) && doc.source !== "pos",
    scheduled, overdue: overdueDays > 0,
  };
  const nextDate = plan?.date ? formatDate(plan.date, { weekday: "short", day: "numeric", month: "short" }) : null;
  const extraTemplates = await readyTemplates(ctx.supabase);

  // ---- what the side column shows, most useful first --------------------------
  const live = !draft && doc.status !== "void";
  const views = viewStats(activity, doc.viewed_at);
  const latestReceipt = [...receipts].sort((a, b) => String(b.issued_at || "").localeCompare(String(a.issued_at || "")))[0] || null;
  const onlinePayments = (full.connections || []).some((c) => c.enabled && c.payment_confirmed_at);
  const checklist = draft ? sendChecklist(doc, items, ctx.business, { onlinePayments }) : [];
  const timelineCount = timelineItems(activity, doc).length;
  const paidShare = doc.total_minor > 0 ? Math.min(100, Math.round((Number(doc.amount_paid_minor) / Number(doc.total_minor)) * 100)) : 0;
  const canRecord = can(ctx.member, "payments.record");
  // e-invoicing: one line at the end; a banner only when it holds something up
  // (a business customer on a VAT invoice needs a proper e-invoice to claim the VAT back)
  const einvoice = doc.kind === "invoice" && doc.status !== "void" ? readiness(doc, items, ctx.business) : null;
  const biz = ctx.business;
  const fixFields = einvoice ? [
    !biz.tax_id && { key: "tax_id", label: "Your business tax ID (TIN)", value: "", placeholder: "12345678-0001" },
    !biz.address && { key: "address", label: "Business address", value: "", placeholder: "12 Admiralty Way, Lekki Phase 1", wide: true },
    !biz.city && { key: "city", label: "City", value: "", placeholder: "Lagos" },
    !countryCode(biz.country) && { key: "country", label: "Country", value: biz.country || "", placeholder: "Nigeria" },
    countryCode(biz.country) === "NG" && "postcode" in biz && !biz.postcode && { key: "postcode", label: "Business postcode (NIPOST)", value: "", placeholder: "LA-04-B22-KT-05" },
  ].filter(Boolean) : [];
  const einvoiceBlocks = Boolean(einvoice && !einvoice.ready && live && (doc.customer_tax_id || (doc.customer_company && Number(doc.tax_minor) > 0)));
  const einvoiceLine = einvoice && (
    <EInvoiceLine docId={doc.id} ready={einvoice.ready} missingCount={einvoice.missing.length} fields={fixFields}
      canFix={can(ctx.member, "settings.business")} nigeria={inNigeria(ctx.business)} />
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href={quote ? "/app/quotes/all" : "/app/invoices"} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" />{quote ? "Quotes" : "Invoices"}
      </Link>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title-1 text-ink">{doc.number}</h1>
            <StatusBadge doc={doc} />
            {doc.created_via && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-violet-ink ring-1 ring-violet/30" title="Created through an AI assistant connected in Settings → AI & MCP">
                <Sparkles className="size-3.5" />Made by {doc.created_via}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-2">{doc.title || (quote ? "Quotation" : "Invoice")} · {doc.customer_name}{doc.customer_company ? `, ${doc.customer_company}` : ""}</p>
        </div>
        <DocumentActions doc={doc} balance={balance} emailReady={await emailConfigured()} link={link} printHref={`/print/doc/${doc.id}`} pdfHref={`/app/documents/${doc.id}/pdf?download`}
          send={send} autoOpen={sp.remind ? "reminder" : sp.send ? "send" : undefined} key={sp.remind || sp.send ? `open-${sp.remind ? "r" : "s"}` : "actions"}
          receipt={latestReceipt ? { id: latestReceipt.id, number: latestReceipt.number, access_token: latestReceipt.access_token } : null} canEditLayout={canEditLayout}
          perms={{ canSendDoc, canSend: can(ctx.member, "documents.send"), needsApproval: ctx.member.role === "junior_finance" && ctx.business.require_approval, canApprove: can(ctx.member, "documents.approve"),
            canRecord: can(ctx.member, "payments.record"), canConvert: can(ctx.member, "documents.convert"), canVoid: can(ctx.member, "documents.void") }} />
      </div>

      {/* the customer's link: one slim bar, with whether they've opened it (that decides whether to chase) */}
      {live && link && <LinkBar link={link} whatsapp={whatsapp} state={viewText(views, today)} opened={views.count > 0 || !unpaid} />}

      {doc.status === "paid" && <PaidCelebration docId={doc.id} paidAt={doc.paid_at} />}
      {overdueDays > 0 && (
        <Callout tone="danger" icon={Clock} title={`${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`}
          action={canSendDoc ? <span className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <DocActionLink action="remind">Remind now</DocActionLink>
            {plan && can(ctx.member, "settings.business") && <Link className="font-semibold text-brand-ink hover:underline" href="/app/settings/reminders">Edit reminders</Link>}
          </span> : null}>
          {money(balance)} is still to pay. {!doc.customer_email ? "There's no email for this client, so remind them on WhatsApp." : plan?.off ? "Automatic reminders are off." : nextDate ? `Next automatic reminder goes ${nextDate}.` : plan ? "No more automatic reminders are planned." : ""}
        </Callout>
      )}
      {einvoiceBlocks && <EInvoiceLine banner docId={doc.id} ready={false} missingCount={einvoice.missing.length} fields={fixFields} canFix={can(ctx.member, "settings.business")} nigeria={inNigeria(ctx.business)} />}
      {(draft || doc.status === "sent") && scheduled.length > 0 && (
        <Callout tone="info" icon={CalendarClock} title={scheduled[0].kind === "recurring" ? "Sending soon" : `Scheduled for ${scheduled[0].label}`}>
          The email goes to {scheduled[0].to_email}{draft ? ", and it is marked as sent then" : ""}. Change or cancel it from Send.
        </Callout>
      )}
      {doc.recur_interval && (
        <Callout tone="info" icon={Repeat} title={`Repeats ${doc.recur_interval}`}>
          The next one is made on {formatDate(doc.recur_next_on, { weekday: "short", day: "numeric", month: "short" })}{doc.recur_auto_send ? ` and emailed to ${doc.customer_email}` : " as a draft for you to check"}.
        </Callout>
      )}
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

        {/* phones: "have I been paid / what's missing" comes before the long preview */}
        <aside className="flex flex-col gap-4 max-lg:order-first">
          {/* 1 · a draft: what's still missing before it can go */}
          {draft && checklist.length > 0 && (
            <Card>
              <CardHeader title="Before you send" icon={ListChecks} description={checklist.every((c) => c.ok) ? "Everything your customer needs is there." : `${checklist.filter((c) => !c.ok).length} thing${checklist.filter((c) => !c.ok).length === 1 ? "" : "s"} to add`} />
              {!checklist.every((c) => c.ok) && <ul className="flex flex-col gap-2 px-5 pb-4 text-[13px]">
                {checklist.map((c) => (
                  <li key={c.key} className="flex items-center gap-2.5">
                    {c.ok ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="size-4 shrink-0 text-ink-3" aria-label="Missing" />}
                    <span className={cx("min-w-0 flex-1", c.ok ? "text-ink-2" : "font-medium text-ink")}>{c.label}</span>
                    {!c.ok && <Link className="inline-flex min-h-9 items-center font-semibold text-brand-ink hover:underline" href={c.fix === "payments" ? "/app/settings/payments" : `/app/documents/${doc.id}/edit`}>Add</Link>}
                  </li>
                ))}
              </ul>}
            </Card>
          )}

          {/* 1 · sent: have I been paid, and what's next (the one accented card) */}
          {live && (!quote || payments.length > 0) && (
            <Card className="ring-2 ring-brand-line">
              <div className="flex flex-col gap-3 px-5 pb-4 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink-2">{doc.status === "paid" ? "Paid in full" : quote ? "Paid" : "Balance due"}</p>
                    <p className={cx("text-[26px] font-semibold leading-tight tracking-tight tabular", doc.status === "paid" ? "text-success-ink" : "text-ink")}>{money(doc.status === "paid" || quote ? doc.amount_paid_minor : balance)}</p>
                  </div>
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink"><Wallet className="size-4" aria-hidden /></span>
                </div>
                {!quote && (
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-tray" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={paidShare} aria-label="Paid so far">
                      <div className="h-full rounded-full bg-success" style={{ width: `${paidShare}%` }} />
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-ink-3 tabular">{money(doc.amount_paid_minor)} of {money(doc.total_minor)} paid{doc.status === "paid" && doc.paid_at ? ` · ${formatDate(doc.paid_at)}` : doc.due_date && doc.status !== "paid" ? ` · due ${formatDate(doc.due_date, { day: "numeric", month: "short" })}` : ""}</p>
                  </div>
                )}
                {unpaid && canRecord && <DocActionButton action="payment" icon="wallet" block>Record payment</DocActionButton>}
              </div>
              {payments.length > 0 ? (
                <ul className="divide-y divide-line border-t border-line">
                  {payments.map((p) => {
                    const r = receipts.find((x) => x.payment_id === p.id);
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                        <span className="min-w-0">
                          <span className="block font-medium text-ink tabular">{money(p.amount_minor)}</span>
                          <span className="text-xs text-ink-3">{PAYMENT_METHODS[p.method]} · {formatDate(p.paid_at)}{Number(p.wht_minor) > 0 ? ` · incl. ${money(p.wht_minor)} WHT` : ""}</span>
                        </span>
                        {r && <span className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" icon={Receipt} href={`/r/${r.access_token}`}>{r.number}</Button>
                          <Button size="sm" variant="ghost" icon={Printer} href={`/print/receipt/${r.id}`} aria-label={`Print receipt ${r.number}`} className="!px-2" />
                        </span>}
                      </li>
                    );
                  })}
                </ul>
              ) : !quote && <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">No payments yet. Online payments appear here by themselves.</p>}
            </Card>
          )}

          {/* 2 · the latest two events (opened or not decides the next step), then the rest */}
          <Card>
            <CardHeader title="Activity" icon={History} />
            <DocTimeline activity={activity} doc={doc} money={money} to={2} />
            {timelineCount > 2 && (
              <details className="group border-t border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 text-[13px] font-medium text-brand-ink hover:bg-hover [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">See all {timelineCount}</span><span className="hidden group-open:inline">Show less</span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <DocTimeline activity={activity} doc={doc} money={money} from={2} />
              </details>
            )}
          </Card>

          {/* 3 · profit: one line, opens on click (only the team sees it) */}
          {showCosts && (
            <details className="group overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-card)] ring-1 ring-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-[13px] hover:bg-hover [&::-webkit-details-marker]:hidden">
                <EyeOff className="size-4 shrink-0 text-violet" aria-hidden />
                <span className="min-w-0 flex-1 font-medium text-ink">Profit</span>
                <span className={cx("font-semibold tabular", profit < 0 ? "text-danger-ink" : costTotal ? "text-success-ink" : "text-ink-3")}>{costTotal ? `${money(profit)} · ${pct.toFixed(0)}%` : "No costs added"}</span>
                <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="border-t border-line">
                <p className="bg-violet-soft/60 px-5 py-2 text-[12.5px] text-ink-2">Only your team sees this.</p>
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
              </div>
            </details>
          )}

          {(source || converted) && (
            <Card className="p-4">
              {source && <Link href={`/app/documents/${source.id}`} className="flex items-center justify-between text-[13px] font-medium text-ink hover:text-brand-ink">From quote {source.number}<ArrowRight className="size-4" /></Link>}
              {converted && <Link href={`/app/documents/${converted.id}`} className="flex items-center justify-between text-[13px] font-medium text-ink hover:text-brand-ink">Invoice {converted.number}<ArrowRight className="size-4" /></Link>}
            </Card>
          )}

          {/* 4 · files: one line; drop a file anywhere on the page */}
          <DocumentFiles documentId={doc.id} files={files || []} userId={ctx.user.id}
            canAdd={can(ctx.member, "documents.create")} canShare={can(ctx.member, "documents.send")}
            ready={storageOn && files !== null}
            problem={!storageOn ? "File storage isn't connected yet. Once Cloudflare R2 is set up, you can attach files here." : "Attachments need a quick database update. Ask the Usetally team to run the latest SQL."} />

          {/* 5 · e-invoicing: a business-settings task, so last and one line */}
          {!einvoiceBlocks && einvoiceLine}
        </aside>
      </div>
    </div>
  );
}
