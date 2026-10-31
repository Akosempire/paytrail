"use client";
import { CountrySelect } from "@/components/country-select";
import { RegionSelect, TaxFields } from "@/components/tax-fields";
import { countryByName } from "@/lib/countries";
import { useActionState, useEffect, useState } from "react";
import { GUEST_KEY, readGuestDraft } from "@/lib/guest-draft";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Briefcase, Building2, Check, PlugZap, Receipt, UserRound } from "lucide-react";
import { Callout, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui-client";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { finishOnboarding, saveBrand, saveMoney, startBusiness } from "./actions";
import { LogoInput } from "@/components/logo-input";
import { TermsField } from "@/components/terms-field";
import { BankPicker } from "@/components/bank-picker";
import { DueDaysField, PrefixField } from "@/components/invoice-defaults";

const SWATCHES = ["#1570EF", "#079455", "#7A5AF8", "#DC6803", "#D92D20", "#0E9384", "#101828", "#C11574"];

// One onboarding step. The actions (Continue, Skip, Back) sit in a bar
// fixed to the bottom of the screen, so they're always in reach without
// scrolling, on phones and desktops alike.
function StepCard({ title, description, children, footer }) {
  return (
    <>
      <Card className="animate-rise">
        <div className="border-b border-line px-5 py-4 sm:px-6 sm:py-5">
          <h1 className="text-title-2 text-ink sm:text-title-1">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
        </div>
        <div className="flex flex-col gap-5 px-5 py-5 sm:gap-6 sm:px-6 sm:py-6">{children}</div>
      </Card>
      {footer && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgb(16_24_40/.25)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-[880px] items-center gap-3 px-4 py-3 sm:px-6">{footer}</div>
        </div>
      )}
    </>
  );
}

// optional fields, folded away until wanted
function More({ label, children }) {
  return (
    <details className="group rounded-xl ring-1 ring-line [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink-2 hover:text-ink">
        {label}
        <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

const backLink = (href) => (
  <Link href={href} aria-label="Back" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink-2 hover:text-ink">
    <ArrowLeft className="size-4" /><span className="max-sm:sr-only">Back</span>
  </Link>
);
const skipLink = (href, label = "Skip for now") => (
  <Link href={href} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-ink-2 hover:text-ink">{label}</Link>
);

function ChoiceCard({ checked, onSelect, icon: Icon, title, description, points }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={checked}
      className={cx("flex flex-col gap-3 rounded-xl p-3.5 text-left ring-1 transition-shadow sm:p-5",
        checked ? "bg-brand-soft ring-2 ring-brand" : "bg-surface ring-line-strong hover:ring-ink-3")}>
      <div className="flex items-center gap-3">
        <span className={cx("inline-flex size-10 shrink-0 items-center justify-center rounded-full ring-1", checked ? "bg-brand text-white ring-brand" : "bg-surface text-ink-2 ring-line")}><Icon className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink sm:text-title-3">{title}</p>
          <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>
        </div>
        <span className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-full ring-1", checked ? "bg-brand text-white ring-brand" : "ring-line-strong")}>{checked && <Check className="size-3" />}</span>
      </div>
      <ul className="hidden space-y-1.5 border-t border-line pt-3 sm:block">
        {points.map((p) => <li key={p} className="flex gap-2 text-[13px] text-ink-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />{p}</li>)}
      </ul>
    </button>
  );
}

export function StepStart({ ownerName, firstBusiness, ipCountry }) {
  const [state, action] = useActionState(startBusiness, null);
  const [kind, setKind] = useState("freelancer");
  const [currency, setCurrency] = useState("NGN");
  // Canada asks for the province: it decides GST, HST, PST or QST
  const [countryCode, setCountryCode] = useState("");
  const [region, setRegion] = useState("");
  // started an invoice on /try first: bring over what they typed about their business
  useEffect(() => {
    let b = null;
    try { b = readGuestDraft(localStorage.getItem(GUEST_KEY), Date.now(), CURRENCIES)?.business; } catch { b = null; }
    if (!b) return;
    if (b.currency) setCurrency(b.currency);
    for (const k of ["name", "email", "phone", "address"]) {
      const el = document.getElementById(k);
      if (el && !el.value && b[k]) el.value = b[k];
    }
  }, []);
  return (
    <form action={action}>
      <input type="hidden" name="kind" value={kind} />
      <StepCard
        title={firstBusiness ? "Welcome to Usetally" : "Add another business"}
        description="Tell us who you are. This appears on every quote, invoice and receipt you send."
        footer={<><span className="flex-1 text-[13px] text-ink-3 max-sm:hidden">You can change all of this later in Settings.</span><SubmitButton size="lg" iconRight={ArrowRight} pendingText="Creating…" className="max-sm:flex-1">Continue</SubmitButton></>}>
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
          <CountrySelect guess ipCountry={ipCountry} onPick={(c) => { setCountryCode(c?.code || ""); setRegion(""); if (c && CURRENCIES.includes(c.currency)) setCurrency(c.currency); }} />
          <RegionSelect countryCode={countryCode} value={region} onChange={setRegion} />
          <Field label="Main currency" htmlFor="currency"><Select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <More label="Add contact details (optional)">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {kind === "company" && <Field label="Registered name" htmlFor="legal_name" optional><Input id="legal_name" name="legal_name" placeholder="As on your CAC certificate" /></Field>}
            <Field label="Business email" htmlFor="email" hint="Customers reply to this."><Input id="email" name="email" type="email" placeholder="hello@yourbusiness.com" /></Field>
            <Field label="Phone / WhatsApp" htmlFor="phone"><Input id="phone" name="phone" placeholder="+234 801 234 5678" /></Field>
            <Field label="Website" htmlFor="website" optional><Input id="website" name="website" placeholder="yourbusiness.com" /></Field>
            <Field label="Address" htmlFor="address" className="sm:col-span-2"><Input id="address" name="address" placeholder="12 Admiralty Way, Lekki Phase 1" /></Field>
            <Field label="City" htmlFor="city"><Input id="city" name="city" placeholder="Your city" /></Field>
            <Field label="Tax ID (TIN)" htmlFor="tax_id" optional><Input id="tax_id" name="tax_id" /></Field>
          </div>
        </More>
      </StepCard>
    </form>
  );
}

export function DocumentPreview({ name, color, logo, kind = "QUOTATION", currency = "NGN", footer, number = "QT-0001", note }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white text-[#101828] shadow-[var(--shadow-pop)] ring-1 ring-[#eaecf0]" style={{ "--doc-brand": color }}>
      <div className="h-1.5 doc-brand-bg" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" className="h-10 max-w-[140px] object-contain" /> : <span className="text-[15px] font-bold">{name || "Your business"}</span>}
          <span className="text-right text-[11px] font-semibold tracking-[0.12em] doc-brand-text">{kind}<span className="mt-0.5 block font-mono text-[10px] tracking-normal text-[#98a2b3]">{number}</span></span>
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
        {note && <div className="mt-4 space-y-0.5 text-[10px] text-[#475467]">{note}</div>}
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
        footer={<>{skipLink("/onboarding?step=money")}<span className="flex-1 max-sm:hidden" /><SubmitButton size="lg" iconRight={ArrowRight} pendingText="Saving…" className="max-sm:flex-1">Continue</SubmitButton></>}>
        <FormMessage state={state} />
        <div className="grid gap-8 md:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-6">
            <Field label="Logo" hint="Any image, any size: PNG, JPG, SVG, WebP or a phone photo. We trim empty edges and resize it for you.">
              <LogoInput onChange={setLogo}>{({ busy, input, icon, over, dropProps }) => (
                <label {...dropProps} className={cx("flex cursor-pointer items-center gap-4 rounded-xl border border-dashed bg-subtle p-4 hover:border-brand", over ? "border-brand bg-brand-soft" : "border-line-strong")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logo && !busy ? <img src={logo} alt="" className="h-12 w-24 rounded bg-white object-contain ring-1 ring-line" /> : <span className="inline-flex size-12 items-center justify-center rounded-lg bg-surface ring-1 ring-line">{icon}</span>}
                  <span className="text-sm"><span className="font-medium text-brand-ink">{busy ? "Preparing…" : logo ? "Change logo" : "Upload logo"}</span><span className="block text-[13px] text-ink-3">{over ? "Drop it here" : "Drop an image here, or tap to choose"}</span></span>
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

export function StepMoney({ business, logo }) {
  const [state, action] = useActionState(saveMoney, null);
  const [currency, setCurrency] = useState(business.currency || "NGN");
  const [days, setDays] = useState(business.invoice_due_days ?? 14);
  const [prefix, setPrefix] = useState(business.invoice_prefix || "INV");
  const [bank, setBank] = useState(business.bank_name || "");
  const [acctName, setAcctName] = useState(business.bank_account_name || business.name || "");
  const [acctNo, setAcctNo] = useState(business.bank_account_number || "");
  const nigeria = currency === "NGN" || /nigeria/i.test(business.country || "");
  const note = (
    <>
      <p className="font-medium">{days ? `Due in ${days} day${days === 1 ? "" : "s"}` : "Due on receipt"}</p>
      {(bank || acctNo) && <p>Pay to {[bank, acctName, acctNo].filter(Boolean).join(" · ")}</p>}
    </>
  );
  return (
    <form action={action}>
      <input type="hidden" name="business_id" value={business.id} />
      <StepCard title="Invoice defaults" description="How you get paid and when invoices are due. You can change these on any invoice, and later in Settings."
        footer={<>{backLink("/onboarding?step=brand")}{skipLink("/onboarding?step=finish", "Skip")}<span className="flex-1 max-sm:hidden" /><SubmitButton size="lg" iconRight={ArrowRight} pendingText="Saving…" className="max-sm:flex-1">Continue</SubmitButton></>}>
        <FormMessage state={state} />
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section>
              <p className="text-[13px] font-medium text-ink-2">Bank details for transfers</p>
              <p className="mb-2.5 text-xs text-ink-3">Printed on invoices so customers can pay by transfer. You record those payments yourself.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bank" htmlFor="bn" className="sm:col-span-2"><BankPicker id="bn" value={bank} onChange={setBank} suggest={nigeria} placeholder={nigeria ? "Start typing: GTBank, OPay, Moniepoint…" : "Your bank"} /></Field>
                <Field label="Account name" htmlFor="ban"><Input id="ban" name="bank_account_name" value={acctName} onChange={(e) => setAcctName(e.target.value)} /></Field>
                <Field label="Account number" htmlFor="bno"><Input id="bno" name="bank_account_number" value={acctNo} onChange={(e) => setAcctNo(e.target.value)} inputMode="numeric" maxLength={nigeria ? 10 : 34} /></Field>
              </div>
            </section>
            <DueDaysField defaultValue={business.invoice_due_days ?? 14} onChange={setDays} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Currency" htmlFor="currency"><Select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <PrefixField id="ip" name="invoice_prefix" label="Invoice numbers" defaultValue={business.invoice_prefix || "INV"} seq={business.invoice_seq} onChange={setPrefix} />
            </div>
            <section><TaxFields countryCode={countryByName(business.country || "")?.code || ""} regionCode={business.region || ""} defaults={business} /></section>
            <More label="Quotes, receipts and terms (optional)">
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                  <Field label="Quotes valid for (days)" htmlFor="qv" className="col-span-2 sm:col-span-1"><Input id="qv" name="quote_validity_days" type="number" min="1" max="365" defaultValue={business.quote_validity_days} /></Field>
                  <PrefixField id="qp" name="quote_prefix" label="Quote prefix" defaultValue={business.quote_prefix || "QT"} seq={business.quote_seq} />
                  <PrefixField id="rp" name="receipt_prefix" label="Receipt prefix" defaultValue={business.receipt_prefix || "RCT"} seq={business.receipt_seq} />
                </div>
                <Field label="Default notes & terms" htmlFor="terms" optional hint="Printed at the bottom of every new quote and invoice.">
                  <TermsField defaultValue={business.default_terms} validityDays={business.quote_validity_days} dueDays={days} />
                </Field>
              </div>
            </More>
          </div>
          <div>
            <p className="mb-2.5 text-[13px] font-medium text-ink-2">Your invoices will look like this</p>
            <DocumentPreview name={business.name} color={business.brand_color || "#1570EF"} logo={logo} kind="INVOICE" currency={currency}
              number={`${prefix}-${String(Number(business.invoice_seq || 0) + 1).padStart(4, "0")}`} footer={business.footer_note} note={note} />
          </div>
        </div>
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
      <StepCard title="You're set. Create your first invoice" description={company ? "It takes about a minute. Invite your team now too, or later from Settings → Team." : "It takes about a minute. You can connect online payments now or whenever you're ready."}
        footer={<>{backLink("/onboarding?step=money")}<span className="flex-1 max-sm:hidden" />
          <SubmitButton size="lg" variant="secondary" name="next" value="app" className="max-sm:flex-1 max-sm:px-3"><span className="max-sm:hidden">Go to dashboard</span><span className="sm:hidden">Dashboard</span></SubmitButton>
          <SubmitButton size="lg" icon={Receipt} name="next" value="invoice" pendingText="Finishing…" className="max-sm:flex-[1.6] max-sm:px-3"><span className="max-sm:hidden">Create your first invoice</span><span className="sm:hidden">First invoice</span></SubmitButton></>}>
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
            <SubmitButton size="sm" variant="secondary" name="next" value="payments" icon={PlugZap} className="mt-3 max-sm:h-11">Finish & connect payments</SubmitButton>
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
