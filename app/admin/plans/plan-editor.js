"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Tags } from "lucide-react";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { CURRENCIES, formatMoney, minorToInput } from "@/lib/money";
import { savePlan } from "../actions";

const EMPTY = { name: "", tagline: "", price: "", currency: "NGN", billing_interval: "month", document_limit: "", seat_limit: "", allow_company: true, features: "", active: true, sort_order: 0, filing_fee: "", spots: "" };

export function PlanEditor({ plans, counts }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(null);
  const open = (p) => setEditing(p ? { id: p.id, name: p.name, tagline: p.tagline, price: minorToInput(p.price_minor), currency: p.currency, billing_interval: p.billing_interval,
    document_limit: p.document_limit ?? "", seat_limit: p.seat_limit ?? "", allow_company: p.allow_company, features: (p.features || []).join("\n"), active: p.active, sort_order: p.sort_order, filing_fee: p.tax_filing_fee_minor == null ? "" : minorToInput(p.tax_filing_fee_minor), spots: p.spots ?? "" } : { ...EMPTY });
  const set = (k) => (e) => setEditing({ ...editing, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <>
      <div className="flex justify-end"><Button variant="primary" icon={Plus} onClick={() => open(null)}>New plan</Button></div>
      {plans.length === 0 ? <EmptyState icon={Tags} title="No plans yet" description="Create your first plan. Businesses see active plans on their billing page when their trial ends." action={<Button variant="primary" icon={Plus} onClick={() => open(null)}>Create a plan</Button>} /> : (
        <div className="grid gap-1.5 rounded-2xl bg-tray p-1.5 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-center justify-between gap-2"><p className="text-title-3 text-ink">{p.name}</p><Badge size="sm" tone={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Hidden"}</Badge></div>
              <p className="mt-3 text-[26px] font-semibold tracking-[-0.02em] tabular">{p.price_minor === 0 ? "Free" : formatMoney(p.price_minor, p.currency)}<span className="text-sm font-normal text-ink-3"> / {p.billing_interval}</span></p>
              <ul className="mt-3 flex-1 space-y-1 text-[13px] text-ink-2">
                <li>{p.document_limit == null ? "Unlimited documents" : `${p.document_limit} documents / month`}</li>
                <li>{p.seat_limit == null ? "Unlimited seats" : `${p.seat_limit} seats`} · {p.allow_company ? "Freelancers & companies" : "Freelancers only"}</li>
                {(p.features || []).map((f) => <li key={f} className="text-ink-3">· {f}</li>)}
                {p.tax_filing_fee_minor != null && <li className="text-ink-3">· File &amp; pay: {p.tax_filing_fee_minor ? formatMoney(p.tax_filing_fee_minor, "NGN") : "free"} per return</li>}
                {p.spots != null && <li className="text-ink-3">· {p.spots} spots (anyone can pick it while spots are left)</li>}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="text-xs text-ink-3">{counts[p.id] || 0} paying</span>
                <Button size="sm" icon={Pencil} onClick={() => open(p)}>Edit</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} size="lg" title={editing?.id ? "Edit plan" : "New plan"}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" icon={pending ? Loader2 : undefined} loading={pending}
          onClick={() => start(async () => { const r = await savePlan(editing.id || null, editing); if (r.error) return toast(r.error, "error"); toast(r.message); setEditing(null); router.refresh(); })}>Save plan</Button></>}>
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="pn"><Input id="pn" value={editing.name} onChange={set("name")} placeholder="Starter" /></Field>
            <Field label="Short description" htmlFor="pt" optional><Input id="pt" value={editing.tagline} onChange={set("tagline")} placeholder="For freelancers getting started" /></Field>
            <Field label="Price" htmlFor="pp" hint="0 makes it a free plan."><Input id="pp" inputMode="decimal" value={editing.price} onChange={set("price")} placeholder="5000" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency" htmlFor="pc"><Select id="pc" value={editing.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Billed every" htmlFor="pi"><Select id="pi" value={editing.billing_interval} onChange={set("billing_interval")}><option value="month">Month</option><option value="year">Year</option></Select></Field>
            </div>
            <Field label="Documents per month" htmlFor="pd" hint="Leave empty for unlimited."><Input id="pd" inputMode="numeric" value={editing.document_limit} onChange={set("document_limit")} /></Field>
            <Field label="Team seats" htmlFor="ps" hint="Leave empty for unlimited."><Input id="ps" inputMode="numeric" value={editing.seat_limit} onChange={set("seat_limit")} /></Field>
            <Field label="Feature bullets" htmlFor="pf" hint="One per line. Shown on the plan card." className="sm:col-span-2"><Textarea id="pf" rows={4} value={editing.features} onChange={set("features")} placeholder={"Online payments with Bachs & Flutterwave\nHidden cost tracking\nPriority support"} /></Field>
            <Field label="“File & pay for me” price (₦)" htmlFor="pff" optional hint="Per VAT return on this plan. Empty uses the price in Admin → Tax filing."><Input id="pff" inputMode="decimal" value={editing.filing_fee} onChange={set("filing_fee")} /></Field>
            <Field label="Spots" htmlFor="psp" optional hint="For a hidden offer like Founding: anyone can choose it until this many businesses are on it."><Input id="psp" inputMode="numeric" value={editing.spots} onChange={set("spots")} /></Field>
            <Field label="Display order" htmlFor="po"><Input id="po" inputMode="numeric" value={editing.sort_order} onChange={set("sort_order")} /></Field>
            <div className="flex flex-col justify-end gap-3">
              <Checkbox label="Companies can choose it" checked={editing.allow_company} onChange={set("allow_company")} />
              <Checkbox label="Active (visible to businesses)" checked={editing.active} onChange={set("active")} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
