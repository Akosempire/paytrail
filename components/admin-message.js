"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Textarea, cx } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { MESSAGE_TEMPLATES, checkMessage, fillTemplate } from "@/lib/admin-messages-core";
import { sendBusinessMessage } from "@/app/admin/messages-actions";

// Admin → a business → Message. Pick a starting point (e.g. "Upgrade not paid",
// filled in with their plan and amount), edit it, send. The owner gets it by
// email and in Ideas & help, and can reply.
export function AdminMessage({ businessId, vars, initial = "check_in", ownerEmail }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [key, setKey] = useState(initial);
  const [{ subject, body }, setMsg] = useState(() => fillTemplate(initial, vars));
  const [sent, setSent] = useState(null);
  const pick = (k) => { setKey(k); setMsg(fillTemplate(k, vars)); setSent(null); };
  const check = checkMessage({ subject, body });
  const send = () => start(async () => {
    const r = await sendBusinessMessage(businessId, { subject, body });
    if (r?.error) return toast.error(r.error);
    toast.success(r.message);
    setSent(r);
  });
  return (
    <Card id="message" className="scroll-mt-24">
      <CardHeader title="Message this business" icon={MessageSquare}
        description={ownerEmail ? `Goes to ${ownerEmail} by email and to their Ideas & help, where they can reply.` : "Goes to their Ideas & help, where they can reply."} />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Start from">
          {Object.entries(MESSAGE_TEMPLATES).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={key === k} onClick={() => pick(k)}
              className={cx("inline-flex min-h-9 items-center rounded-full px-3 text-[13px] font-medium ring-1 transition-colors", key === k ? "bg-brand-soft text-brand-ink ring-brand-line/60" : "bg-surface text-ink-2 ring-line-strong hover:bg-hover")}>{t.label}</button>
          ))}
        </div>
        <Field label="Subject" htmlFor="am-subject"><Input id="am-subject" value={subject} onChange={(e) => setMsg((m) => ({ ...m, subject: e.target.value }))} placeholder="What it's about" /></Field>
        <Field label="Message" htmlFor="am-body" hint="Edit anything before you send. Lines starting with • show as a list."><Textarea id="am-body" rows={12} value={body} onChange={(e) => setMsg((m) => ({ ...m, body: e.target.value }))} /></Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={Send} loading={pending} disabled={!check.ok || pending} onClick={send}>Send message</Button>
          {!check.ok && (subject || body) && <p className="text-[12.5px] text-ink-3">{check.error}</p>}
          {sent?.threadId && <Link href={`/admin/inbox/${sent.threadId}`} className="text-[13px] font-medium text-brand-ink hover:underline">Open the conversation</Link>}
        </div>
      </div>
    </Card>
  );
}
