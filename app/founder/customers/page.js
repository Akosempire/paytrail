import Link from "next/link";
import { ChevronLeft, ChevronRight, Mail, MessageCircle, Phone, Search, Users } from "lucide-react";
import { requirePlanManager } from "@/lib/context";
import { formatDate } from "@/lib/format";
import { Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const STATUS = { active: ["Paying", "success"], trialing: ["Free trial", "brand"], past_due: ["Payment overdue", "warn"], canceled: ["Stopped paying", "warn"], suspended: ["Suspended", "danger"] };
// "+234 801 234 5678" or "0801 234 5678" → 2348012345678 for WhatsApp
const waNumber = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.startsWith("0") && d.length === 11 ? `234${d.slice(1)}` : d; };

// Usetally's customers: every business, who owns it and how to reach them.
// For admins and co-founders who manage the platform; nothing here can be changed.
export default async function FounderCustomers({ searchParams }) {
  const ctx = await requirePlanManager();
  const { q = "", page = "1" } = await searchParams;
  const p = Math.max(1, parseInt(page, 10) || 1);
  const term = String(q).slice(0, 80);
  const { data, error } = await ctx.supabase.rpc("founder_customers", { p_search: term, p_limit: PAGE, p_offset: (p - 1) * PAGE });
  const rows = data?.rows || [];
  const total = Number(data?.total || 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (n) => `/founder/customers?${new URLSearchParams({ ...(term ? { q: term } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Customers" description={error ? "The customer list couldn't load." : `${total.toLocaleString("en-NG")} business${total === 1 ? "" : "es"} on Usetally, newest first.`} />
      <form className="flex gap-2" role="search">
        <Input icon={Search} name="q" defaultValue={term} placeholder="Search name, email or phone" className="w-full sm:w-96" aria-label="Search customers" />
        <button type="submit" className="h-10 shrink-0 rounded-md bg-surface px-4 text-sm font-medium ring-1 ring-inset ring-line-strong hover:bg-hover">Search</button>
      </form>

      {error ? (
        <Card><EmptyState icon={Users} title="The customer list couldn't load" description="Try again in a minute. If it keeps happening, ask your platform admin to run the latest Supabase update (RUN_NEW_2026-11-12b.sql)." /></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Users} title={term ? "No customers match" : "No customers yet"} description={term ? "Try part of a name, email or phone number." : "Businesses show up here as they sign up."} /></Card>
      ) : (
        <Card>
          <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_90px] gap-4 border-b border-line bg-subtle px-5 py-2.5 text-xs font-medium text-ink-3 lg:grid">
            <span>Business</span><span>Contact</span><span>Plan</span><span className="text-right">Sent</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((c) => {
              const [label, tone] = STATUS[c.status] || [c.status, "neutral"];
              return (
                <li key={c.id} className="grid gap-x-4 gap-y-2 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_90px] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                    <p className="truncate text-xs text-ink-3">{c.owner_name || "Owner"} · {c.kind === "company" ? "Company" : "Freelancer"}{c.country ? ` · ${c.country}` : ""} · joined {formatDate(c.joined)}</p>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 text-[13px]">
                    {c.owner_email && <a href={`mailto:${c.owner_email}`} className="inline-flex min-w-0 items-center gap-1.5 text-ink-2 hover:text-brand-ink"><Mail className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" /><span className="truncate">{c.owner_email}</span><span className="shrink-0 text-xs text-ink-3">login</span></a>}
                    {c.email && c.email.toLowerCase() !== c.owner_email?.toLowerCase() && <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-ink-2 hover:text-brand-ink"><Mail className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" /><span className="truncate">{c.email}</span><span className="shrink-0 text-xs text-ink-3">business</span></a>}
                    {c.phone ? (
                      <span className="inline-flex items-center gap-3">
                        <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-brand-ink"><Phone className="size-3.5 text-ink-3" aria-hidden="true" />{c.phone}</a>
                        {waNumber(c.phone).length >= 10 && <a href={`https://wa.me/${waNumber(c.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-success-ink hover:underline"><MessageCircle className="size-3.5" aria-hidden="true" />WhatsApp</a>}
                      </span>
                    ) : <span className="text-xs text-ink-3">No phone</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" tone={tone}>{label}</Badge>
                    {c.plan && <span className="text-[13px] text-ink-2">{c.plan}</span>}
                  </div>
                  <p className="text-[13px] text-ink-3 lg:text-right"><span className="font-semibold text-ink tabular">{Number(c.documents_sent || 0).toLocaleString("en-NG")}</span><span className="lg:hidden"> documents sent</span></p>
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <nav className="flex items-center justify-between border-t border-line px-5 py-3 text-sm" aria-label="Pages">
              {p > 1 ? <Link href={href(p - 1)} className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink"><ChevronLeft className="size-4" />Newer</Link> : <span />}
              <span className="text-ink-3">Page {p} of {pages}</span>
              {p < pages ? <Link href={href(p + 1)} className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink">Older<ChevronRight className="size-4" /></Link> : <span />}
            </nav>
          )}
        </Card>
      )}
    </div>
  );
}
