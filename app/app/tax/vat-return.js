"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDot, FileCheck2, Hourglass, Paperclip, Send, UserRoundCheck, Wallet } from "lucide-react";
import { Badge, Button, Card, Field, Input, Textarea, cx } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { formatMoney, minorToInput } from "@/lib/money";
import { fileVatMyself, markVatPaid, requestVatFiling } from "./actions";

// One month's VAT return, from "to file" to "done", with both ways to get there.
const STEPS = [["to_file", "To file"], ["requested", "With consultant"], ["filed", "Filed · to pay"], ["done", "Done"]];
const TONE = { to_file: "warn", requested: "info", filed: "violet", done: "success" };

export function VatReturnCard({ period, label, due, dueLabel, vat, currency, ret, files, consultant, fee, canAct, overdue }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [modal, setModal] = useState(null); // request | self | paid
  const [note, setNote] = useState("");
  const status = ret?.status || "to_file";
  const money = (v) => formatMoney(v, currency);
  const run = (fn) => start(async () => {
    const r = await fn();
    if (r?.error) return toast.error(r.error);
    toast.success(r.message);
    setModal(null);
    router.refresh();
  });
  const submitForm = (fn) => (e) => { e.preventDefault(); const form = new FormData(e.currentTarget); run(() => fn(period, form)); };
  const idx = STEPS.findIndex(([k]) => k === status);
  const shown = status === "to_file" && ret?.mode !== "assisted" ? STEPS.filter(([k]) => k !== "requested") : STEPS;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-3">{label} VAT return</p>
          <p className="mt-0.5 text-[22px] font-semibold tabular-nums text-ink">{money(status === "filed" || status === "done" ? ret.amount_due_minor ?? vat : vat)}</p>
          <p className={cx("text-[13px]", overdue && status !== "done" ? "font-medium text-danger-ink" : "text-ink-2")}>{status === "done" ? `Paid · ${new Date(ret.done_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : `Due ${dueLabel}${overdue ? " · overdue" : ""}`}</p>
        </div>
        <Badge tone={TONE[status]}>{STEPS[idx][1]}</Badge>
      </div>

      {/* where it is: a simple track */}
      <ol className="flex items-center gap-2 overflow-x-auto px-5 py-3 text-[12px]" aria-label="Progress">
        {shown.map(([k, name], i) => {
          const reached = STEPS.findIndex(([s]) => s === k) <= idx;
          return (
            <li key={k} className="flex shrink-0 items-center gap-2">
              {i > 0 && <span aria-hidden="true" className={cx("h-px w-6", reached ? "bg-brand" : "bg-line-strong")} />}
              <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium", k === status ? "bg-brand-soft text-brand-ink" : reached ? "text-ink-2" : "text-ink-3")}>
                {reached ? <CheckCircle2 className="size-3.5" /> : <CircleDot className="size-3.5" />}{name}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-4 border-t border-line px-5 py-4 text-[13.5px] text-ink-2">
        {status === "to_file" && (
          vat > 0 ? <p>You charged <strong className="text-ink">{money(vat)}</strong> VAT on invoices issued in {label}. File it by {dueLabel}.</p>
            : <p>No VAT on invoices in {label}. If you're registered for VAT you may still need to file a nil return.</p>
        )}
        {status === "requested" && (
          <p className="flex gap-2"><UserRoundCheck className="mt-0.5 size-4 shrink-0 text-info" />
            <span>Requested {ret.requested_at ? new Date(ret.requested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}. {consultant ? <><strong className="text-ink">{consultant}</strong>, a tax consultant working with Usetally,</> : "A tax consultant working with Usetally"} will contact you to get access in Rev360. Never share your Rev360 password: give them access from your account instead.</span></p>
        )}
        {status === "filed" && (
          <div className="rounded-xl bg-violet-soft/60 p-3.5 ring-1 ring-violet/20">
            <p className="font-medium text-ink">Filed{ret.filed_by_name ? ` by ${ret.filed_by_name}` : ""}. Now pay it by {dueLabel}.</p>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
              <div><dt className="text-[12px] text-ink-3">Amount to pay</dt><dd className="font-semibold tabular-nums text-ink">{money(ret.amount_due_minor ?? vat)}</dd></div>
              <div><dt className="text-[12px] text-ink-3">Payment reference</dt><dd className="font-mono text-ink">{ret.payment_reference || "See Rev360"}</dd></div>
              {ret.filing_reference && <div><dt className="text-[12px] text-ink-3">Filing reference</dt><dd className="font-mono text-ink">{ret.filing_reference}</dd></div>}
            </dl>
            <p className="mt-2 text-[12.5px]">Pay on Rev360, Remita or through your bank. Usetally never takes the money.</p>
          </div>
        )}
        {status === "done" && <p className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />Filed and paid. Proof is kept below.</p>}

        {files?.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {files.map((f) => (
              <li key={f.id}><a href={`/app/tax/returns/${ret.id}/files/${f.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-ink ring-1 ring-line hover:bg-hover">
                <Paperclip className="size-3.5" />{f.kind === "acknowledgement" ? "Filing acknowledgement" : f.kind === "payment_receipt" ? "Payment receipt" : f.name}</a></li>
            ))}
          </ul>
        )}

        {canAct && status === "to_file" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" icon={Send} onClick={() => setModal("request")} className="sm:flex-none">File &amp; pay for me</Button>
            <Button icon={FileCheck2} onClick={() => setModal("self")}>I'll file it myself</Button>
          </div>
        )}
        {canAct && status === "requested" && <Button icon={FileCheck2} onClick={() => setModal("self")} className="self-start">I filed it myself instead</Button>}
        {canAct && status === "filed" && <Button variant="primary" icon={Wallet} onClick={() => setModal("paid")} className="self-start">I've paid</Button>}
        {!canAct && status !== "done" && <p className="text-[12.5px] text-ink-3">An owner, manager or finance officer handles VAT returns.</p>}
      </div>

      <Modal open={modal === "request"} onClose={() => setModal(null)} title={`File & pay ${label} VAT for me`}
        description={fee ? `${money(fee)} per return.` : "Free while we test this."}
        footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" icon={Send} loading={pending} onClick={() => run(() => requestVatFiling(period, note))}>Send request</Button></>}>
        <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] text-ink-2">
          <li>A tax consultant working with Usetally gets your {label} numbers and invoice list.</li>
          <li>They contact you to get access in Rev360. You give access from your account: never share your password.</li>
          <li>They file, and you get the amount and payment reference by email and here.</li>
          <li>You pay from your own bank, then tap "I've paid". Usetally keeps the receipt.</li>
        </ol>
        <Field label="Anything they should know?" htmlFor="vat-note" optional className="mt-4">
          <Textarea id="vat-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. We also had a refund this month" />
        </Field>
      </Modal>

      <Modal open={modal === "self"} onClose={() => setModal(null)} title={`Mark ${label} VAT as filed`} description="After you've submitted the return on Rev360.">
        <form onSubmit={submitForm(fileVatMyself)} className="flex flex-col gap-3">
          <Field label="Amount to pay" htmlFor="vf-amount"><Input id="vf-amount" name="amount" inputMode="decimal" defaultValue={minorToInput(vat)} /></Field>
          <Field label="Payment reference" htmlFor="vf-pref" optional><Input id="vf-pref" name="paymentReference" placeholder="From Rev360 / Remita" /></Field>
          <Field label="Filing reference" htmlFor="vf-ref" optional><Input id="vf-ref" name="reference" /></Field>
          <Field label="Filing acknowledgement" htmlFor="vf-file" optional hint="PDF or screenshot, up to 4 MB."><Input id="vf-file" name="file" type="file" accept=".pdf,image/*" /></Field>
          <div className="mt-1 flex justify-end gap-2"><Button onClick={() => setModal(null)}>Cancel</Button><Button type="submit" variant="primary" icon={FileCheck2} loading={pending}>Mark as filed</Button></div>
        </form>
      </Modal>

      <Modal open={modal === "paid"} onClose={() => setModal(null)} title={`${label} VAT paid?`} description={`${money(ret?.amount_due_minor ?? vat)}${ret?.payment_reference ? ` · ref ${ret.payment_reference}` : ""}`}>
        <form onSubmit={submitForm(markVatPaid)} className="flex flex-col gap-3">
          <Field label="Payment receipt" htmlFor="vp-file" optional hint="Keeping it here means it's never lost."><Input id="vp-file" name="file" type="file" accept=".pdf,image/*" /></Field>
          <div className="mt-1 flex justify-end gap-2"><Button onClick={() => setModal(null)}>Cancel</Button><Button type="submit" variant="primary" icon={CheckCircle2} loading={pending}>Mark as paid</Button></div>
        </form>
      </Modal>
    </Card>
  );
}

// in a quarter or year: each month's return at a glance
export function VatReturnsList({ months, currency }) {
  return (
    <Card>
      <div className="border-b border-line px-5 py-4"><p className="text-[15px] font-semibold text-ink">VAT returns</p><p className="text-[13px] text-ink-3">Filed monthly. Open a month to file or pay.</p></div>
      <ul className="divide-y divide-line">
        {months.map((m) => (
          <li key={m.key}>
            <a href={`/app/tax?period=${m.key}`} className="flex items-center gap-3 px-5 py-3 hover:bg-hover">
              {m.status === "done" ? <CheckCircle2 className="size-4 text-success" /> : <Hourglass className={cx("size-4", m.overdue ? "text-danger" : "text-ink-3")} />}
              <span className="flex-1 text-[14px] text-ink">{m.label}</span>
              <span className="text-[13px] tabular-nums text-ink-2">{formatMoney(m.vat, currency)}</span>
              <Badge size="sm" tone={m.overdue && m.status !== "done" ? "danger" : TONE[m.status]}>{m.overdue && m.status !== "done" ? "Overdue" : STEPS.find(([k]) => k === m.status)[1]}</Badge>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
