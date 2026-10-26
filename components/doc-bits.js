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
  "team.joined": "joined the team",
  "team.invited": "invited a teammate",
  "business.deletion_requested": "scheduled the business for deletion",
  "business.deletion_cancelled": "cancelled the business deletion",
  "data.exported": "downloaded a copy of the data",
};

export function activityText(a) {
  return ACTIONS[a.action] || a.action.replace(/[._]/g, " ");
}
