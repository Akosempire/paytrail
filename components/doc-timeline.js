import Link from "next/link";
import { FilePlus2, Send, Eye, BellRing, Wallet, CircleCheck, Ban, Mail, Share2, CalendarClock, Repeat, Undo2, TriangleAlert, ShieldCheck, Pencil, FileCheck2, Paperclip, CircleDot } from "lucide-react";
import { activityText } from "@/components/doc-bits";
import { CHANNEL_LABEL } from "@/lib/send-core";
import { formatDate, timeAgo } from "@/lib/format";
import { cx } from "@/components/ui";

// The invoice's story, newest first: Created → Sent (channel) → Viewed →
// Reminder → Payment → Paid. Each line: who, what, when.
const KIND = {
  "document.created": { icon: FilePlus2 },
  "document.updated": { icon: Pencil },
  "document.submitted": { icon: ShieldCheck },
  "document.returned": { icon: Undo2, tone: "warn" },
  "document.approved_and_sent": { icon: Send, tone: "brand" },
  "document.sent": { icon: Send, tone: "brand" },
  "document.emailed": { icon: Mail, tone: "brand" },
  "document.shared": { icon: Share2 },
  "document.scheduled": { icon: CalendarClock },
  "document.email_undone": { icon: Undo2 },
  "document.schedule_cancelled": { icon: Undo2 },
  "document.send_failed": { icon: TriangleAlert, tone: "danger" },
  "document.viewed": { icon: Eye, tone: "violet" },
  "document.reminder_sent": { icon: BellRing, tone: "warn" },
  "document.recurring_set": { icon: Repeat },
  "document.recurring_stopped": { icon: Repeat },
  "document.recurred": { icon: Repeat },
  "document.voided": { icon: Ban, tone: "danger" },
  "quote.accepted": { icon: FileCheck2, tone: "success" },
  "quote.declined": { icon: Ban, tone: "danger" },
  "payment.recorded": { icon: Wallet, tone: "success" },
  "payment.claimed": { icon: Wallet },
  "file.added": { icon: Paperclip },
};
const TONE = {
  brand: "bg-brand-soft text-brand-ink ring-brand-line",
  success: "bg-success-soft text-success-ink ring-success/30",
  warn: "bg-warn-soft text-warn-ink ring-warn/30",
  danger: "bg-danger-soft text-danger-ink ring-danger/30",
  violet: "bg-violet-soft text-violet ring-violet/30",
  neutral: "bg-subtle text-ink-3 ring-line",
};

// the sentence after the name
export function timelineText(a, { money, quote } = {}) {
  const d = a.detail || {};
  const doc = quote ? "quote" : "invoice";
  switch (a.action) {
    case "document.sent": return `sent it to the client${d.channel ? ` ${CHANNEL_LABEL[d.channel] || ""}` : ""}`;
    case "document.approved_and_sent": return `approved and sent it${d.channel ? ` ${CHANNEL_LABEL[d.channel] || ""}` : ""}`;
    case "document.emailed": return `emailed it to ${d.to}${d.cc?.length ? ` (CC ${d.cc.length})` : ""}`;
    case "document.shared": return `shared it ${CHANNEL_LABEL[d.channel] || ""}`.trim();
    case "document.scheduled": return `scheduled an email to ${d.to} for ${d.send_after ? new Date(d.send_after).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }) : "later"}`;
    case "document.email_undone": return `stopped the email to ${d.to} (Undo)`;
    case "document.schedule_cancelled": return `cancelled the scheduled email to ${d.to}`;
    case "document.send_failed": return `couldn't email ${d.to}${d.reason ? `: ${d.reason}` : ""}`;
    case "document.viewed": return `opened this`;
    case "document.reminder_sent": return `sent a payment reminder${d.to ? ` to ${d.to}` : ""}`;
    case "document.recurring_set": return `set it to repeat ${d.interval}, next on ${d.next_on ? formatDate(d.next_on, { day: "numeric", month: "short" }) : "—"}${d.auto_send ? ", sent automatically" : ""}`;
    case "document.recurring_stopped": return "stopped the repeat";
    case "document.recurred": return `made the next ${doc}, ${d.number}`;
    case "document.created": return d.repeat_of ? `created this from the repeat of ${d.repeat_of}` : activityText(a);
    case "payment.recorded": return `payment recorded${d.amount_minor && money ? ` · ${money(d.amount_minor)}` : ""}`;
    default: return `${activityText(a)}${d.amount_minor && money ? ` · ${money(d.amount_minor)}` : ""}${d.name ? `: ${d.name}` : ""}`;
  }
}

export function DocTimeline({ activity, doc, money }) {
  const quote = doc.kind === "quote";
  // "Paid" closes the story when it happened
  const items = [...activity];
  if (doc.status === "paid" && doc.paid_at) items.unshift({ id: "paid", action: "document.paid", created_at: doc.paid_at, actor_label: "", detail: {} });
  if (!items.length) return <p className="px-5 py-4 text-[13px] text-ink-3">Nothing yet.</p>;
  return (
    <ol className="relative px-5 py-4" aria-label="Activity">
      {items.map((a, i) => {
        const paid = a.action === "document.paid";
        const k = paid ? { icon: CircleCheck, tone: "success" } : KIND[a.action] || { icon: CircleDot };
        const Icon = k.icon;
        return (
          <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-line" />}
            <span className={cx("relative z-[1] inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-1", TONE[k.tone || "neutral"])}><Icon className="size-3.5" aria-hidden /></span>
            <span className="min-w-0 pt-0.5 text-[13px]">
              <span className="text-ink">
                {paid ? <strong className="font-medium">Paid in full</strong> : <><strong className="font-medium">{a.actor_label || "Client"}</strong> {timelineText(a, { money, quote })}</>}
                {a.action === "document.recurred" && a.detail?.new_id && <> · <Link className="font-medium text-brand-ink hover:underline" href={`/app/documents/${a.detail.new_id}`}>Open</Link></>}
              </span>
              <span className="block text-xs text-ink-3"><time dateTime={a.created_at} title={new Date(a.created_at).toLocaleString("en-GB")}>{timeAgo(a.created_at)}</time></span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
