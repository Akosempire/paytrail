import Link from "next/link";
import { Inbox } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/context";
import { timeAgo } from "@/lib/format";
import { Badge, Callout, Card, EmptyState, ListRow, PageHeader, StatCard, StatGroup, cx } from "@/components/ui";
import { KINDS, STATUSES } from "@/lib/feedback-core";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const FILTERS = [["active", "Open & planned"], ["unread", "Unread"], ["feature", "Feature ideas"], ["problem", "Problems"], ["done", "Done"], ["all", "All"]];

export default async function Page({ searchParams }) {
  const ctx = await requirePlatformAdmin();
  const sp = await searchParams;
  const filter = FILTERS.some(([k]) => k === sp.show) ? sp.show : "active";
  let q = ctx.supabase.from("feedback_threads").select("id, kind, subject, status, author_name, author_email, unread_admin, last_message_at, businesses(name)")
    .order("last_message_at", { ascending: false }).limit(200);
  if (filter === "active") q = q.in("status", ["open", "planned"]);
  if (filter === "unread") q = q.eq("unread_admin", true);
  if (filter === "feature" || filter === "problem") q = q.eq("kind", filter);
  if (filter === "done") q = q.in("status", ["done", "closed"]);
  const [{ data: threads, error }, unread, features, open] = await Promise.all([
    q,
    ctx.supabase.from("feedback_threads").select("id", { count: "exact", head: true }).eq("unread_admin", true),
    ctx.supabase.from("feedback_threads").select("id", { count: "exact", head: true }).eq("kind", "feature").in("status", ["open", "planned"]),
    ctx.supabase.from("feedback_threads").select("id", { count: "exact", head: true }).in("status", ["open", "planned"]),
  ]);
  if (error && /feedback_threads/.test(error.message || "")) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Inbox" description="Feature requests and messages from people using Usetally." />
        <Callout tone="warn" title="One step left">Run <strong>RUN_NEW_2026-10-29b.sql</strong> in Supabase (SQL Editor), then refresh this page.</Callout>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Inbox" description="Feature requests and messages from people using Usetally. New messages are also emailed to the alert addresses in Settings." />
      <StatGroup cols={3}>
        <StatCard label="Unread" value={unread.count ?? 0} icon={Inbox} tone={(unread.count ?? 0) ? "brand" : "neutral"} />
        <StatCard label="Open conversations" value={open.count ?? 0} />
        <StatCard label="Feature ideas waiting" value={features.count ?? 0} />
      </StatGroup>
      <nav className="flex gap-1 overflow-x-auto" aria-label="Filter">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/admin/inbox?show=${k}`} className={cx("inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-medium ring-1",
            filter === k ? "bg-ink text-surface ring-ink" : "bg-surface text-ink-2 ring-line hover:text-ink")}>{label}</Link>
        ))}
      </nav>
      <Card>
        {threads?.length ? (
          <ul className="divide-y divide-line">
            {threads.map((t) => (
              <li key={t.id}>
                <ListRow href={`/admin/inbox/${t.id}`}
                  title={<span className={cx("inline-flex items-center gap-2", t.unread_admin && "font-semibold")}>{t.unread_admin && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}{t.subject}</span>}
                  subtitle={`${t.author_name || t.author_email || "Someone"}${t.businesses?.name ? ` · ${t.businesses.name}` : ""} · ${timeAgo(t.last_message_at)}`}
                  trailing={<><Badge size="sm">{KINDS[t.kind]?.label}</Badge><Badge tone={STATUSES[t.status]?.tone} size="sm">{STATUSES[t.status]?.label}</Badge></>} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={Inbox} title="Nothing here" description="Messages people send from Ideas & help appear here." />
        )}
      </Card>
    </div>
  );
}
