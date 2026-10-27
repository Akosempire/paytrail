import Link from "next/link";
import { FileText, Inbox, Paperclip, UsersRound } from "lucide-react";
import { createSupabaseService } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";
import { monthOf } from "@/lib/tax";
import { siteUrl } from "@/lib/site";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, cx } from "@/components/ui";
import { AssignConsultant, Consultants, FeeSetting } from "./controls";

export const metadata = { title: "Tax filing" };
export const dynamic = "force-dynamic";

const TABS = [["requested", "To file"], ["filed", "Waiting for payment"], ["done", "Done"], ["all", "All"]];
const TONE = { to_file: "neutral", requested: "info", filed: "violet", done: "success" };
const WORD = { to_file: "To file", requested: "To file", filed: "Filed · to pay", done: "Done" };

// "File & pay for me" requests: who asked, who's on it, and the proof
export default async function AdminTax({ searchParams }) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : "requested";
  const service = createSupabaseService();
  let q = service.from("vat_returns").select("*").eq("mode", "assisted").order("requested_at", { ascending: false }).limit(200);
  if (tab !== "all") q = q.eq("status", tab);
  const [{ data: rets, error }, { data: consultants }, { data: settings }, { data: counts }] = await Promise.all([
    q, service.from("tax_consultants").select("*").order("created_at"),
    service.from("platform_settings").select("tax_filing_fee_minor").eq("id", true).maybeSingle(),
    service.from("vat_returns").select("status").eq("mode", "assisted"),
  ]);
  const ids = [...new Set((rets || []).map((r) => r.business_id))];
  const [{ data: businesses }, { data: files }] = await Promise.all([
    ids.length ? service.from("businesses").select("id, name, tax_id, email, phone").in("id", ids) : Promise.resolve({ data: [] }),
    (rets || []).length ? service.from("vat_return_files").select("id, return_id, kind, name").in("return_id", rets.map((r) => r.id)) : Promise.resolve({ data: [] }),
  ]);
  const biz = Object.fromEntries((businesses || []).map((b) => [b.id, b]));
  const count = (k) => (counts || []).filter((r) => k === "all" || r.status === k).length;
  const active = (consultants || []).filter((c) => c.active);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tax filing" description="Businesses that tapped “File & pay for me”. The assigned consultant is emailed a private link; you see everything here." />
      {error && <Callout tone="warn" title="One step left">Run <strong>RUN_NEW_2026-10-27a.sql</strong> in Supabase → SQL Editor.</Callout>}
      {!error && !active.length && <Callout tone="warn" title="No consultant yet">Add a tax consultant below so requests are assigned and they're emailed straight away. Until then, requests still arrive here and you're alerted.</Callout>}

      <Card>
        <CardHeader icon={Inbox} title="Requests" />
        <nav className="flex gap-2 overflow-x-auto border-b border-line px-5 py-3" aria-label="Status">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/admin/tax?tab=${k}`} aria-current={tab === k ? "page" : undefined}
              className={cx("shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 ring-inset", tab === k ? "bg-brand text-white ring-brand" : "text-ink-2 ring-line hover:text-ink")}>{label} · {count(k)}</Link>
          ))}
        </nav>
        {rets?.length ? (
          <ul className="divide-y divide-line">
            {rets.map((r) => {
              const b = biz[r.business_id] || {}, m = monthOf(r.period);
              const fs = (files || []).filter((f) => f.return_id === r.id);
              return (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink">{b.name || "Business"} · {m.label}<Badge size="sm" tone={TONE[r.status]}>{WORD[r.status]}</Badge></p>
                    <p className="mt-0.5 text-[13px] text-ink-2">VAT {formatMoney(r.vat_minor, r.currency)} · due {formatDate(m.due)} · TIN {b.tax_id || <span className="text-warn-ink">missing</span>} · {b.email || "no email"}{b.phone ? ` · ${b.phone}` : ""}</p>
                    <p className="text-[12.5px] text-ink-3">Requested {r.requested_at ? timeAgo(r.requested_at) : ""} by {r.requested_by_name || "the business"}{r.request_note ? `: “${r.request_note}”` : ""}</p>
                    {r.status !== "requested" && r.filed_at && <p className="text-[12.5px] text-ink-3">Filed {timeAgo(r.filed_at)} by {r.filed_by_name}{r.amount_due_minor != null ? ` · to pay ${formatMoney(r.amount_due_minor, r.currency)}` : ""}{r.payment_reference ? ` · ref ${r.payment_reference}` : ""}{r.done_at ? ` · paid ${timeAgo(r.done_at)}` : ""}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={`/admin/tax/export?return=${r.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-medium text-ink ring-1 ring-line hover:bg-hover"><FileText className="size-3.5" />Invoices CSV</a>
                      {fs.map((f) => <a key={f.id} href={`/admin/tax/files/${f.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-medium text-ink ring-1 ring-line hover:bg-hover"><Paperclip className="size-3.5" />{f.kind === "acknowledgement" ? "Acknowledgement" : f.kind === "payment_receipt" ? "Payment receipt" : f.name}</a>)}
                    </div>
                  </div>
                  <AssignConsultant returnId={r.id} current={r.consultant_id} consultants={(consultants || []).map((c) => ({ id: c.id, name: c.name, active: c.active }))} />
                </li>
              );
            })}
          </ul>
        ) : <EmptyState compact icon={Inbox} title={tab === "requested" ? "Nothing to file right now" : "Nothing here"} description="When a business taps “File & pay for me”, it appears here and you're alerted." />}
      </Card>

      <Consultants consultants={(consultants || []).map((c) => ({ ...c, link: `${siteUrl()}/consultant/${c.access_token}` }))} />
      <FeeSetting fee={Number(settings?.tax_filing_fee_minor || 0)} />
    </div>
  );
}
