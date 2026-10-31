import { ArrowUpRight, Boxes, Receipt, ScanBarcode, Store, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/context";
import { formatDate, timeAgo } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Callout, DescriptionList, PageHeader, StatCard, StatGroup } from "@/components/ui";
import { DisconnectButton } from "./disconnect";

export const metadata = { title: "TrackOja POS" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requirePermission("settings.payments");
  const b = ctx.business;
  const { data: conn, error } = await ctx.supabase.from("pos_connections").select("id, store_name, created_at, last_used_at").eq("business_id", b.id).is("revoked_at", null).maybeSingle();
  const [sales, voided, pending, failed] = conn ? await Promise.all([
    ctx.supabase.from("pos_sales").select("id", { count: "exact", head: true }).eq("business_id", b.id),
    ctx.supabase.from("pos_sales").select("id", { count: "exact", head: true }).eq("business_id", b.id).eq("status", "voided"),
    ctx.supabase.from("pos_stock_pushes").select("document_id", { count: "exact", head: true }).eq("business_id", b.id).eq("status", "pending"),
    ctx.supabase.from("pos_stock_pushes").select("document_id", { count: "exact", head: true }).eq("business_id", b.id).eq("status", "failed"),
  ]) : [];
  const n = (r) => r?.count ?? 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="TrackOja POS" description="Sales from your TrackOja till are recorded here as invoices and receipts, and invoices you make here can use your store's products." />
      {error && /pos_connections/.test(error.message || "") && (
        <Callout tone="warn" title="Database update needed">Run RUN_NEW_2026-10-29a.sql in Supabase to connect TrackOja.</Callout>
      )}
      {conn ? (
        <>
          <Card>
            <CardHeader title={conn.store_name || "TrackOja store"} icon={Store} iconTone="success" description="Connected"
              actions={<><Badge tone="success" solid>Connected</Badge><DisconnectButton id={conn.id} store={conn.store_name || "TrackOja"} /></>} />
            <DescriptionList items={[
              ["Store", conn.store_name || "—"],
              ["Connected", formatDate(conn.created_at)],
              ["Last used", conn.last_used_at ? timeAgo(conn.last_used_at) : "Not yet"],
            ]} />
          </Card>
          <StatGroup cols={3}>
            <StatCard label="Sales recorded" value={n(sales)} hint={n(voided) ? `${n(voided)} voided at the till` : "Each one is an invoice with its receipts"} icon={Receipt} tone="brand" />
            <StatCard label="Stock updates waiting" value={n(pending)} hint="Sent to TrackOja when an invoice with its products is fully paid" icon={Boxes} />
            <StatCard label="Stock updates failed" value={n(failed)} hint={n(failed) ? "Check the products still exist in TrackOja" : "None"} icon={Boxes} tone={n(failed) ? "warn" : "neutral"} />
          </StatGroup>
          <Card>
            <CardHeader title="How it works" />
            <ul className="flex flex-col gap-2 px-5 py-4 text-[13px] text-ink-2">
              <li>Each completed sale becomes an invoice marked “POS”. Cash, card and transfer payments issue receipts; anything sold on credit stays as balance due.</li>
              <li>POS invoices don't count toward your plan's documents, and Usetally never emails customers about them.</li>
              <li>A sale voided in TrackOja is voided here too.</li>
              <li>On a quote or invoice, use <strong className="font-medium text-ink">Add from TrackOja</strong> to pick products. When that invoice is fully paid, TrackOja deducts the stock.</li>
            </ul>
          </Card>
        </>
      ) : (
        <NotConnected />
      )}
    </div>
  );
}

// Not connected yet: what TrackOja is, what connecting does, and how to start,
// for people who already use it and for people who've never heard of it.
function NotConnected() {
  const site = String(process.env.TRACKOJA_URL || "https://trackoja.cv").replace(/\/+$/, "");
  const host = site.replace(/^https?:\/\//, "");
  const ext = { target: "_blank", rel: "noopener noreferrer" };
  const gains = [
    [Receipt, "Shop sales land here by themselves", "Every sale at the till becomes a paid invoice with a receipt, so your profit, tax and reports include the shop. Credit sales stay as money owed."],
    [Boxes, "Use your store's products", "Add products from TrackOja to quotes and invoices here, with their prices."],
    [Store, "Stock stays right", "When an invoice with TrackOja products is paid here, TrackOja takes them off your stock."],
  ];
  return (
    <>
      <Card>
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink-2 ring-1 ring-line"><ScanBarcode className="size-5" /></span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold text-ink">What is TrackOja?</h2>
              <p className="mt-1 max-w-[640px] text-[14px] leading-relaxed text-ink-2">
                TrackOja is a till and stock app for shops that works hand in hand with Usetally. Sell by scanning barcodes or tapping products on a phone, tablet or computer,
                take cash, transfer or card, keep count of your stock, open and close the till each day, and give each staff member their own PIN.
              </p>
              <a href={site} {...ext} className="mt-2 inline-flex min-h-9 items-center gap-1 text-[14px] font-medium text-brand-ink hover:underline">{host}<ArrowUpRight className="size-4" /></a>
            </div>
          </div>
          <div>
            <p className="mb-3 text-[13px] font-medium text-ink-2">Connect it, and:</p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {gains.map(([Icon, title, text]) => (
                <li key={title} className="rounded-xl bg-subtle p-4 ring-1 ring-line">
                  <Icon className="size-5 text-ink-2" aria-hidden="true" />
                  <p className="mt-2 text-[14px] font-semibold text-ink">{title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{text}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-3"><Wallet className="size-3.5" aria-hidden="true" />Neither app ever holds your money, and you can disconnect from this page any time.</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="I already use TrackOja" description="An owner or manager of the store connects it." />
          <div className="flex flex-col gap-4 p-5">
            <ol className="flex flex-col gap-2.5 text-[14px] text-ink-2">
              {["Open TrackOja and go to Settings.", "Find the Usetally card and tap Connect Usetally.", "You'll come back here to approve it. That's all."].map((t, i) => (
                <li key={t} className="flex gap-3"><span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-ink tabular">{i + 1}</span><span className="pt-0.5">{t}</span></li>
              ))}
            </ol>
            <Button href={`${site}/settings#usetally`} {...ext} variant="primary" iconRight={ArrowUpRight} className="self-start">Open TrackOja settings</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="I'm new to TrackOja" description="Set up your shop first, then connect." />
          <div className="flex flex-col gap-4 p-5">
            <ol className="flex flex-col gap-2.5 text-[14px] text-ink-2">
              {["Create a TrackOja account for your shop.", "Add your products (one by one or from a spreadsheet).", "Connect Usetally from TrackOja's Settings."].map((t, i) => (
                <li key={t} className="flex gap-3"><span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-[12px] font-semibold text-ink-2 ring-1 ring-line tabular">{i + 1}</span><span className="pt-0.5">{t}</span></li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button href={`${site}/signup`} {...ext} variant="secondary" iconRight={ArrowUpRight}>Create a TrackOja account</Button>
              <Button href={site} {...ext} variant="ghost">Learn more</Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
