export function formatDate(value, opts = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "—";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T00:00:00") : new Date(value);
  return d.toLocaleDateString("en-GB", opts);
}

export function timeAgo(value) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${unit}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
}

export function isOverdue(doc) {
  return doc.kind === "invoice" && ["sent", "viewed", "partially_paid"].includes(doc.status) && doc.due_date && new Date(doc.due_date + "T23:59:59") < new Date();
}

export function isExpired(doc) {
  return doc.kind === "quote" && ["sent", "viewed"].includes(doc.status) && doc.valid_until && new Date(doc.valid_until + "T23:59:59") < new Date();
}

export const STATUS = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Awaiting approval", tone: "violet" },
  sent: { label: "Sent", tone: "info" },
  viewed: { label: "Viewed", tone: "brand" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  partially_paid: { label: "Part paid", tone: "warn" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Void", tone: "neutral" },
  overdue: { label: "Overdue", tone: "danger" },
  expired: { label: "Expired", tone: "warn" },
};

export function statusOf(doc) {
  if (isOverdue(doc)) return "overdue";
  if (isExpired(doc)) return "expired";
  return doc.status;
}

export const COST_CATEGORIES = {
  data: "Data / internet",
  electricity: "Electricity / fuel",
  subscription: "Software & subscriptions",
  transport: "Transport & logistics",
  labour: "Labour / contractors",
  materials: "Materials",
  fees: "Fees & charges",
  other: "Other",
};

export const PAYMENT_METHODS = {
  bachs: "Bachs",
  flutterwave: "Flutterwave",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  pos: "POS",
  other: "Other",
};
