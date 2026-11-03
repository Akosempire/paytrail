"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Ban, Bell, CheckCircle2, ChevronDown, Eye, FilePlus2, Pencil, Repeat, Send, Users, Wallet, XCircle, Zap } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { activityText } from "@/components/doc-bits";
import { joinVerbs } from "@/lib/dashboard-core";
import { cx } from "@/components/ui";

const FILTERS = [["all", "All"], ["quotes", "Quotes"], ["invoices", "Invoices"], ["payments", "Payments"]];

// what the line is mostly about: the most telling thing that happened, first match wins
const LOOKS = [
  [/^payment\.recorded|^receipt\./, { icon: Wallet, tone: "success" }],
  [/^payment\.claimed/, { icon: Wallet, tone: "warning" }],
  [/^quote\.accepted|approved/, { icon: CheckCircle2, tone: "success" }],
  [/^quote\.declined|send_failed|claim_rejected/, { icon: XCircle, tone: "danger" }],
  [/voided/, { icon: Ban, tone: "danger" }],
  [/^document\.viewed/, { icon: Eye, tone: "brand" }],
  [/reminder/, { icon: Bell, tone: "warning" }],
  [/converted/, { icon: Zap, tone: "violet" }],
  [/sent|emailed|shared|scheduled|submitted/, { icon: Send, tone: "brand" }],
  [/recur/, { icon: Repeat, tone: "violet" }],
  [/updated/, { icon: Pencil, tone: "neutral" }],
  [/created/, { icon: FilePlus2, tone: "neutral" }],
  [/^team\./, { icon: Users, tone: "neutral" }],
];
const TONE = {
  success: "bg-success-soft text-success-ink ring-success/25",
  warning: "bg-warn-soft text-warn-ink ring-warn/25",
  danger: "bg-danger-soft text-danger-ink ring-danger/25",
  brand: "bg-brand-soft text-brand-ink ring-brand/25",
  violet: "bg-violet-soft text-violet-ink ring-violet/25",
  neutral: "bg-hover text-ink-2 ring-line",
};
const ORDER = ["success", "danger", "warning", "brand", "violet", "neutral"];

// a grouped line carries every action it merged; show the strongest
function lookOf(a) {
  const actions = a.actions || [a.action];
  let best = null;
  for (const act of actions) {
    const hit = LOOKS.find(([re]) => re.test(act))?.[1];
    if (hit && (!best || ORDER.indexOf(hit.tone) < ORDER.indexOf(best.tone))) best = hit;
  }
  return best || { icon: FilePlus2, tone: "neutral" };
}

// "ibrahim akorede" → "Ibrahim Akorede"; emails and brand names stay as they are
const nameOf = (label) => (!label ? "Customer" : label.includes("@") ? label : label.replace(/(^|\s)(\p{Ll})/gu, (_, s, c) => s + c.toUpperCase()));

const lagosDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
function dayLabel(value, now = new Date()) {
  const d = lagosDay(value), today = lagosDay(now), yest = lagosDay(now.getTime() - 86400000);
  if (d === today) return "Today";
  if (d === yest) return "Yesterday";
  const sameYear = d.slice(0, 4) === today.slice(0, 4);
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}
const clock = (value) => new Date(value).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "").toLowerCase();

function amountOf(a) {
  const doc = a.documents;
  const cur = doc?.currency || a.currency;
  if (!cur) return null;
  const paid = Number(a.detail?.amount_minor);
  if (a.kind === "payments" && paid > 0) return { value: formatMoney(paid, cur), paid: true };
  if (doc?.total_minor != null && ["quote", "invoice"].includes(doc.kind)) return { value: formatMoney(doc.total_minor, cur), paid: false };
  return null;
}

// Recent activity: grouped by day, an icon for what happened, who it was for
// and how much. Back-to-back events on the same document are already merged
// (groupActivity). a.mine: the signed-in person did it, shown as "You"
// (worked out on the server, so teammates' account ids never reach the browser).
export function ActivityFeed({ items = [] }) {
  const [f, setF] = useState("all");
  const [more, setMore] = useState(false);
  const present = new Set(items.map((a) => a.kind));
  const filters = FILTERS.filter(([k]) => k === "all" || present.has(k));
  const all = items.filter((a) => f === "all" || a.kind === f);
  const shown = all.slice(0, more ? 20 : 7);

  const days = [];
  for (const a of shown) {
    const label = dayLabel(a.created_at);
    if (days[days.length - 1]?.label !== label) days.push({ label, rows: [] });
    days[days.length - 1].rows.push(a);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="whitespace-nowrap text-[14px] font-semibold text-ink">Recent activity</h2>
        {filters.length > 2 && (
          <div className="flex rounded-lg bg-hover/60 p-0.5 ring-1 ring-line" role="group" aria-label="Show">
            {filters.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={f === k} onClick={() => { setF(k); setMore(false); }}
                className={cx("rounded-md px-2 py-1 text-[12px] font-medium transition-colors sm:px-2.5", f === k ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-3 hover:text-ink")}>{label}</button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-card)] ring-1 ring-line">
        {shown.length ? (
          <div className="px-3 pb-2 pt-1 sm:px-4">
            {days.map((day) => (
              <div key={day.label}>
                <p className="px-2 pb-1 pt-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3">{day.label}</p>
                <ol>
                  {day.rows.map((a, i) => {
                    const { icon: Icon, tone } = lookOf(a);
                    const who = a.mine ? "You" : nameOf(a.actor_label);
                    const amount = amountOf(a);
                    const customer = a.documents?.customer_company || a.documents?.customer_name;
                    const last = i === day.rows.length - 1;
                    const body = (
                      <>
                        <span className="relative flex shrink-0 flex-col items-center self-stretch">
                          <span className={cx("grid size-8 place-items-center rounded-full ring-1", TONE[tone])}><Icon className="size-4" aria-hidden="true" /></span>
                          {!last && <span className="mt-1 w-px flex-1 bg-line" aria-hidden="true" />}
                        </span>
                        <span className={cx("min-w-0 flex-1", last ? "pb-1" : "pb-3")}>
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0 pt-[5px] text-[13px] leading-snug text-ink-2">
                              <strong className="font-semibold text-ink">{who}</strong>{" "}
                              {a.verbs ? joinVerbs(a.verbs) : activityText(a)}
                              {a.documents?.number && <> <span className="whitespace-nowrap rounded-md bg-hover px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-brand-ink ring-1 ring-line group-hover:ring-brand/40">{a.documents.number}</span></>}
                            </span>
                            <span className="shrink-0 pt-[6px] text-[11.5px] tabular-nums text-ink-3">{clock(a.created_at)}</span>
                          </span>
                          {(customer || amount) && (
                            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
                              {customer && <span className="truncate">{customer}</span>}
                              {customer && amount && <span aria-hidden="true">·</span>}
                              {amount && <span data-money className={cx("shrink-0 font-medium tabular-nums", amount.paid ? "text-success" : "text-ink-2")}>{amount.paid ? "+" : ""}{amount.value}</span>}
                            </span>
                          )}
                        </span>
                      </>
                    );
                    return (
                      <li key={a.id}>
                        {a.document_id
                          ? <Link href={`/app/documents/${a.document_id}`} className="group flex gap-3 rounded-lg px-2 pt-2 transition-colors hover:bg-hover/70 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">{body}</Link>
                          : <div className="flex gap-3 px-2 pt-2">{body}</div>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
            {all.length > shown.length || more ? (
              <button type="button" onClick={() => setMore((m) => !m)} className="mx-2 mt-1 flex items-center gap-1 rounded-md px-1 py-1 text-[12px] font-medium text-ink-3 hover:text-ink">
                {more ? "Show less" : `Show ${Math.min(all.length, 20) - shown.length} more`}<ChevronDown className={cx("size-3.5 transition-transform", more && "rotate-180")} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : <p className="px-5 py-6 text-[13px] text-ink-3">{items.length ? "Nothing here yet." : "Activity shows up here as your team works."}</p>}
        <Link href="/app/payments" className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] font-medium text-brand-ink hover:bg-hover">All payments & receipts<ArrowRight className="size-4" /></Link>
      </div>
    </section>
  );
}
