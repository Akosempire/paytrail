import { Badge } from "@/components/ui";
import { STATUS, statusOf } from "@/lib/format";

export function StatusBadge({ doc, size }) {
  const s = STATUS[statusOf(doc)] || STATUS.draft;
  return <Badge tone={s.tone} size={size}>{s.label}</Badge>;
}

const ACTIONS = {
  "business.created": "created the business",
  "document.created": "created this document",
  "document.updated": "edited the draft",
  "document.submitted": "sent it for approval",
  "document.returned": "returned it to draft",
  "document.approved_and_sent": "approved and sent it",
  "document.sent": "sent it to the customer",
  "document.voided": "voided it",
  "document.viewed": "opened the link",
  "document.reminder_sent": "sent a payment reminder",
  "file.added": "attached a file",
  "file.removed": "removed a file",
  "file.shared": "shared a file with the customer",
  "file.unshared": "stopped sharing a file",
  "quote.accepted": "accepted the quote",
  "quote.declined": "declined the quote",
  "quote.converted": "converted the quote to this invoice",
  "payment.recorded": "payment recorded",
  "payment.claimed": "said they paid by bank transfer",
  "payment.claim_rejected": "marked a transfer as not received",
  "payment.needs_review": "sent a payment that needs checking (document was already paid or cancelled)",
  "document.emailed": "emailed it to the client",
  "document.shared": "shared it",
  "document.scheduled": "scheduled an email",
  "document.email_undone": "stopped an email (Undo)",
  "document.schedule_cancelled": "cancelled a scheduled email",
  "document.send_failed": "an email couldn't be sent",
  "document.recurring_set": "set it to repeat",
  "document.recurring_stopped": "stopped the repeat",
  "document.recurred": "made the next repeat",
  "team.joined": "joined the team",
  "team.invited": "invited a teammate",
  "business.deletion_requested": "scheduled the business for deletion",
  "business.deletion_cancelled": "cancelled the business deletion",
  "data.exported": "downloaded a copy of the data",
};

export function activityText(a) {
  return ACTIONS[a.action] || a.action.replace(/[._]/g, " ");
}
