import { Lightbulb, MessageSquare } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { timeAgo } from "@/lib/format";
import { Badge, Callout, Card, CardHeader, EmptyState, ListRow, PageHeader } from "@/components/ui";
import { KINDS, STATUSES } from "@/lib/feedback-core";
import { NewThread } from "./new-thread";

export const metadata = { title: "Ideas & help" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const ctx = await requireBusiness();
  const { data: threads, error } = await ctx.supabase.from("feedback_threads")
    .select("id, kind, subject, status, unread_user, last_message_at").eq("user_id", ctx.user.id).order("last_message_at", { ascending: false }).limit(50);
  const from = typeof sp.from === "string" ? sp.from.slice(0, 200) : "";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ideas & help" description="Ask for a feature, report a problem or ask us anything. It goes straight to the people who build Usetally, and we reply by email and here." />
      {error && /feedback_threads/.test(error.message || "") && (
        <Callout tone="warn" title="Database update needed">Run RUN_NEW_2026-10-29b.sql in Supabase to turn on Ideas &amp; help.</Callout>
      )}
      <Card>
        <CardHeader title="New message" icon={Lightbulb} iconTone="brand" />
        <NewThread initialKind={typeof sp.kind === "string" ? sp.kind : "feature"} from={from} />
      </Card>
      <Card>
        <CardHeader title="Your conversations" icon={MessageSquare} />
        {threads?.length ? (
          <ul className="divide-y divide-line">
            {threads.map((t) => (
              <li key={t.id}>
                <ListRow href={`/app/feedback/${t.id}`} title={<span className="inline-flex items-center gap-2">{t.unread_user && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="New reply" />}{t.subject}</span>}
                  subtitle={`${KINDS[t.kind]?.label || "Message"} · ${timeAgo(t.last_message_at)}`}
                  trailing={<Badge tone={STATUSES[t.status]?.tone || "neutral"} size="sm">{STATUSES[t.status]?.label || t.status}</Badge>} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={MessageSquare} title="No messages yet" description="Your conversations with the team will show here." />
        )}
      </Card>
    </div>
  );
}
