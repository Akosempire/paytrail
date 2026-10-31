import Link from "next/link";
import { Package, Search } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { formatMoney, VAT_CATEGORIES } from "@/lib/money";
import { Alert, Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { ProductButton } from "@/components/product-form";

export const metadata = { title: "Products" };
const EDITORS = ["owner", "manager", "finance"];

export default async function Products({ searchParams }) {
  const { q = "", archived } = await searchParams;
  const ctx = await requireBusiness();
  const canEdit = EDITORS.includes(ctx.member?.role);
  const currency = ctx.business.currency || "NGN";
  const symbol = formatMoney(0, currency).replace(/[\d.,\s]/g, "") || currency;
  let query = ctx.supabase.from("products").select("*").eq("business_id", ctx.business.id).order("name").limit(500);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const term = q.replace(/[%,()]/g, " ").trim();
  if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  const { data: products, error } = await query;
  const missing = error && /products/.test(error.message || "");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Products" description="Things you sell often. Pick them when you add items to a quote or invoice, with the price already filled in."
        actions={canEdit && !missing && <ProductButton currencySymbol={symbol} />} />
      {missing && <Alert intent="warning" title="One database update needed">Run <code>supabase/RUN_NEW_2026-11-01c.sql</code> in the Supabase SQL editor to turn on products.</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="w-full sm:w-80" role="search"><Input icon={Search} name="q" type="search" defaultValue={q} placeholder="Search products…" aria-label="Search products" /></form>
        <Link href={archived ? "/app/products" : "/app/products?archived=1"} className="inline-flex min-h-11 items-center text-[13px] font-medium text-ink-2 hover:text-ink">{archived ? "Show active" : "Show archived"}</Link>
      </div>
      {!products?.length ? (
        <EmptyState icon={Package}
          title={term ? "No matches" : archived ? "Nothing archived" : "No products yet"}
          description={term ? `Nothing matches “${q}”.` : archived ? "Archived products show here." : "Save what you sell (a service, an hour of work, a carton) once, and add it to any invoice in a tap."}
          action={!term && !archived && canEdit && !missing && <ProductButton currencySymbol={symbol} label="Add your first product" />} />
      ) : (
        <Card>
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_140px_120px_96px] gap-4 border-b border-line bg-subtle px-5 py-2.5 text-xs font-medium text-ink-3 md:grid">
            <span>Product</span><span>Unit</span><span className="text-right">Price</span><span>VAT</span><span className="sr-only">Edit</span>
          </div>
          <ul className="divide-y divide-line">
            {products.map((p) => (
              <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0 px-5 py-3 md:grid-cols-[minmax(0,1fr)_110px_140px_120px_96px]">
                <span className="row-span-2 min-w-0 md:row-span-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  {p.description && <span className="block truncate text-xs text-ink-3">{p.description}</span>}
                  <span className="block text-xs text-ink-3 md:hidden">{[p.unit && `per ${p.unit}`, p.vat_category !== "standard" && VAT_CATEGORIES[p.vat_category]].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="hidden text-sm text-ink-2 md:block">{p.unit || "—"}</span>
                <span className="text-right text-sm font-semibold text-ink tabular">{formatMoney(p.unit_price_minor, currency)}</span>
                <span className="hidden md:block">{p.vat_category === "standard" ? <span className="text-sm text-ink-3">Standard</span> : <Badge size="sm" tone="info">{VAT_CATEGORIES[p.vat_category]}</Badge>}</span>
                <span className="col-start-2 -mr-2 justify-self-end md:col-start-auto md:mr-0">{canEdit && <ProductButton product={p} currencySymbol={symbol} variant="ghost" size="sm" />}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
