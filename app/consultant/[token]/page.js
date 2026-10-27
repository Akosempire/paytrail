import { notFound } from "next/navigation";
import { Building2, CalendarClock, FileText, Paperclip } from "lucide-react";
import { createSupabaseService } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";
import { monthOf } from "@/lib/tax";
import { Badge, Card, EmptyState, Logo } from "@/components/ui";
import { consultantFor } from "./lookup";
import { FilingForm } from "./filing-form";

export const metadata = { title: "VAT returns to file", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// A tax consultant's private page: the returns assigned to them, with the
// business's details and numbers, and a form to record each filing.
export default async function ConsultantPage({ params }) {
  const { token } = await params;
  const c = await consultantFor(token);
  if (!c) notFound();
  const service = createSupabaseService();
  const { data: rets } = await service.from("vat_returns").select("*").eq("consultant_id", c.id).order("requested_at", { ascending: false }).limit(100);
  const ids = [...new Set((rets || []).map((r) => r.business_id))];
  const [{ data: businesses }, { data: owners }, { data: files }] = await Promise.all([
    ids.length ? service.from("businesses").select("id, name, legal_name, tax_id, address, city, country, email, phone").in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? service.from("memberships").select("business_id, full_name, email").in("business_id", ids).eq("role", "owner") : Promise.resolve({ data: [] }),
    (rets || []).length ? service.from("vat_return_files").select("id, return_id, kind, name").in("return_id", rets.map((r) => r.id)) : Promise.resolve({ data: [] }),
  ]);
  const biz = Object.fromEntries((businesses || []).map((b) => [b.id, b]));
  const owner = (id) => (owners || []).find((o) => o.business_id === id);
  const open = (rets || []).filter((r) => r.status === "requested");
  const rest = (rets || []).filter((r) => r.status !== "requested");

  const Item = ({ r }) => {
    const b = biz[r.business_id] || {}, m = monthOf(r.period), o = owner(r.business_id);
    const fs = (files || []).filter((f) => f.return_id === r.id);
    return (
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[16px] font-semibold text-ink"><Building2 className="size-4 text-ink-3" />{b.name}</p>
            <p className="text-[13px] text-ink-2">{m.label} VAT return · requested {r.requested_at ? timeAgo(r.requested_at) : ""}</p>
          </div>
          <Badge tone={r.status === "requested" ? "warn" : r.status === "filed" ? "violet" : "success"}>{r.status === "requested" ? "To file" : r.status === "filed" ? "Filed · business to pay" : "Paid · done"}</Badge>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
            <dt className="text-ink-3">VAT charged</dt><dd className="font-semibold tabular-nums text-ink">{formatMoney(r.vat_minor, r.currency)}</dd>
            <dt className="text-ink-3">Sales before VAT</dt><dd className="tabular-nums text-ink">{formatMoney(r.sales_minor, r.currency)}</dd>
            <dt className="text-ink-3">Due</dt><dd className="flex items-center gap-1.5 text-ink"><CalendarClock className="size-3.5 text-ink-3" />{formatDate(m.due)}</dd>
            <dt className="text-ink-3">Business</dt><dd className="text-ink">{b.legal_name || b.name}</dd>
            <dt className="text-ink-3">TIN</dt><dd className="font-mono text-ink">{b.tax_id || <span className="font-sans text-warn-ink">Not added yet: ask them</span>}</dd>
            <dt className="text-ink-3">Address</dt><dd className="text-ink">{[b.address, b.city, b.country].filter(Boolean).join(", ") || "—"}</dd>
            <dt className="text-ink-3">Contact</dt><dd className="text-ink">{o?.full_name || "Owner"} · <a className="text-brand-ink underline" href={`mailto:${o?.email || b.email}`}>{o?.email || b.email}</a>{b.phone ? <> · <a className="text-brand-ink underline" href={`tel:${b.phone}`}>{b.phone}</a></> : ""}</dd>
            {r.request_note && <><dt className="text-ink-3">Their note</dt><dd className="text-ink">“{r.request_note}”</dd></>}
          </dl>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <a href={`/consultant/${token}/export?return=${r.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink ring-1 ring-line hover:bg-hover"><FileText className="size-4" />Invoices for {m.label} (CSV)</a>
              {fs.map((f) => <a key={f.id} href={`/consultant/${token}/files/${f.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink ring-1 ring-line hover:bg-hover"><Paperclip className="size-4" />{f.kind === "acknowledgement" ? "Acknowledgement" : "Payment receipt"}</a>)}
            </div>
            {r.status === "requested"
              ? <FilingForm token={token} returnId={r.id} vat={r.vat_minor} currency={r.currency} />
              : <p className="text-[13px] text-ink-2">Filed {r.filed_at ? timeAgo(r.filed_at) : ""}{r.amount_due_minor != null ? ` · to pay ${formatMoney(r.amount_due_minor, r.currency)}` : ""}{r.payment_reference ? ` · ref ${r.payment_reference}` : ""}{r.done_at ? ` · business paid ${timeAgo(r.done_at)}` : " · waiting for the business to pay"}.</p>}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Logo withWord />
          <p className="text-[13px] text-ink-2">Hello, <strong className="text-ink">{c.name}</strong></p>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-title-1 text-ink">VAT returns to file</h1>
          <p className="mt-1 text-[14px] text-ink-2">For each one: contact the business to get access in Rev360 (they must not share their password), file the return, then record it here. The business is emailed the amount and payment reference straight away.</p>
        </div>
        {open.length ? open.map((r) => <Item key={r.id} r={r} />) : <EmptyState icon={FileText} title="Nothing to file right now" description="You'll get an email when a business asks for its VAT return to be filed." />}
        {rest.length > 0 && <><h2 className="mt-4 text-title-3 text-ink">Filed</h2>{rest.map((r) => <Item key={r.id} r={r} />)}</>}
        <p className="text-center text-[12px] text-ink-3">This page is private to you. Don't share the link.</p>
      </main>
    </div>
  );
}
