import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { KINDS, STATUSES } from "@/lib/feedback-core";
import { Conversation } from "@/components/conversation";
import { replyToThread } from "../actions";
import { ReplyBox } from "./reply";

export const metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireBusiness();
  const { data: t } = await ctx.supabase.from("feedback_threads").select("*").eq("id", id).eq("user_id", ctx.user.id).maybeSingle();
  if (!t) notFound();
  const [{ data: messages }] = await Promise.all([
    ctx.supabase.from("feedback_messages").select("id, body, from_team, created_at").eq("thread_id", t.id).order("created_at"),
    t.unread_user ? ctx.supabase.rpc("feedback_mark_read", { thread: t.id }) : Promise.resolve(null),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={KINDS[t.kind]?.label} title={t.subject}
        description={`Started ${formatDate(t.created_at)}`}
        actions={<><Badge tone={STATUSES[t.status]?.tone || "neutral"}>{STATUSES[t.status]?.label || t.status}</Badge><Button href="/app/feedback" icon={ArrowLeft} size="sm">All messages</Button></>} />
      {sp.sent === "1" && <Alert intent="success" title="Sent to the Usetally team">We read every message. You'll get an email when we reply.</Alert>}
      <Card>
        <CardHeader title="Conversation" />
        <Conversation messages={messages || []} you="You" team="Usetally team" />
        <div className="border-t border-line">
          <ReplyBox action={replyToThread.bind(null, t.id)} placeholder="Add more detail or reply to the team…" />
        </div>
      </Card>
    </div>
  );
}
