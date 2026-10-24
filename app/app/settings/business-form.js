"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useStepUp } from "@/components/step-up";
import { ImagePlus, Save } from "lucide-react";
import { Card, CardHeader, Checkbox, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { SubmitButton, Switch, useActionToast, FormMessage } from "@/components/ui-client";
import { CURRENCIES } from "@/lib/money";
import { DocumentPreview } from "@/app/onboarding/steps";
import { updateBusiness } from "./actions";

const SWATCHES = ["#1570EF", "#079455", "#7A5AF8", "#DC6803", "#D92D20", "#0E9384", "#101828", "#C11574"];

export function BusinessForm({ business: b, logo: initialLogo }) {
  const [state, action] = useActionState(updateBusiness, null);
  useActionToast(state);
  const formRef = useRef(null);
  const { ask, dialog: stepUpDialog } = useStepUp();
  // changing bank details needs the emailed code; after it's verified, save again
  useEffect(() => {
    if (state?.stepUp) ask(state.stepUp).then((ok) => ok && formRef.current?.requestSubmit());
  }, [state, ask]);
  const [color, setColor] = useState(b.brand_color);
  const [logo, setLogo] = useState(initialLogo);
  const [approval, setApproval] = useState(b.require_approval);
  const [footer, setFooter] = useState(b.footer_note || "");
  return (
    <form ref={formRef} action={action} className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_320px]">
      {stepUpDialog}
      <div className="flex min-w-0 flex-col gap-6">
        <FormMessage state={state} />
        <Card>
          <CardHeader title="Branding" description="Logo, colour and footer on documents." />
          <div className="flex flex-col gap-5 p-5">
            <Field label="Logo" hint="PNG or JPG under 1 MB. (WebP works on screen but PDFs will show your name instead.)">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong bg-subtle p-3 pr-5 hover:border-brand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logo ? <img src={logo} alt="" className="h-12 w-28 rounded bg-white object-contain ring-1 ring-line" /> : <span className="inline-flex size-12 items-center justify-center rounded-lg bg-surface ring-1 ring-line"><ImagePlus className="size-5 text-ink-3" /></span>}
                  <span className="text-sm font-medium text-brand-ink">{logo ? "Replace logo" : "Upload logo"}</span>
                  <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setLogo(URL.createObjectURL(f)); }} />
                </label>
                {initialLogo && <Checkbox name="remove_logo" label="Remove logo" />}
              </div>
            </Field>
            <Field label="Brand colour">
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((s) => <button key={s} type="button" onClick={() => setColor(s)} aria-label={`Use ${s}`} className={cx("size-9 rounded-full ring-offset-2 ring-offset-surface", color.toUpperCase() === s ? "ring-2 ring-ink" : "ring-1 ring-line")} style={{ background: s }} />)}
                <label className="ml-1 flex h-9 items-center gap-2 rounded-md px-2 ring-1 ring-inset ring-line-strong">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="size-6 cursor-pointer border-0 bg-transparent p-0" aria-label="Custom colour" />
                  <span className="font-mono text-xs text-ink-2">{color.toUpperCase()}</span>
                </label>
              </div>
              <input type="hidden" name="brand_color" value={color} />
            </Field>
            <Field label="Footer note" htmlFor="footer" optional><Textarea id="footer" name="footer_note" rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Business details" description="Shown in the 'From' section." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Business name" htmlFor="name"><Input id="name" name="name" defaultValue={b.name} required /></Field>
            <Field label="Registered name" htmlFor="legal" optional><Input id="legal" name="legal_name" defaultValue={b.legal_name} /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={b.email} /></Field>
            <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" defaultValue={b.phone} /></Field>
            <Field label="Address" htmlFor="addr" className="sm:col-span-2"><Input id="addr" name="address" defaultValue={b.address} /></Field>
            <Field label="City" htmlFor="city"><Input id="city" name="city" defaultValue={b.city} /></Field>
            <Field label="Country" htmlFor="country"><Input id="country" name="country" defaultValue={b.country} /></Field>
            <Field label="Website" htmlFor="web" optional><Input id="web" name="website" defaultValue={b.website} /></Field>
            <Field label="Tax ID (TIN)" htmlFor="tin" optional><Input id="tin" name="tax_id" defaultValue={b.tax_id} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Money & numbering" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Currency" htmlFor="cur" hint="For new documents."><Select id="cur" name="currency" defaultValue={b.currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Tax name" htmlFor="tl"><Input id="tl" name="tax_label" defaultValue={b.tax_label} /></Field>
            <Field label="Tax rate (%)" htmlFor="tr"><Input id="tr" name="tax_rate" type="number" step="0.01" min="0" max="100" defaultValue={b.tax_rate} /></Field>
            <Field label="Quote validity (days)" htmlFor="qv"><Input id="qv" name="quote_validity_days" type="number" min="1" max="365" defaultValue={b.quote_validity_days} /></Field>
            <Field label="Invoice due after (days)" htmlFor="id"><Input id="id" name="invoice_due_days" type="number" min="0" max="365" defaultValue={b.invoice_due_days} /></Field>
            <div />
            <Field label="Quote prefix" htmlFor="qp" hint={`Next: ${b.quote_prefix}-${String(b.quote_seq + 1).padStart(4, "0")}`}><Input id="qp" name="quote_prefix" defaultValue={b.quote_prefix} maxLength={8} /></Field>
            <Field label="Invoice prefix" htmlFor="ip" hint={`Next: ${b.invoice_prefix}-${String(b.invoice_seq + 1).padStart(4, "0")}`}><Input id="ip" name="invoice_prefix" defaultValue={b.invoice_prefix} maxLength={8} /></Field>
            <Field label="Receipt prefix" htmlFor="rp" hint={`Next: ${b.receipt_prefix}-${String(b.receipt_seq + 1).padStart(4, "0")}`}><Input id="rp" name="receipt_prefix" defaultValue={b.receipt_prefix} maxLength={8} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bank details" description="Printed on invoices for customers who pay by transfer." />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Bank" htmlFor="bn"><Input id="bn" name="bank_name" defaultValue={b.bank_name} /></Field>
            <Field label="Account name" htmlFor="ban"><Input id="ban" name="bank_account_name" defaultValue={b.bank_account_name} /></Field>
            <Field label="Account number" htmlFor="bno"><Input id="bno" name="bank_account_number" defaultValue={b.bank_account_number} inputMode="numeric" /></Field>
            <Field label="Default terms" htmlFor="terms" className="sm:col-span-3"><Textarea id="terms" name="default_terms" rows={3} defaultValue={b.default_terms} /></Field>
          </div>
        </Card>

        {b.kind === "company" && (
          <Card className="p-5">
            <Switch name="require_approval" checked={approval} onChange={setApproval} label="Junior finance drafts need approval"
              description="When on, quotes and invoices prepared by junior finance must be approved by a manager or finance officer before reaching the customer." />
          </Card>
        )}
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2.5 text-[13px] font-medium text-ink-2">Preview</p>
        <DocumentPreview name={b.name} color={color} logo={logo} currency={b.currency} footer={footer} />
      </aside>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur lg:left-[264px]">
        <div className="mx-auto flex max-w-[1200px] justify-end px-4 py-3 sm:px-6 lg:px-8"><SubmitButton icon={Save} pendingText="Saving…">Save changes</SubmitButton></div>
      </div>
    </form>
  );
}
