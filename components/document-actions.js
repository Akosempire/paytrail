"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Pencil, Trash2, ShieldCheck, Undo2, FileOutput, Ban, Copy, Wallet, Mail, Download, MoreHorizontal, Loader2, Printer, Share2, ExternalLink, X } from "lucide-react";
import { Button, buttonClass, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { formatMoney, minorToInput, toMinor } from "@/lib/money";
import { convertToInvoice, deleteDraft, duplicateDocument, recordPayment, resendEmail, returnToDraft, sendDocument, submitForApproval, voidDocument } from "@/app/app/documents/actions";

export function DocumentActions({ doc, perms, emailReady, balance, link, printHref, pdfHref }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null);
  const [more, setMore] = useState(false);
  const quote = doc.kind === "quote";
  const draft = ["draft", "pending_approval"].includes(doc.status);

  function run(key, fn) {
    setBusy(key);
    setMore(false);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (r?.error) toast(r.error, "error");
      else if (r?.message) toast(r.message);
      router.refresh();
    });
  }
  const spin = (key, Icon) => (busy === key && pending ? Loader2 : Icon);

  const primary = [];
  const secondary = [];
  if (doc.status === "draft") {
    primary.push(<Button key="edit" href={`/app/documents/${doc.id}/edit`} icon={Pencil}>Edit</Button>);
    if (perms.canSend || !perms.needsApproval) primary.push(<Button key="send" variant="primary" icon={spin("send", Send)} onClick={() => run("send", () => sendDocument(doc.id, { email: emailReady }))}>{emailReady && doc.customer_email ? "Send to customer" : "Mark as sent"}</Button>);
    else primary.push(<Button key="submit" variant="primary" icon={spin("submit", ShieldCheck)} onClick={() => run("submit", () => submitForApproval(doc.id))}>Submit for approval</Button>);
    secondary.push({ key: "delete", label: "Delete draft", icon: Trash2, danger: true, onClick: () => setModal("delete") });
  }
  if (doc.status === "pending_approval") {
    primary.push(<Button key="edit" href={`/app/documents/${doc.id}/edit`} icon={Pencil}>Edit</Button>);
    if (perms.canApprove) {
      primary.push(<Button key="return" icon={Undo2} onClick={() => setModal("return")}>Return</Button>);
      primary.push(<Button key="approve" variant="primary" icon={spin("send", ShieldCheck)} onClick={() => run("send", () => sendDocument(doc.id, { email: emailReady, expected: doc.updated_at }))}>Approve & send</Button>);
    }
  }
  if (!draft && doc.status !== "void") {
    if (!quote && perms.canRecord && ["sent", "viewed", "partially_paid"].includes(doc.status)) primary.push(<Button key="pay" variant="primary" icon={Wallet} onClick={() => setModal("payment")}>Record payment</Button>);
    if (quote && perms.canConvert && !doc.converted_invoice_id && ["sent", "viewed", "accepted"].includes(doc.status)) primary.push(<Button key="convert" variant={doc.status === "accepted" ? "primary" : "secondary"} icon={spin("convert", FileOutput)} onClick={() => run("convert", () => convertToInvoice(doc.id))}>Convert to invoice</Button>);
    if (emailReady && doc.customer_email && doc.status !== "paid") secondary.push({ key: "resend", label: "Email again", icon: Mail, onClick: () => run("resend", () => resendEmail(doc.id)) });
    if (perms.canVoid && Number(doc.amount_paid_minor) === 0 && !["paid", "accepted"].includes(doc.status)) secondary.push({ key: "void", label: "Void", icon: Ban, danger: true, onClick: () => setModal("void") });
  }
  const live = !draft && doc.status !== "void";
  if (live && link) primary.push(<Button key="share" variant={primary.length ? "secondary" : "primary"} icon={Share2} onClick={() => share()}>Share</Button>);
  const tools = [
    { key: "print", label: "Print", icon: Printer, href: printHref },
    { key: "open", label: "Open PDF in a new tab", icon: ExternalLink, href: `/app/documents/${doc.id}/pdf`, blank: true },
  ];
  if (live && link) tools.push({ key: "copy", label: "Copy customer link", icon: Copy, onClick: () => copy() });

  async function copy() {
    setMore(false);
    try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch { toast("Couldn't copy the link.", "error"); }
  }
  async function share() {
    const text = `${quote ? "Quotation" : "Invoice"} ${doc.number}`;
    if (navigator.share) { try { await navigator.share({ title: text, text, url: link }); } catch { /* closed */ } return; }
    copy();
  }

  secondary.push({ key: "dup", label: `Duplicate as ${quote ? "quote" : "invoice"}`, icon: Copy, onClick: () => run("dup", () => duplicateDocument(doc.id)) });
  if (quote) secondary.push({ key: "dupi", label: "Copy into a new invoice", icon: Copy, onClick: () => run("dupi", () => duplicateDocument(doc.id, "invoice")) });

  const Item = ({ s: it }) => {
    const cls = `flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[14px] font-medium hover:bg-hover sm:gap-2.5 sm:rounded-md sm:px-2.5 sm:py-2 sm:text-[13px] ${it.danger ? "text-danger-ink" : "text-ink"}`;
    const body = <><it.icon className="size-4 shrink-0" />{it.label}</>;
    return it.href
      ? <a href={it.href} target={it.blank ? "_blank" : undefined} rel={it.blank ? "noopener" : undefined} onClick={() => setMore(false)} className={cls}>{body}</a>
      : <button type="button" onClick={it.onClick} className={cls}>{body}</button>;
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
      {/* on phones the main actions share the full width; PDF and More wrap below when there's no room */}
      {primary.length > 0 && <div className="flex flex-1 gap-2 sm:flex-none [&>*]:flex-1 sm:[&>*]:flex-none">{primary}</div>}
      <a href={pdfHref || `/app/documents/${doc.id}/pdf?download`} className={buttonClass()}><Download className="size-4 shrink-0" aria-hidden />PDF</a>
      <div className="relative">
        <Button icon={MoreHorizontal} aria-label="More actions" aria-expanded={more} onClick={() => setMore(!more)} className="!px-2.5" />
        {more && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent" onClick={() => setMore(false)} />
            {/* phones: a sheet from the bottom; larger screens: a menu under the button */}
            <div role="menu" className="fixed inset-x-0 bottom-0 z-50 animate-rise rounded-t-2xl bg-surface p-2 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] ring-1 ring-line
              sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:mt-1 sm:w-60 sm:rounded-xl sm:p-1.5 sm:pb-1.5 xl:left-auto xl:right-0">
              <div className="flex items-center justify-between px-3 pb-1 pt-1 sm:hidden">
                <p className="text-[13px] font-semibold text-ink-2">{doc.number}</p>
                <button type="button" onClick={() => setMore(false)} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-hover"><X className="size-4" /></button>
              </div>
              {tools.map((t) => <Item key={t.key} s={t} />)}
              <div className="my-1 h-px bg-line" />
              {secondary.map((t) => <Item key={t.key} s={t} />)}
            </div>
          </>
        )}
      </div>

      <PaymentModal open={modal === "payment"} onClose={() => setModal(null)} doc={doc} balance={balance}
        onSubmit={(form) => run("pay", async () => { const r = await recordPayment(doc.id, form); if (!r.error) setModal(null); return r; })} pending={pending && busy === "pay"} />
      <ReturnModal open={modal === "return"} onClose={() => setModal(null)} pending={pending && busy === "return"}
        onSubmit={(reason) => run("return", async () => { const r = await returnToDraft(doc.id, reason); if (!r.error) setModal(null); return r; })} />
      <Modal open={modal === "void"} onClose={() => setModal(null)} title={`Void ${doc.number}?`} description="The customer's link will show it as cancelled. This can't be undone."
        footer={<><Button onClick={() => setModal(null)}>Keep it</Button><Button variant="destructive" icon={Ban} onClick={() => run("void", async () => { const r = await voidDocument(doc.id); setModal(null); return r; })}>Void document</Button></>}>
        <p className="text-sm text-ink-2">The number stays used so your records have no gaps.</p>
      </Modal>
      <Modal open={modal === "delete"} onClose={() => setModal(null)} title="Delete this draft?" description="It has never been sent, so it is removed completely."
        footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="destructive" icon={Trash2} onClick={() => run("delete", () => deleteDraft(doc.id, doc.kind))}>Delete draft</Button></>}>
        <p className="text-sm text-ink-2">Its number ({doc.number}) will be skipped.</p>
      </Modal>
    </div>
  );
}

function PaymentModal({ open, onClose, doc, balance, onSubmit, pending }) {
  const [form, setForm] = useState({ amount: minorToInput(balance), method: "bank_transfer", reference: "", date: new Date().toISOString().slice(0, 10), note: "", wht: "" });
  const [withheld, setWithheld] = useState(false);
  const [rate, setRate] = useState("5");
  // WHT is worked out on the amount before VAT: the share of this balance that isn't VAT
  const preVatShare = Number(doc.total_minor) > 0 ? (Number(doc.subtotal_minor) - Number(doc.discount_minor || 0)) / Number(doc.total_minor) : 1;
  const applyRate = (r, on = withheld) => {
    const pct = Number(r);
    if (!on || !Number.isFinite(pct)) return setForm((f) => ({ ...f, wht: on ? f.wht : "", amount: on ? f.amount : minorToInput(balance) }));
    const wht = Math.round(balance * preVatShare * pct / 100);
    setForm((f) => ({ ...f, wht: minorToInput(wht), amount: minorToInput(balance - wht) }));
  };
  const cash = toMinor(form.amount) || 0, whtMinor = withheld ? toMinor(form.wht) || 0 : 0;
  return (
    <Modal open={open} onClose={onClose} title="Record a payment" description={`Balance on ${doc.number}: ${doc.currency} ${minorToInput(balance)}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={pending ? Loader2 : Wallet} loading={pending} onClick={() => onSubmit({ ...form, wht: withheld ? form.wht : "" })}>Record & issue receipt</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={withheld ? "Amount that reached you" : "Amount received"} htmlFor="pa" hint={withheld ? undefined : "Less than the balance records a part payment."}><Input id="pa" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="How they paid" htmlFor="pm">
          <Select id="pm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="pos">POS</option><option value="other">Other</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Checkbox label="The customer deducted withholding tax (WHT)" description="Companies often keep back 5% or 10% and pay it to the tax office for you. It still counts towards the invoice."
            checked={withheld} onChange={(e) => { setWithheld(e.target.checked); applyRate(rate, e.target.checked); }} />
        </div>
        {withheld && (
          <>
            <Field label="WHT rate" htmlFor="pwr">
              <Select id="pwr" value={rate} onChange={(e) => { setRate(e.target.value); applyRate(e.target.value); }}>
                <option value="2">2%</option><option value="5">5%</option><option value="10">10%</option><option value="custom">Other amount</option>
              </Select>
            </Field>
            <Field label="WHT deducted" htmlFor="pw" hint="Worked out on the amount before VAT.">
              <Input id="pw" inputMode="decimal" value={form.wht} onChange={(e) => { setRate("custom"); setForm({ ...form, wht: e.target.value }); }} />
            </Field>
            <p className="text-[13px] text-ink-2 sm:col-span-2">Settles <strong className="text-ink">{formatMoney(cash + whtMinor, doc.currency)}</strong> of the {formatMoney(balance, doc.currency)} balance. Ask your customer for the WHT credit note and attach it under Files: you claim it against your own tax.</p>
          </>
        )}
        <Field label="Date received" htmlFor="pd"><Input id="pd" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Reference" htmlFor="pr" optional><Input id="pr" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Bank narration / teller no." /></Field>
        <Field label="Note" htmlFor="pn" optional className="sm:col-span-2"><Textarea id="pn" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
      <p className="mt-4 text-[13px] text-ink-3">Check your bank app first. Online payments (Stripe, Paystack, Flutterwave, Bachs) are recorded automatically, so don't add them here.</p>
    </Modal>
  );
}

function ReturnModal({ open, onClose, onSubmit, pending }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Return to draft" description="Tell the preparer what to change."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={pending ? Loader2 : Undo2} loading={pending} onClick={() => onSubmit(reason)}>Return with note</Button></>}>
      <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Add the delivery fee and check the quantity on line 2." aria-label="Reason" />
    </Modal>
  );
}
