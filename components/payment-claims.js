"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Landmark, Loader2, XCircle } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { minorToInput } from "@/lib/money";
import { confirmPaymentClaim, rejectPaymentClaim } from "@/app/app/documents/actions";

// Customers who paid by bank transfer and pressed "I've sent it". Check the
// bank, then confirm (payment + receipt) or say it hasn't arrived.
export function PaymentClaims({ claims, documentId, currency, canConfirm }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  if (!claims?.length) return null;

  const run = (fn, done) => start(async () => {
    const r = await fn();
    if (r?.error) return toast.error(r.error);
    toast.success(r.message);
    done();
    router.refresh();
  });

  return (
    <section className="overflow-hidden rounded-2xl bg-surface ring-2 ring-brand/40">
      <div className="flex items-start gap-3 border-b border-line bg-brand-soft px-5 py-3.5">
        <Landmark className="mt-0.5 size-5 shrink-0 text-brand-ink" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{claims.length === 1 ? "Your customer says they've paid" : `${claims.length} transfers to check`}</p>
          <p className="text-[13px] text-ink-2">Check your bank account first. Nothing is recorded until you confirm.</p>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {claims.map((c) => (
          <li key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-semibold tabular-nums text-ink">{c.amountLabel}</p>
              <p className="text-[13px] text-ink-2">From <strong className="font-medium text-ink">{c.payer_name || "your customer"}</strong> · paid {c.paidLabel} · told you {c.when}</p>
              {c.note && <p className="mt-1 text-[13px] text-ink-2">"{c.note}"</p>}
              {c.file_id && <a href={`/app/documents/${documentId}/files/${c.file_id}`} target="_blank" rel="noopener" className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-ink hover:underline"><FileText className="size-4" />View their proof</a>}
            </div>
            {canConfirm ? (
              <div className="flex gap-2">
                <Button icon={XCircle} onClick={() => { setReason(""); setRejecting(c); }} className="flex-1 sm:flex-none">Not received</Button>
                <Button variant="primary" icon={CheckCircle2} onClick={() => { setAmount(minorToInput(c.amount_minor)); setConfirming(c); }} className="flex-1 sm:flex-none">Confirm</Button>
              </div>
            ) : <p className="text-[13px] text-ink-3">A manager or finance officer confirms this.</p>}
          </li>
        ))}
      </ul>

      <Modal open={Boolean(confirming)} onClose={() => setConfirming(null)} title="Confirm the money arrived?"
        description="This records the payment, marks the invoice and issues the receipt."
        footer={<><Button onClick={() => setConfirming(null)}>Cancel</Button><Button variant="primary" loading={pending} icon={pending ? Loader2 : CheckCircle2}
          onClick={() => run(() => confirmPaymentClaim(confirming.id, amount), () => setConfirming(null))}>Confirm & issue receipt</Button></>}>
        <Field label={`Amount that arrived (${currency})`} htmlFor="cc-amount" hint="Change it if a different amount reached your account.">
          <Input id="cc-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </Modal>
      <Modal open={Boolean(rejecting)} onClose={() => setRejecting(null)} title="Not received?"
        description="Your customer sees this note on their link and can tell you again."
        footer={<><Button onClick={() => setRejecting(null)}>Cancel</Button><Button variant="destructive" loading={pending} icon={XCircle}
          onClick={() => run(() => rejectPaymentClaim(rejecting.id, reason), () => setRejecting(null))}>Mark as not received</Button></>}>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Note for your customer" placeholder="e.g. We haven't seen it yet. Please check it went to the right account." />
      </Modal>
    </section>
  );
}
