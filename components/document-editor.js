"use client";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Plus, Trash2, Send, Save, UserPlus, Users, Calculator, ChevronDown, CircleAlert, Loader2, ShieldCheck, Eye, PencilLine } from "lucide-react";
import { DocPreview } from "@/components/doc-preview";
import { buildModel } from "@/lib/doc-model";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { computeTotals, formatMoney, marginOf, minorToInput, toMinor } from "@/lib/money";
import { COST_CATEGORIES } from "@/lib/format";
import { saveDocument } from "@/app/app/documents/actions";

const blankItem = () => ({ key: Math.random().toString(36).slice(2), description: "", details: "", quantity: "1", price: "" });
const blankCost = (c = {}) => ({ key: Math.random().toString(36).slice(2), label: c.label || "", category: c.category || "other", amount: c.amount_minor ? minorToInput(c.amount_minor) : "" });

// onSave/onSaved: used by offline mode, which saves to the device instead of the server
export function DocumentEditor({ kind, doc, items: initialItems, costs: initialCosts, customers, presets, business, perms, emailReady, onSave, onSaved }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const quote = kind === "quote";
  const currency = doc?.currency || business.currency;
  const money = (v) => formatMoney(v, currency);

  const [customerMode, setCustomerMode] = useState(doc?.customer_id || customers.length ? "existing" : "new");
  const [customerId, setCustomerId] = useState(doc?.customer_id || "");
  const [customer, setCustomer] = useState({ name: "", company: "", email: "", phone: "", address: "" });
  const [title, setTitle] = useState(doc?.title || "");
  const [issueDate, setIssueDate] = useState(doc?.issue_date || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState((quote ? doc?.valid_until : doc?.due_date) || addDays(quote ? business.quote_validity_days : business.invoice_due_days));
  const [items, setItems] = useState(initialItems?.length ? initialItems.map((i) => ({ key: i.id, description: i.description, details: i.details || "", quantity: String(Number(i.quantity)), price: minorToInput(i.unit_price_minor) })) : [blankItem()]);
  const [costs, setCosts] = useState(initialCosts?.length ? initialCosts.map((c) => blankCost(c)) : []);
  const [discount, setDiscount] = useState(doc?.discount_minor ? minorToInput(doc.discount_minor) : "");
  const [taxRate, setTaxRate] = useState(String(doc?.tax_rate ?? business.tax_rate ?? 0));
  const [taxLabel, setTaxLabel] = useState(doc?.tax_label || business.tax_label || "VAT");
  const [notes, setNotes] = useState(doc?.notes || "");
  const [terms, setTerms] = useState(doc?.terms ?? business.default_terms ?? "");
  const [emailCustomer, setEmailCustomer] = useState(emailReady);
  const [targetMargin, setTargetMargin] = useState("30");
  const [presetOpen, setPresetOpen] = useState(false);
  const [error, setError] = useState(null);

  const parsedItems = items.map((i) => ({ quantity: Number(i.quantity) || 0, unit_price_minor: toMinor(i.price) || 0 }));
  const totals = computeTotals(parsedItems, toMinor(discount) || 0, Number(taxRate) || 0);
  const costTotal = costs.reduce((s, c) => s + (toMinor(c.amount) || 0), 0);
  const revenue = totals.subtotal - totals.discount; // what you earn before tax
  const { profit, pct } = marginOf(revenue, costTotal);
  const target = Math.min(95, Math.max(0, Number(targetMargin) || 0));
  const suggested = costTotal > 0 ? Math.ceil(costTotal / (1 - target / 100) / 100) * 100 : 0;
  const costsVisible = perms.canViewCosts;
  const needsApproval = perms.isJunior && business.require_approval;

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);
  const [view, setView] = useState("edit"); // phones: edit | preview

  // live preview of what the customer will see, from the unsaved form
  const who = customerMode === "existing" ? selectedCustomer || {} : customer;
  const draftDoc = {
    ...(doc || {}), kind, number: doc?.number || (quote ? "New quotation" : "New invoice"), title, currency, status: doc?.status || "draft",
    issue_date: issueDate, due_date: quote ? null : endDate, valid_until: quote ? endDate : null,
    customer_name: who.name || "", customer_company: who.company || "", customer_email: who.email || "", customer_phone: who.phone || "", customer_address: who.address || "",
    subtotal_minor: totals.subtotal, discount_minor: totals.discount, tax_rate: Number(taxRate) || 0, tax_label: taxLabel, tax_minor: totals.tax, total_minor: totals.total,
    amount_paid_minor: doc?.amount_paid_minor || 0, notes, terms, snapshot: null,
  };
  const draftItems = items.filter((i) => i.description.trim()).map((i) => ({ description: i.description, details: i.details, quantity: Number(i.quantity) || 0, unit_price_minor: toMinor(i.price) || 0 }));
  const deferred = useDeferredValue(JSON.stringify([draftDoc, draftItems]));
  const previewModel = useMemo(() => { const [d, its] = JSON.parse(deferred); return buildModel({ doc: d, items: its, business }); }, [deferred, business]);

  function setItem(key, patch) { setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i))); }
  function setCost(key, patch) { setCosts((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c))); }

  function submit(intent) {
    setError(null);
    const bad = items.find((i) => i.description.trim() && !Number.isFinite(toMinor(i.price)));
    if (bad) { const m = `Check the price for "${bad.description}".`; setError(m); return toast.error(m); }
    const input = {
      kind, title, issue_date: issueDate,
      ...(quote ? { valid_until: endDate } : { due_date: endDate }),
      discount_minor: toMinor(discount) || 0, tax_rate: Number(taxRate) || 0, tax_label: taxLabel, notes, terms,
      items: items.filter((i) => i.description.trim()).map((i) => ({ description: i.description.trim(), details: i.details.trim(), quantity: Number(i.quantity) || 1, unit_price_minor: toMinor(i.price) || 0 })),
      email_customer: emailCustomer,
    };
    if (customerMode === "existing") input.customer_id = customerId;
    else input.customer = customer;
    if (costsVisible) input.costs = costs.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), category: c.category, amount_minor: toMinor(c.amount) || 0 }));
    start(async () => {
      const result = onSave ? await onSave(input, intent) : await saveDocument(doc?.id || null, input, intent);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        if (result.id && !onSaved) router.push(`/app/documents/${result.id}`);
        return;
      }
      if (onSaved) return onSaved(result.id, intent);
      toast.success(intent === "send" ? (emailCustomer && emailReady ? "Saved and emailed to your customer." : "Saved and marked as sent.") : intent === "submit" ? "Sent for approval." : "Draft saved.");
      router.push(`/app/documents/${result.id}${intent === "send" ? "?sent=1" : ""}`);
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="sticky top-16 z-10 -mx-4 -mt-2 bg-canvas/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden" role="tablist" aria-label="Editor view">
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-tray p-1">
          {[["edit", "Edit", PencilLine], ["preview", "Preview", Eye]].map(([v, l, Icon]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cx("inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]", view === v ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3")}>
              <Icon className="size-4" />{l}
            </button>
          ))}
        </div>
      </div>
      {view === "preview" && (
        <div className="flex min-w-0 flex-col gap-2 lg:hidden">
          <div className="rounded-2xl bg-tray p-2"><DocPreview model={previewModel} label="Live preview" /></div>
          <p className="text-center text-[12px] text-ink-3">Template and paper size can be changed after saving.</p>
        </div>
      )}
      <div className={cx("flex min-w-0 flex-col gap-6", view === "preview" && "max-lg:hidden")}>
        <Card>
          <CardHeader title="Customer" icon={Users} actions={
            customers.length > 0 && (
              <div className="flex rounded-lg bg-tray p-1 text-[13px]">
                <button type="button" onClick={() => setCustomerMode("existing")} className={cx("h-7 rounded-md px-2.5 font-medium", customerMode === "existing" ? "bg-surface text-ink shadow-[var(--shadow-xs)]" : "text-ink-3")}>Existing</button>
                <button type="button" onClick={() => setCustomerMode("new")} className={cx("h-7 rounded-md px-2.5 font-medium", customerMode === "new" ? "bg-surface text-ink shadow-[var(--shadow-xs)]" : "text-ink-3")}>New</button>
              </div>
            )} />
          <div className="p-5">
            {customerMode === "existing" ? (
              <div className="flex flex-col gap-3">
                <Field label="Choose customer" htmlFor="customer">
                  <Select id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">Select a customer…</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</option>)}
                  </Select>
                </Field>
                {selectedCustomer && <p className="text-[13px] text-ink-3">{[selectedCustomer.email, selectedCustomer.phone].filter(Boolean).join(" · ") || "No contact details saved"}</p>}
                <button type="button" onClick={() => setCustomerMode("new")} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-brand-ink hover:underline"><UserPlus className="size-3.5" />Add a new customer</button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact name" htmlFor="cn"><Input id="cn" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Chioma Obi" /></Field>
                <Field label="Company" htmlFor="cc" optional><Input id="cc" value={customer.company} onChange={(e) => setCustomer({ ...customer, company: e.target.value })} placeholder="Obi Foods Ltd" /></Field>
                <Field label="Email" htmlFor="ce" hint="Needed to email the document."><Input id="ce" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></Field>
                <Field label="Phone / WhatsApp" htmlFor="cp" optional><Input id="cp" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></Field>
                <Field label="Address" htmlFor="ca" optional className="sm:col-span-2"><Input id="ca" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></Field>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={quote ? "Quotation details" : "Invoice details"} description={doc?.number ? `Number ${doc.number}` : "Numbered automatically when saved"} />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Title" htmlFor="title" optional className="sm:col-span-3"><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={quote ? "Website redesign for Obi Foods" : "Monthly retainer — October"} /></Field>
            <Field label="Issue date" htmlFor="issue"><Input id="issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
            <Field label={quote ? "Valid until" : "Due date"} htmlFor="end"><Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
            <Field label="Currency" hint="Change the default in Settings."><Input value={currency} disabled /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Items" description="What your customer sees and pays for." />
          <div className="hidden grid-cols-[minmax(0,1fr)_80px_140px_120px_36px] gap-3 border-b border-line bg-subtle px-5 py-2 text-[12px] font-medium text-ink-3 md:grid">
            <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span><span />
          </div>
          <ul className="divide-y divide-line">
            {items.map((item, idx) => {
              const line = Math.round((Number(item.quantity) || 0) * (toMinor(item.price) || 0));
              return (
                <li key={item.key} className="grid gap-2.5 px-5 py-4 md:grid-cols-[minmax(0,1fr)_80px_140px_120px_36px] md:items-start md:gap-3">
                  <div className="flex flex-col gap-2">
                    <Input aria-label={`Item ${idx + 1} description`} value={item.description} onChange={(e) => setItem(item.key, { description: e.target.value })} placeholder="e.g. Brand identity design" />
                    <Textarea aria-label={`Item ${idx + 1} details`} rows={1} value={item.details} onChange={(e) => setItem(item.key, { details: e.target.value })} placeholder="Details (optional)" className="min-h-9 text-[13px]" />
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2.5 md:contents">
                    <Input aria-label="Quantity" inputMode="decimal" value={item.quantity} onChange={(e) => setItem(item.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })} className="text-right tabular" />
                    <Input aria-label="Unit price" inputMode="decimal" value={item.price} onChange={(e) => setItem(item.key, { price: e.target.value })} placeholder="0" className="text-right tabular" />
                  </div>
                  <div className="flex items-center justify-between md:block md:pt-2.5 md:text-right">
                    <span className="text-[13px] text-ink-3 md:hidden">Amount</span>
                    <span className="font-medium text-ink tabular">{money(line)}</span>
                  </div>
                  <button type="button" onClick={() => setItems((l) => l.length > 1 ? l.filter((x) => x.key !== item.key) : [blankItem()])} aria-label="Remove item"
                    className="inline-flex size-9 items-center justify-center justify-self-end rounded-md text-ink-3 hover:bg-danger-soft hover:text-danger-ink">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-5 border-t border-line p-5 sm:flex-row sm:items-start sm:justify-between">
            <Button size="sm" icon={Plus} onClick={() => setItems((l) => [...l, blankItem()])}>Add item</Button>
            <dl className="w-full max-w-xs space-y-2.5 text-sm">
              <Row label="Subtotal" value={money(totals.subtotal)} />
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-2">Discount</dt>
                <dd><Input aria-label="Discount amount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="h-8 w-32 text-right tabular" /></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-ink-2">
                  <input aria-label="Tax name" value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} className="w-12 rounded border-0 bg-transparent p-0 text-sm text-ink-2 focus:ring-0" />
                  <input aria-label="Tax rate" value={taxRate} onChange={(e) => setTaxRate(e.target.value.replace(/[^\d.]/g, ""))} className="h-7 w-14 rounded-sm px-1.5 text-right text-sm ring-1 ring-line-strong" />%
                </dt>
                <dd className="tabular text-ink">{money(totals.tax)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-3">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="text-title-2 text-ink tabular">{money(totals.total)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card>
          <CardHeader title="Notes & terms" description="Shown at the bottom of the document." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Notes to customer" htmlFor="notes" optional><Textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thanks for the opportunity! Timeline: 3 weeks from deposit." /></Field>
            <Field label="Terms" htmlFor="terms" optional><Textarea id="terms" rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
          </div>
        </Card>
      </div>

      <aside className={cx("flex flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto lg:pb-2 [&>*]:shrink-0", view === "preview" && "max-lg:hidden")}>
        {costsVisible ? (
          <Card className="ring-violet/30">
            <div className="flex items-start gap-3 border-b border-line bg-violet-soft/60 px-5 py-4">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-violet/30"><EyeOff className="size-4 text-violet" /></span>
              <div>
                <h3 className="text-title-3 text-ink">Your costs</h3>
                <p className="text-[12.5px] text-ink-2">Hidden from the customer. Only people you allow can see these.</p>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {costs.length === 0 && <li className="px-5 py-4 text-[13px] text-ink-3">Add what this job costs you, like data, electricity, transport or software, to see your real profit.</li>}
              {costs.map((c) => (
                <li key={c.key} className="flex flex-col gap-2 px-5 py-3">
                  <div className="flex gap-2">
                    <Input aria-label="Cost name" value={c.label} onChange={(e) => setCost(c.key, { label: e.target.value })} placeholder="e.g. Data subscription" className="h-9" />
                    <button type="button" onClick={() => setCosts((l) => l.filter((x) => x.key !== c.key))} aria-label="Remove cost" className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-danger-soft hover:text-danger-ink"><Trash2 className="size-4" /></button>
                  </div>
                  <div className="grid grid-cols-[1fr_110px] gap-2">
                    <Select aria-label="Cost category" controlSize="sm" value={c.category} onChange={(e) => setCost(c.key, { category: e.target.value })}>
                      {Object.entries(COST_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                    <input aria-label="Cost amount" inputMode="decimal" value={c.amount} onChange={(e) => setCost(c.key, { amount: e.target.value })} placeholder="0"
                      className="h-8 w-full rounded-sm bg-surface px-2.5 text-right text-[13px] tabular ring-1 ring-inset ring-line-strong focus:ring-brand focus:outline-none" />
                  </div>
                </li>
              ))}
            </ul>
            <div className="relative flex gap-2 border-t border-line px-5 py-3">
              <Button size="sm" icon={Plus} onClick={() => setCosts((l) => [...l, blankCost()])}>Add cost</Button>
              {presets.length > 0 && (
                <>
                  <Button size="sm" variant="ghost" iconRight={ChevronDown} onClick={() => setPresetOpen(!presetOpen)}>From presets</Button>
                  {presetOpen && (
                    <div className="absolute bottom-full left-5 z-20 mb-1 w-64 animate-rise rounded-xl bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-line">
                      {presets.map((p) => (
                        <button key={p.id} type="button" onClick={() => { setCosts((l) => [...l, blankCost(p)]); setPresetOpen(false); }}
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-hover">
                          <span className="truncate">{p.label}</span><span className="shrink-0 text-ink-3 tabular">{money(p.amount_minor)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <dl className="space-y-2 border-t border-line bg-subtle px-5 py-4 text-[13px]">
              <Row label="Customer pays" value={money(totals.total)} strong />
              <Row label={`Your revenue (before ${taxLabel || "tax"})`} value={money(revenue)} />
              <Row label="Your costs" value={`− ${money(costTotal)}`} />
              <div className="flex items-center justify-between border-t border-line pt-2.5">
                <dt className="font-semibold text-ink">Profit</dt>
                <dd className={cx("text-title-3 tabular", profit < 0 ? "text-danger-ink" : "text-success-ink")}>{money(profit)}</dd>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-ink-3"><span>Margin</span><span className="font-semibold tabular">{revenue > 0 ? `${pct.toFixed(1)}%` : "—"}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-line"><div className={cx("h-full rounded-full transition-all", pct < 0 ? "bg-danger" : pct < 15 ? "bg-warn" : "bg-success")} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
              </div>
              {profit < 0 && <Alert intent="warning" size="sm" title="You'd lose money">Your costs are higher than the price of this job.</Alert>}
            </dl>
            {costTotal > 0 && (
              <div className="border-t border-line px-5 py-4">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink"><Calculator className="size-4 text-brand" />Pricing helper</p>
                <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
                  For a
                  <input aria-label="Target margin" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value.replace(/[^\d.]/g, ""))} className="h-7 w-12 rounded-sm px-1.5 text-right ring-1 ring-line-strong" />
                  % margin, charge at least
                </div>
                <p className="mt-1.5 text-title-3 text-ink tabular">{money(suggested)} <span className="text-xs font-normal text-ink-3">before {taxLabel || "tax"}</span></p>
                {revenue < suggested && <p className="mt-1 text-xs text-warn-ink">You're {money(suggested - revenue)} below that.</p>}
              </div>
            )}
          </Card>
        ) : (
          <Card>
            <CardHeader title="Summary" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <Row label="Subtotal" value={money(totals.subtotal)} />
              <Row label="Total" value={money(totals.total)} strong />
            </dl>
          </Card>
        )}
        <Card className="hidden lg:block">
          <CardHeader title="Live preview" icon={Eye} description="What your customer will see." />
          <div className="bg-tray p-3"><DocPreview model={previewModel} label="Live preview" /></div>
        </Card>
        {needsApproval && (
          <div className="flex gap-2.5 rounded-xl bg-violet-soft p-4 text-[13px] text-violet-ink ring-1 ring-inset ring-violet/25">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />A manager or finance officer approves your drafts before they reach the customer.
          </div>
        )}
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur lg:left-[264px]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            {error ? <p role="alert" className="flex items-start gap-2 text-[13px] text-ink"><CircleAlert className="mt-px size-4 shrink-0 text-intent-error" aria-hidden="true" /><span><span className="sr-only">Error: </span>{error}</span></p> : (
              <p className="text-[13px] text-ink-3"><span className="font-semibold text-ink tabular">{money(totals.total)}</span> total{costsVisible && costTotal > 0 && <> · <span className={profit < 0 ? "text-danger-ink" : "text-success-ink"}>{money(profit)} profit</span></>}</p>
            )}
          </div>
          {!needsApproval && emailReady && (
            <label className="hidden items-center gap-2 text-[13px] text-ink-2 sm:flex">
              <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />Email to customer
            </label>
          )}
          <Button variant="secondary" icon={pending ? Loader2 : Save} loading={pending} onClick={() => submit("draft")}>Save draft</Button>
          {needsApproval
            ? <Button variant="primary" icon={ShieldCheck} disabled={pending} onClick={() => submit("submit")}>Submit for approval</Button>
            : <Button variant="primary" icon={Send} disabled={pending} onClick={() => submit("send")}>{quote ? "Save & send quote" : "Save & send invoice"}</Button>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-medium text-ink" : "text-ink-2"}>{label}</dt>
      <dd className={cx("tabular", strong ? "font-semibold text-ink" : "text-ink")}>{value}</dd>
    </div>
  );
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}
