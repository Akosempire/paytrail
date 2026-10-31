"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Download, Pencil, ReceiptText, Send, X } from "lucide-react";
import { Badge, Card, cx } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { CollectActions } from "@/components/collect-actions";
import { sendReminder } from "@/app/app/documents/send-actions";
import { formatMoney } from "@/lib/money";
import { balanceOf, collectStatus, invoicesCsv, rowActions } from "@/lib/collect-core";

// The invoices list: every row is a real link (opens in a new tab, works by
// keyboard), with the next step for its status on the right: Draft → Send ·
// Edit; unpaid → Remind · Record payment; paid → Receipt. Tick rows to remind
// or export them together. Rows update in place after an action, so the list
// doesn't jump; a payment that clears the balance slides the row out (Undo
// brings it back).
//
// rows: invoices, already sorted, each with an optional receipt_id (paid ones)
// today: "YYYY-MM-DD"; perms: { canSend, canRecord }

// actions show on hover with a mouse, and always on touch screens
const REVEAL = "[@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";
const actionLink = "relative z-10 inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-ink-2 ring-1 ring-line hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] max-sm:h-11";

export function InvoiceRows({ rows, today, businessName, perms }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState(() => new Set());
  const [local, setLocal] = useState({}); // id → { reminded, paidExtra, gone }
  const [bulkBusy, setBulkBusy] = useState(false);
  const patch = (id, p) => setLocal((m) => ({ ...m, [id]: { ...m[id], ...p } }));

  const view = useMemo(() => rows.map((d) => {
    const l = local[d.id] || {};
    return l.paidExtra ? { ...d, amount_paid_minor: Number(d.amount_paid_minor || 0) + l.paidExtra, status: "partially_paid" } : d;
  }), [rows, local]);

  // a row's Remind / Record payment finished: update it in place
  function onCollect(id, e) {
    if ("reminded" in e) patch(id, { reminded: e.reminded });
    if (e.pendingPaid) patch(id, { gone: true });
    else if (e.amountMinor) patch(id, { paidExtra: e.amountMinor });
    if (e.undone) patch(id, { gone: false, paidExtra: 0 });
    if (e.recorded) router.refresh();
  }
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const visibleIds = view.filter((d) => !local[d.id]?.gone).map((d) => d.id);
  const allOn = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const chosen = view.filter((d) => selected.has(d.id));

  async function remindSelected() {
    const can = chosen.filter((d) => ["sent", "viewed", "partially_paid"].includes(d.status) && d.customer_email);
    const skipped = chosen.filter((d) => !can.includes(d));
    if (!can.length) return toast.warning("None of these can be reminded by email. Only sent, unpaid invoices with a customer email can. Use WhatsApp from each row.");
    setBulkBusy(true);
    let ok = 0;
    const failed = [];
    for (const d of can) {
      const r = await sendReminder(d.id).catch(() => ({ error: "Couldn't reach Usetally." }));
      if (r?.error) failed.push(`${d.number} (${r.error})`);
      else { ok += 1; patch(d.id, { reminded: "email" }); }
    }
    setBulkBusy(false);
    if (ok) toast.success(`Reminder emailed for ${ok} invoice${ok === 1 ? "" : "s"}.`);
    if (skipped.length) toast.info(`Skipped ${skipped.map((d) => d.number).join(", ")}: not unpaid, or no customer email.`);
    if (failed.length) toast.error(`Couldn't remind ${failed.join("; ")}`);
  }
  function exportSelected() {
    const blob = new Blob([invoicesCsv(chosen)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `invoices-${today}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return (
    <>
      <Card className="!overflow-visible">
        <div className="hidden rounded-t-xl grid-cols-[28px_120px_minmax(0,1fr)_190px_170px_minmax(150px,auto)] items-center gap-4 border-b border-line bg-subtle px-5 py-2.5 text-xs font-medium text-ink-3 md:grid">
          <input type="checkbox" aria-label={allOn ? "Clear selection" : "Select all invoices shown"} checked={allOn}
            onChange={() => setSelected(allOn ? new Set() : new Set(visibleIds))} className="size-4 accent-[var(--color-brand)]" />
          <span>Number</span><span>Customer</span><span>Status</span><span className="text-right">Amount</span><span className="sr-only">Actions</span>
        </div>
        <ul className="divide-y divide-line">
          {view.map((d) => {
            const l = local[d.id] || {};
            const st = l.reminded ? { text: "Reminder sent just now", tone: "info" } : collectStatus(d, today);
            const balance = balanceOf(d);
            const part = Number(d.amount_paid_minor) > 0 && d.status !== "paid";
            const shown = d.status === "paid" ? Number(d.total_minor) : balance;
            const acts = rowActions(d);
            const label = `${d.number}, ${d.customer_name || "no customer"}, ${formatMoney(shown, d.currency)}, ${st.text}`;
            return (
              <li key={d.id} aria-hidden={l.gone || undefined}
                className={cx("group relative grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none hover:bg-subtle", l.gone ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]")}>
                <div className={l.gone ? "overflow-hidden" : ""}>
                  <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3.5 md:grid-cols-[28px_120px_minmax(0,1fr)_190px_170px_minmax(150px,auto)] md:items-center md:gap-4 md:px-5">
                    <input type="checkbox" aria-label={`Select ${d.number}`} checked={selected.has(d.id)} onChange={() => toggle(d.id)} tabIndex={l.gone ? -1 : 0}
                      className="relative z-10 mt-0.5 size-4 accent-[var(--color-brand)] max-md:size-5 md:mt-0" />
                    {/* the row's link: covers the whole row (::after), so a click anywhere opens it */}
                    <Link href={`/app/documents/${d.id}`} aria-label={label} tabIndex={l.gone ? -1 : 0}
                      className="font-mono text-[13px] font-medium text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:shadow-[inset_var(--shadow-focus)] max-md:absolute max-md:inset-0 max-md:overflow-hidden max-md:text-[0px]">
                      {d.number}
                    </Link>
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{d.customer_name || "No customer"}{d.customer_company ? ` · ${d.customer_company}` : ""}</span>
                      <span className="block truncate text-xs text-ink-3"><span className="font-mono md:hidden">{d.number}{d.title ? " · " : ""}</span>{d.title}</span>
                      <span className="mt-1.5 block md:hidden"><Badge tone={st.tone} size="sm">{st.text}</Badge></span>
                    </div>
                    <span className="hidden md:block"><Badge tone={st.tone} size="sm">{st.text}</Badge></span>
                    <div className="min-w-0 text-right">
                      <span className="block text-sm font-semibold text-ink tabular">{formatMoney(shown, d.currency)}</span>
                      {part && (
                        <>
                          <span className="block text-[11.5px] text-ink-3 tabular">of {formatMoney(d.total_minor, d.currency)}</span>
                          <span className="mt-1 ml-auto block h-1 w-20 overflow-hidden rounded-full bg-tray" role="img" aria-label={`${Math.round((Number(d.amount_paid_minor) / Number(d.total_minor || 1)) * 100)}% paid`}>
                            <span className="block h-full rounded-full bg-success" style={{ width: `${Math.min(100, (Number(d.amount_paid_minor) / Number(d.total_minor || 1)) * 100)}%` }} />
                          </span>
                        </>
                      )}
                    </div>
                    <div className={cx("col-span-2 col-start-2 flex justify-start gap-1.5 md:col-span-1 md:col-start-auto md:justify-end", REVEAL)}>
                      {acts.includes("send") && perms.canSend && <Link href={`/app/documents/${d.id}?send=1`} className={actionLink}><Send className="size-4" />Send</Link>}
                      {acts.includes("edit") && <Link href={`/app/documents/${d.id}/edit`} className={actionLink}><Pencil className="size-4" />Edit</Link>}
                      {(acts.includes("remind") || acts.includes("record")) && (
                        <>
                          {/* computers: icons (with tooltips); phones: words, as there's no hover */}
                          <CollectActions doc={d} businessName={businessName} perms={perms} className="relative z-10 max-md:hidden" onChange={(e) => onCollect(d.id, e)} />
                          <CollectActions doc={d} businessName={businessName} perms={perms} labels className="relative z-10 md:hidden" onChange={(e) => onCollect(d.id, e)} />
                        </>
                      )}
                      {acts.includes("receipt") && <Link href={d.receipt_id ? `/app/receipts/${d.receipt_id}` : `/app/documents/${d.id}`} className={actionLink}><ReceiptText className="size-4" />Receipt</Link>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {selected.size > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-full max-w-xl flex-wrap items-center gap-2 rounded-xl bg-surface p-2 pl-4 shadow-[var(--shadow-pop)] ring-1 ring-line" role="region" aria-label="Selected invoices">
          <span className="mr-auto text-[13px] font-medium text-ink">{selected.size} selected</span>
          {perms.canSend && <button type="button" disabled={bulkBusy} onClick={remindSelected} className={cx(actionLink, "z-auto")}><BellRing className="size-4" />{bulkBusy ? "Reminding…" : "Remind by email"}</button>}
          <button type="button" onClick={exportSelected} className={cx(actionLink, "z-auto")}><Download className="size-4" />Export CSV</button>
          <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="inline-flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink max-sm:size-11"><X className="size-4" /></button>
        </div>
      )}
    </>
  );
}
