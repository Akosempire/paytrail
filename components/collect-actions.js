"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, Check, Copy, ExternalLink, Loader2, Mail, MessageCircle, MoreHorizontal, Phone, Wallet } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { recordPaymentNotify, sendReminder, shareDocument, undoSend } from "@/app/app/documents/send-actions";
import { PAYMENT_METHODS } from "@/lib/format";
import { formatMoney, minorToInput } from "@/lib/money";
import { balanceOf, reminderText, todayIso } from "@/lib/collect-core";
import { whatsappUrl } from "@/lib/send-core";

// One-tap getting paid, wherever an unpaid invoice is listed (dashboard Collect
// queue, invoices list, invoice page):
//   Remind  → WhatsApp (prefilled) or email (10 s to undo)
//   Record payment → a small form with the balance filled in; saved after a
//                    6 s "Undo" window, so a slip can be taken back
//   ⋯       → open, copy the customer's link, call
// onChange({ reminded, paid, pendingPaid, undone }) lets the list update the row in place.
// doc: id, number, kind, status, currency, total_minor, amount_paid_minor, due_date,
//      customer_name, customer_email, customer_phone, access_token

const MANUAL_METHODS = ["bank_transfer", "cash", "pos", "other"];
const UNDO_MS = 6000;

function usePopover() {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return { open, setOpen, ref };
}

const iconBtn = "inline-flex size-9 items-center justify-center rounded-md text-ink-2 ring-1 ring-line hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:opacity-50 max-sm:size-11";
const textBtn = "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium text-ink-2 ring-1 ring-line hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:opacity-50 max-sm:h-11";
const menuItem = "flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink";
const panel = "absolute right-0 top-full z-30 max-md:left-0 max-md:right-auto mt-1.5 rounded-xl bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-line";

export function CollectActions({ doc, businessName, perms = {}, onChange, labels = false, show = ["remind", "record", "more"], className }) {
  const toast = useToast();
  const { open, setOpen, ref } = usePopover();
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(false);
  const pendingPay = useRef(null);
  const link = typeof window !== "undefined" && doc.access_token ? `${window.location.origin}/d/${doc.access_token}` : "";
  const balance = balanceOf(doc);
  const canRemind = perms.canSend !== false && ["sent", "viewed", "partially_paid"].includes(doc.status);
  const canRecord = perms.canRecord !== false && ["sent", "viewed", "partially_paid"].includes(doc.status);

  // a payment waiting out its undo window is saved if the page is left
  useEffect(() => () => { pendingPay.current?.flush(); }, []);

  async function emailReminder() {
    setBusy("email");
    const r = await sendReminder(doc.id).catch(() => ({ error: "Couldn't reach Usetally. Try again." }));
    setBusy(null);
    setOpen(null);
    if (r?.error) return toast.error(r.error);
    if (r?.warning) return toast.warning(r.warning);
    onChange?.({ reminded: "email" });
    toast.success(`Reminder emailed to ${r.to || doc.customer_email}.`, r.sendId ? { action: { label: "Undo", onClick: async () => { const u = await undoSend(r.sendId); if (u?.error) toast.error(u.error); else { onChange?.({ reminded: null }); toast.info("Reminder cancelled."); } } } } : undefined);
  }
  function whatsappReminder() {
    const text = reminderText(doc, businessName, link, todayIso());
    window.open(whatsappUrl(doc.customer_phone || "", text), "_blank", "noopener");
    shareDocument(doc.id, "whatsapp").catch(() => null);
    setOpen(null);
    onChange?.({ reminded: "whatsapp" });
  }

  function recordPayment(form) {
    setOpen(null);
    const amountMinor = Math.round(Number(String(form.amount).replace(/,/g, "")) * 100);
    const clears = amountMinor >= balance;
    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      pendingPay.current = null;
      const r = await recordPaymentNotify(doc.id, form).catch(() => ({ error: "Couldn't reach Usetally. The payment wasn't recorded." }));
      if (r?.error) { toast.error(r.error); onChange?.({ undone: true }); return; }
      onChange?.({ paid: Boolean(r.paid), recorded: true });
      if (r.receiptTo) toast.success(`Receipt sent to ${r.receiptTo}.`);
      else if (r.receiptError) toast.warning(`Payment recorded, but the receipt email failed: ${r.receiptError}`);
    };
    const timer = setTimeout(commit, UNDO_MS);
    pendingPay.current = { flush: () => { clearTimeout(timer); commit(); } };
    onChange?.({ pendingPaid: clears, amountMinor });
    toast.success(`${formatMoney(amountMinor, doc.currency)} recorded for ${doc.number}.`, {
      duration: UNDO_MS,
      action: { label: "Undo", onClick: () => { if (done) return toast.info("It was already saved. Open the invoice to change it."); done = true; clearTimeout(timer); pendingPay.current = null; onChange?.({ undone: true }); toast.info("Payment not recorded."); } },
    });
  }

  return (
    <div ref={ref} className={cx("relative flex items-center gap-1.5", className)} onClick={(e) => e.stopPropagation()}>
      {show.includes("remind") && canRemind && (
        <div className="relative">
          <button type="button" className={labels ? textBtn : iconBtn} aria-haspopup="menu" aria-expanded={open === "remind"} aria-label={labels ? undefined : `Remind about ${doc.number}`} title="Remind"
            onClick={() => setOpen(open === "remind" ? null : "remind")}>
            <BellRing className="size-4" />{labels && "Remind"}
          </button>
          {open === "remind" && (
            <div role="menu" className={cx(panel, "w-64")}>
              <button role="menuitem" type="button" className={menuItem} onClick={whatsappReminder}><MessageCircle className="size-4" />On WhatsApp{doc.customer_phone ? "" : " (choose the chat)"}</button>
              {doc.customer_email
                ? <button role="menuitem" type="button" className={menuItem} disabled={busy === "email"} onClick={emailReminder}>{busy === "email" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}<span className="min-w-0 truncate">By email · {doc.customer_email}</span></button>
                : <p className="px-3 py-2 text-[12.5px] text-ink-3">No email saved for this customer.</p>}
            </div>
          )}
        </div>
      )}
      {show.includes("record") && canRecord && (
        <div className="relative">
          <button type="button" className={labels ? textBtn : iconBtn} aria-haspopup="dialog" aria-expanded={open === "record"} aria-label={labels ? undefined : `Record a payment for ${doc.number}`} title="Record payment"
            onClick={() => setOpen(open === "record" ? null : "record")}>
            <Wallet className="size-4" />{labels && "Record payment"}
          </button>
          {open === "record" && <RecordForm doc={doc} balance={balance} hasEmail={Boolean(doc.customer_email)} onSubmit={recordPayment} />}
        </div>
      )}
      {show.includes("more") && (
        <div className="relative">
          <button type="button" className={iconBtn} aria-haspopup="menu" aria-expanded={open === "more"} aria-label={`More for ${doc.number}`} onClick={() => setOpen(open === "more" ? null : "more")}>
            <MoreHorizontal className="size-4" />
          </button>
          {open === "more" && (
            <div role="menu" className={cx(panel, "w-56")}>
              <Link role="menuitem" href={`/app/documents/${doc.id}`} className={menuItem}><ExternalLink className="size-4" />Open</Link>
              {link && (
                <button role="menuitem" type="button" className={menuItem} onClick={async () => {
                  try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked */ }
                  setCopied(true); setTimeout(() => { setCopied(false); setOpen(null); }, 1100);
                }}>{copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy customer link"}</button>
              )}
              {doc.customer_phone && <a role="menuitem" href={`tel:${doc.customer_phone.replace(/[^\d+]/g, "")}`} className={menuItem}><Phone className="size-4" />Call {String(doc.customer_name || "").split(/\s+/)[0]}</a>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecordForm({ doc, balance, hasEmail, onSubmit }) {
  const [amount, setAmount] = useState(minorToInput(balance));
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState(todayIso());
  const [emailReceipt, setEmailReceipt] = useState(hasEmail);
  const value = Number(String(amount).replace(/,/g, ""));
  const bad = !Number.isFinite(value) || value <= 0;
  const field = "h-10 w-full rounded-md bg-surface px-3 text-[14px] text-ink ring-1 ring-line-strong focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]";
  return (
    <form role="dialog" aria-label={`Record a payment for ${doc.number}`} className={cx(panel, "w-72 p-3.5")}
      onSubmit={(e) => { e.preventDefault(); if (!bad) onSubmit({ amount: String(value), method, date, emailReceipt }); }}>
      <p className="text-[13px] font-semibold text-ink">Record a payment</p>
      <p className="mb-3 text-[12.5px] text-ink-3">{formatMoney(balance, doc.currency)} still owed on {doc.number}</p>
      <label className="mb-1 block text-[12.5px] font-medium text-ink-2" htmlFor={`amt-${doc.id}`}>Amount received</label>
      <input id={`amt-${doc.id}`} autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={cx(field, "tabular")} aria-invalid={bad || undefined} />
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[12.5px] font-medium text-ink-2" htmlFor={`m-${doc.id}`}>How</label>
          <select id={`m-${doc.id}`} value={method} onChange={(e) => setMethod(e.target.value)} className={field}>{MANUAL_METHODS.map((k) => <option key={k} value={k}>{PAYMENT_METHODS[k]}</option>)}</select>
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-medium text-ink-2" htmlFor={`d-${doc.id}`}>Date</label>
          <input id={`d-${doc.id}`} type="date" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} className={field} />
        </div>
      </div>
      {hasEmail && (
        <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={emailReceipt} onChange={(e) => setEmailReceipt(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />Email the receipt
        </label>
      )}
      <button type="submit" disabled={bad} className={buttonClass({ variant: "primary", block: true, className: "mt-3.5" })}>
        <Wallet className="size-4" />Record {bad ? "" : formatMoney(Math.round(value * 100), doc.currency)}
      </button>
    </form>
  );
}
