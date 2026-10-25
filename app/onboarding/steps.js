"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Briefcase, Building2, Check, PlugZap, UserRound } from "lucide-react";
import { Callout, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui-client";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { finishOnboarding, saveBrand, saveMoney, startBusiness } from "./actions";
import { LogoInput } from "@/components/logo-input";

const SWATCHES = ["#1570EF", "#079455", "#7A5AF8", "#DC6803", "#D92D20", "#0E9384", "#101828", "#C11574"];

function StepCard({ title, description, children, footer }) {
  return (
    <Card className="animate-rise">
      <div className="border-b border-line px-6 py-5">
        <h1 className="text-title-1 text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      <div className="flex flex-col gap-6 px-6 py-6">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-subtle px-6 py-4">{footer}</div>}
    </Card>
  );
}

function ChoiceCard({ checked, onSelect, icon: Icon, title, description, points }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={checked}
      className={cx("flex flex-col gap-3 rounded-xl p-5 text-left ring-1 transition-shadow",
        checked ? "bg-brand-soft ring-2 ring-brand" : "bg-surface ring-line-strong hover:ring-ink-3")}>
      <div className="flex items-center justify-between">
        <span className={cx("inline-flex size-10 items-center justify-center rounded-full ring-1", checked ? "bg-brand text-white ring-brand" : "bg-surface text-ink-2 ring-line")}><Icon className="size-[18px]" /></span>
        <span className={cx("inline-flex size-5 items-center justify-center rounded-full ring-1", checked ? "bg-brand text-white ring-brand" : "ring-line-strong")}>{checked && <Check className="size-3" />}</span>
      </div>
      <div>
        <p className="text-title-3 text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>
      </div>
      <ul className="space-y-1.5 border-t border-line pt-3">
        {points.map((p) => <li key={p} className="flex gap-2 text-[13px] text-ink-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />{p}</li>)}
      </ul>
    </button>
  );
}

export function StepStart({ ownerName, firstBusiness }) {
  const [state, action] = useActionState(startBusiness, null);
  const [kind, setKind] = useState("freelancer");
  return (
    <form action={action}>
      <input type="hidden" name="kind" value={kind} />
      <StepCard
        title={firstBusiness ? "Welcome to Usetally" : "Add another business"}
        description="Tell us who you are. This appears on every quote, invoice and receipt you send."
        footer={<><span className="text-[13px] text-ink-3">You can change all of this later in Settings.</span><SubmitButton iconRight={ArrowRight} pendingText="Creating…">Continue</SubmitButton></>}>
        <FormMessage state={state} />
        <div>
          <p className="mb-2.5 text-[13px] font-medium text-ink-2">How will you use Usetally?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard checked={kind === "freelancer"} onSelect={() => setKind("freelancer")} icon={UserRound} title="Freelancer / solo"
              description="Just you, sending quotes to your clients." points={["One login", "Your name or brand on documents", "Hidden costs and profit per job"]} />
            <ChoiceCard checked={kind === "company"} onSelect={() => setKind("company")} icon={Building2} title="Company / team"
              description="Several people share the invoicing." points={["Invite finance, managers and juniors", "Approval before quotes go out", "Control who sees hidden costs"]} />
          </div>
        </div>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label={kind === "company" ? "Company name" : "Business or trading name"} htmlFor="name" hint="Shown at the top of your documents.">
            <Input id="name" name="name" placeholder={kind === "company" ? "Adeyemi Studio Ltd" : "Tolu Adeyemi Designs"} required />
          </Field>
          <Field label="Your name" htmlFor="owner_name"><Input id="owner_name" name="owner_name" defaultValue={ownerName} required /></Field>
          {kind === "company" && <Field label="Registered name" htmlFor="legal_name" optional><Input id="legal_name" name="legal_name" placeholder="As on your CAC certificate" /></Field>}
          <Field label="Business email" htmlFor="email" hint="Customers reply to this."><Input id="email" name="email" type="email" placeholder="hello@yourbusiness.com" /></Field>
          <Field label="Phone / WhatsApp" htmlFor="phone"><Input id="phone" name="phone" placeholder="+234 801 234 5678" /></Field>
          <Field label="Website" htmlFor="website" optional><Input id="website" name="website" placeholder="yourbusiness.com" /></Field>
          <Field label="Address" htmlFor="address" className="sm:col-span-2"><Input id="address" name="address" placeholder="12 Admiralty Way, Lekki Phase 1" /></Field>
          <Field label="City" htmlFor="city"><Input id="city" name="city" placeholder="Your city" /></Field>
          <Field label="Country" htmlFor="country"><Input id="country" name="country" placeholder="Your country" /></Field>
          <Field label="Main currency" htmlFor="currency"><Select id="currency" name="currency" defaultValue="NGN">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Tax ID (TIN)" htmlFor="tax_id" optional><Input id="tax_id" name="tax_id" /></Field>
        </div>
      </StepCard>
    </form>
  );
}

export function DocumentPreview({ name, color, logo, kind = "QUOTATION", currency = "NGN", footer }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white text-[#101828] shadow-[var(--shadow-pop)] ring-1 ring-[#eaecf0]" style={{ "--doc-brand": color }}>
      <div className="h-1.5 doc-brand-bg" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" className="h-10 max-w-[140px] object-contain" /> : <span className="text-[15px] font-bold">{name || "Your business"}</span>}
          <span className="text-right text-[11px] font-semibold tracking-[0.12em] doc-brand-text">{kind}<span className="mt-0.5 block font-mono text-[10px] tracking-normal text-[#98a2b3]">QT-0001</span></span>
        </div>
        <div className="mt-5 rounded-lg bg-[#f8f9fb] p-3 text-[11px]">
          <p className="text-[#98a2b3]">Prepared for</p><p className="font-semibold">Obi Foods Ltd</p>
        </div>
        <table className="mt-4 w-full text-[11px]">
          <thead><tr className="text-left text-white doc-brand-bg"><th className="rounded-l px-2 py-1.5 font-medium">Item</th><th className="rounded-r px-2 py-1.5 text-right font-medium">Amount</th></tr></thead>
          <tbody>
            <tr className="border-b border-[#eaecf0]"><td className="px-2 py-2">Brand identity design</td><td className="px-2 py-2 text-right tabular">{formatMoney(25000000, currency)}</td></tr>
            <tr className="border-b border-[#eaecf0]"><td className="px-2 py-2">Website build (5 pages)</td><td className="px-2 py-2 text-right tabular">{formatMoney(40000000, currency)}</td></tr>
          </tbody>
        </table>
        <div className="mt-3 flex justify-end"><div className="rounded-lg px-3 py-2 text-right text-white doc-brand-bg"><span className="block text-[10px] opacity-80">Total</span><span className="text-[15px] font-semibold tabular">{formatMoney(65000000, currency)}</span></div></div>
        {footer && <p className="mt-4 border-t border-[#eaecf0] pt-3 text-[10px] text-[#98a2b3]">{footer}</p>}
      </div>
    </div>
  );
}

export function StepBrand({ business, logo: initialLogo }) {
  const [state, action] = useActionState(saveBrand, null);
  const [color, setColor] = useState(business.brand_color || "#1570EF");
  const [logo, setLogo] = useState(initialLogo);
  const [footer, setFooter] = useState(business.footer_note || "");
  return (
    <form action={action}>
      <input type="hidden" name="business_id" value={business.id} />
      <StepCard title="Make it yours" description="Your logo and colour go on every document, email and payment page your customers see."
        footer={<><Link href="/onboarding?step=money" className="text-sm font-medium text-ink-2 hover:text-ink">Skip for now</Link><SubmitButton iconRight={ArrowRight} pendingText="Saving…">Continue</SubmitButton></>}>
        <FormMessage state={state} />
        <div className="grid gap-8 md:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-6">
            <Field label="Logo" hint="Any image, any size: PNG, JPG, SVG, WebP or a phone photo. We trim empty edges and resize it for you.">
              <LogoInput onChange={setLogo}>{({ busy, input, icon }) => (
                <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-line-strong bg-subtle p-4 hover:border-brand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logo && !busy ? <img src={logo} alt="" className="h-12 w-24 rounded bg-white object-contain ring-1 ring-line" /> : <span className="inline-flex size-12 items-center justify-center rounded-lg bg-surface ring-1 ring-line">{icon}</span>}
                  <span className="text-sm"><span className="font-medium text-brand-ink">{busy ? "Preparing…" : logo ? "Change logo" : "Upload logo"}</span><span className="block text-[13px] text-ink-3">Click to choose a file</span></span>
                  {input}
                </label>
              )}</LogoInput>
            </Field>
            <Field label="Brand colour" hint="Used for headings, the total box and the Pay button.">
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((s) => (
                  <button key={s} type="button" onClick={() => setColor(s)} aria-label={`Use ${s}`}
                    className={cx("size-9 rounded-full ring-offset-2 ring-offset-surface", color.toUpperCase() === s ? "ring-2 ring-ink" : "ring-1 ring-line")} style={{ background: s }} />
                ))}
                <label className="ml-1 flex h-9 items-center gap-2 rounded-md px-2 ring-1 ring-inset ring-line-strong">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" aria-label="Custom colour" />
                  <span className="font-mono text-xs text-ink-2">{color.toUpperCase()}</span>
                </label>
              </div>
              <input type="hidden" name="brand_color" value={color} />
            </Field>
            <Field label="Footer note" htmlFor="footer_note" optional hint="A short line at the bottom of each document, e.g. a thank-you or your RC number.">
              <Textarea id="footer_note" name="footer_note" rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Thank you for your business. RC 1234567." />
            </Field>
          </div>
          <div>
            <p className="mb-2.5 text-[13px] font-medium text-ink-2">Preview</p>
            <DocumentPreview name={business.name} color={color} logo={logo} currency={business.currency} footer={footer} />
          </div>
        </div>
      </StepCard>
    </form>
  );
}

export function StepMoney({ business }) {
  const [state, action] = useActionState(saveMoney, null);
  return (
    <form action={action}>
      <input type="hidden" name="business_id" value={business.id} />
      <StepCard title="Money & numbering" description="Defaults for new documents. You can override them on any quote or invoice."
        footer={<><Link href="/onboarding?step=brand" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />Back</Link><SubmitButton iconRight={ArrowRight} pendingText="Saving…">Continue</SubmitButton></>}>
        <FormMessage state={state} />
        <section className="grid gap-4 sm:grid-cols-3">
          <Field label="Currency" htmlFor="currency"><Select id="currency" name="currency" defaultValue={business.currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Tax name" htmlFor="tax_label"><Input id="tax_label" name="tax_label" defaultValue={business.tax_label} /></Field>
          <Field label="Tax rate (%)" htmlFor="tax_rate" hint="Your local VAT or sales tax rate. Use 0 if you don't charge it."><Input id="tax_rate" name="tax_rate" type="number" step="0.01" min="0" max="100" defaultValue={business.tax_rate} /></Field>
          <Field label="Quotes are valid for (days)" htmlFor="qv"><Input id="qv" name="quote_validity_days" type="number" min="1" max="365" defaultValue={business.quote_validity_days} /></Field>
          <Field label="Invoices are due after (days)" htmlFor="idd"><Input id="idd" name="invoice_due_days" type="number" min="0" max="365" defaultValue={business.invoice_due_days} /></Field>
        </section>
        <section>
          <p className="mb-2.5 text-[13px] font-medium text-ink-2">Numbering</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quote prefix" htmlFor="qp" hint="e.g. QT-0001"><Input id="qp" name="quote_prefix" defaultValue={business.quote_prefix} maxLength={8} /></Field>
            <Field label="Invoice prefix" htmlFor="ip" hint="e.g. INV-0001"><Input id="ip" name="invoice_prefix" defaultValue={business.invoice_prefix} maxLength={8} /></Field>
            <Field label="Receipt prefix" htmlFor="rp" hint="e.g. RCT-0001"><Input id="rp" name="receipt_prefix" defaultValue={business.receipt_prefix} maxLength={8} /></Field>
          </div>
        </section>
        <section>
          <p className="text-[13px] font-medium text-ink-2">Bank details for transfers</p>
          <p className="mb-2.5 text-xs text-ink-3">Printed on invoices so customers can pay by transfer. You record those payments yourself.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Bank" htmlFor="bn"><Input id="bn" name="bank_name" defaultValue={business.bank_name} placeholder="GTBank" /></Field>
            <Field label="Account name" htmlFor="ban"><Input id="ban" name="bank_account_name" defaultValue={business.bank_account_name || business.name} /></Field>
            <Field label="Account number" htmlFor="bno"><Input id="bno" name="bank_account_number" defaultValue={business.bank_account_number} inputMode="numeric" /></Field>
          </div>
        </section>
        <Field label="Default terms" htmlFor="terms" optional hint="Added to new documents. Edit per document if needed.">
          <Textarea id="terms" name="default_terms" rows={3} defaultValue={business.default_terms} placeholder="70% deposit before work starts, balance on delivery. Prices valid for the period stated." />
        </Field>
      </StepCard>
    </form>
  );
}

export function StepFinish({ business }) {
  const [state, action] = useActionState(finishOnboarding, null);
  const company = business.kind === "company";
  return (
    <form action={action}>
      <input type="hidden" name="business_id" value={business.id} />
      <StepCard title="Almost done" description={company ? "Invite your team now, or later from Settings → Team." : "Last step: how do you want to get paid?"}
        footer={<><Link href="/onboarding?step=money" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />Back</Link>
          <div className="flex flex-wrap gap-2"><SubmitButton variant="secondary" name="next" value="payments" icon={PlugZap}>Finish & connect payments</SubmitButton><SubmitButton iconRight={ArrowRight} name="next" value="app" pendingText="Finishing…">Go to dashboard</SubmitButton></div></>}>
        <FormMessage state={state} />
        {company && (
          <section className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <Field label="Invite teammates" htmlFor="invites" optional hint="Separate emails with commas. Each gets a link to join.">
              <Textarea id="invites" name="invites" rows={3} placeholder="funmi@company.com, jide@company.com" />
            </Field>
            <Field label="Their role" htmlFor="invite_role">
              <Select id="invite_role" name="invite_role" defaultValue="finance">
                <option value="manager">Manager</option>
                <option value="finance">Finance officer</option>
                <option value="junior_finance">Junior finance</option>
              </Select>
            </Field>
          </section>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-tray p-4">
            <Briefcase className="size-5 text-brand" />
            <p className="mt-2 text-title-3 text-ink">Online payments</p>
            <p className="mt-1 text-[13px] text-ink-2">Connect Stripe, Paystack, Flutterwave or Bachs so customers can pay by card or transfer from the quote link. A paid quote becomes a paid invoice with a receipt.</p>
          </div>
          <div className="rounded-xl bg-tray p-4">
            <Building2 className="size-5 text-success" />
            <p className="mt-2 text-title-3 text-ink">Bank transfer</p>
            <p className="mt-1 text-[13px] text-ink-2">Works straight away. Customers see your bank details, and you record payments when they arrive.</p>
          </div>
        </div>
        <Callout tone="info">The setup guide takes about 5 minutes. It only shows <strong>Connected</strong> after a real test payment reaches Usetally.</Callout>
      </StepCard>
    </form>
  );
}
