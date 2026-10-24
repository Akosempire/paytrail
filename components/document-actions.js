"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Pencil, Trash2, ShieldCheck, Undo2, FileOutput, Ban, Copy, Wallet, Mail, Download, MoreHorizontal, Loader2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { minorToInput } from "@/lib/money";
import { convertToInvoice, deleteDraft, duplicateDocument, recordPayment, resendEmail, returnToDraft, sendDocument, submitForApproval, voidDocument } from "@/app/app/documents/actions";

export function DocumentActions({ doc, perms, emailReady, balance }) {
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
  secondary.push({ key: "dup", label: `Duplicate as ${quote ? "quote" : "invoice"}`, icon: Copy, onClick: () => run("dup", () => duplicateDocument(doc.id)) });
  if (quote) secondary.push({ key: "dupi", label: "Copy into a new invoice", icon: Copy, onClick: () => run("dupi", () => duplicateDocument(doc.id, "invoice")) });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button href={`/app/documents/${doc.id}/pdf`} icon={Download} variant="secondary" target="_blank">PDF</Button>
      {primary}
      <div className="relative">
        <Button variant="secondary" icon={MoreHorizontal} aria-label="More actions" onClick={() => setMore(!more)} className="!px-2.5" />
        {more && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMore(false)} />
            <div className="absolute right-0 z-30 mt-1 w-56 animate-rise rounded-xl bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-line">
              {secondary.map((s) => (
                <button key={s.key} type="button" onClick={s.onClick}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium hover:bg-hover ${s.danger ? "text-danger-ink" : "text-ink"}`}>
                  <s.icon className="size-4" />{s.label}
                </button>
              ))}
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
  const [form, setForm] = useState({ amount: minorToInput(balance), method: "bank_transfer", reference: "", date: new Date().toISOString().slice(0, 10), note: "" });
  return (
    <Modal open={open} onClose={onClose} title="Record a payment" description={`Balance on ${doc.number}: ${doc.currency} ${minorToInput(balance)}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={pending ? Loader2 : Wallet} loading={pending} onClick={() => onSubmit(form)}>Record & issue receipt</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount received" htmlFor="pa" hint="Less than the balance records a part payment."><Input id="pa" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="How they paid" htmlFor="pm">
          <Select id="pm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="pos">POS</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Date received" htmlFor="pd"><Input id="pd" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Reference" htmlFor="pr" optional><Input id="pr" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Bank narration / teller no." /></Field>
        <Field label="Note" htmlFor="pn" optional className="sm:col-span-2"><Textarea id="pn" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
      <p className="mt-4 text-[13px] text-ink-3">Check your bank app first. Online payments through Bachs or Flutterwave are recorded automatically, so don't add them here.</p>
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
