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
  "quote.accepted": "accepted the quote",
  "quote.declined": "declined the quote",
  "quote.converted": "converted the quote to this invoice",
  "payment.recorded": "payment recorded",
  "payment.needs_review": "sent a payment that needs checking (document was already paid or cancelled)",
  "team.joined": "joined the team",
  "team.invited": "invited a teammate",
};

export function activityText(a) {
  return ACTIONS[a.action] || a.action.replace(/[._]/g, " ");
}
