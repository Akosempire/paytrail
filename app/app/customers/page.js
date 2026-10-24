import Link from "next/link";
import { Search, Users } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { formatMoney } from "@/lib/money";
import { Avatar, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { CustomerButton } from "@/components/customer-form";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }) {
  const { q = "", archived } = await searchParams;
  const ctx = await requireBusiness();
  let query = ctx.supabase.from("customers").select("*").eq("business_id", ctx.business.id).order("name").limit(500);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const term = q.replace(/[%,()]/g, " ").trim();
  if (term) query = query.or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`);
  const [{ data: customers }, { data: docs }] = await Promise.all([
    query,
    ctx.supabase.from("documents").select("customer_id, kind, status, total_minor, amount_paid_minor").eq("business_id", ctx.business.id).not("customer_id", "is", null),
  ]);
  const stats = {};
  for (const d of docs || []) {
    const s = (stats[d.customer_id] ||= { owed: 0, paid: 0, count: 0 });
    s.count++;
    if (d.kind === "invoice" && ["sent", "viewed", "partially_paid"].includes(d.status)) s.owed += d.total_minor - d.amount_paid_minor;
    if (d.kind === "invoice") s.paid += Number(d.amount_paid_minor);
  }
  const money = (v) => formatMoney(v, ctx.business.currency);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Customers" description="Everyone you've quoted or invoiced, and what they owe." actions={<CustomerButton />} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="w-full sm:w-80"><Input icon={Search} name="q" defaultValue={q} placeholder="Search customers…" aria-label="Search customers" /></form>
        <Link href={archived ? "/app/customers" : "/app/customers?archived=1"} className="text-[13px] font-medium text-ink-2 hover:text-ink">{archived ? "Show active" : "Show archived"}</Link>
      </div>
      {!customers?.length ? (
        <EmptyState icon={Users} title={term ? "No matches" : "No customers yet"} description="Customers are added when you create a quote, or you can add them here." action={!term && <CustomerButton />} />
      ) : (
        <Card>
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_140px_140px] gap-4 border-b border-line bg-subtle px-5 py-2.5 text-xs font-medium text-ink-3 md:grid">
            <span>Customer</span><span className="text-right">Documents</span><span className="text-right">Paid to you</span><span className="text-right">Owes you</span>
          </div>
          <ul className="divide-y divide-line">
            {customers.map((c) => {
              const s = stats[c.id] || { owed: 0, paid: 0, count: 0 };
              return (
                <li key={c.id}>
                  <Link href={`/app/customers/${c.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 hover:bg-subtle md:grid-cols-[minmax(0,1fr)_120px_140px_140px]">
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={c.name} size="sm" />
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{c.name}{c.company && <span className="text-ink-3"> · {c.company}</span>}</span><span className="block truncate text-xs text-ink-3">{c.email || c.phone || "No contact details"}</span></span>
                    </span>
                    <span className="hidden text-right text-sm text-ink-2 tabular md:block">{s.count}</span>
                    <span className="hidden text-right text-sm text-ink-2 tabular md:block">{money(s.paid)}</span>
                    <span className={`text-right text-sm font-semibold tabular ${s.owed ? "text-warn-ink" : "text-ink-3"}`}>{money(s.owed)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
