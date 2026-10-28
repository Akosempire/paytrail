import { Boxes, PlugZap, Receipt, Store } from "lucide-react";
import { requirePermission } from "@/lib/context";
import { formatDate, timeAgo } from "@/lib/format";
import { Badge, Card, CardHeader, Callout, DescriptionList, EmptyState, PageHeader, StatCard, StatGroup } from "@/components/ui";
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
        <EmptyState icon={PlugZap} title="Not connected"
          description="Open TrackOja, go to Settings → Connected apps and tap Connect Usetally. You'll come here to approve it." />
      )}
    </div>
  );
}
