import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/context";
import { formatDate } from "@/lib/format";
import { Button, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui";
import { KINDS } from "@/lib/feedback-core";
import { Conversation } from "@/components/conversation";
import { duration } from "@/lib/usage-core";
import { StatusSelect, TeamReply } from "./controls";

export const metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  const { id } = await params;
  const ctx = await requirePlatformAdmin();
  const { data: t } = await ctx.supabase.from("feedback_threads").select("*, businesses(id, name)").eq("id", id).maybeSingle();
  if (!t) notFound();
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [{ data: messages }, { data: usage }] = await Promise.all([
    ctx.supabase.from("feedback_messages").select("id, body, from_team, created_at").eq("thread_id", t.id).order("created_at"),
    t.user_id ? ctx.supabase.from("usage_daily").select("seconds, day").eq("user_id", t.user_id).gte("day", since) : Promise.resolve({ data: [] }),
    t.unread_admin ? ctx.supabase.rpc("feedback_mark_read", { thread: t.id }) : Promise.resolve(null),
  ]);
  const secs = (usage || []).reduce((s, r) => s + r.seconds, 0);
  const days = new Set((usage || []).map((r) => r.day)).size;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={KINDS[t.kind]?.label} title={t.subject}
        actions={<><StatusSelect id={t.id} status={t.status} /><Button href="/admin/inbox" icon={ArrowLeft} size="sm">Inbox</Button></>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Card>
          <CardHeader title="Conversation" />
          <Conversation messages={messages || []} you={t.author_name || "Them"} team="You (team)" teamSide="right" />
          <div className="border-t border-line"><TeamReply id={t.id} status={t.status} /></div>
        </Card>
        <Card>
          <CardHeader title="From" />
          <DescriptionList items={[
            ["Name", t.author_name || "—"],
            ["Email", t.author_email ? <a className="text-brand-ink underline" href={`mailto:${t.author_email}`}>{t.author_email}</a> : "—"],
            ["App", t.source === "trackoja" ? "TrackOja" : "Usetally"],
            [t.source === "trackoja" ? "Store" : "Business", t.businesses ? <Link className="text-brand-ink underline" href={`/admin/businesses/${t.businesses.id}`}>{t.businesses.name}</Link> : t.origin_label || "—"],
            ["Sent from", t.page || "—"],
            ["Started", formatDate(t.created_at)],
            t.source !== "trackoja" && ["Time in app (30 days)", secs ? `${duration(secs)} over ${days} day${days === 1 ? "" : "s"}` : "None recorded"],
          ]} />
        </Card>
      </div>
    </div>
  );
}
