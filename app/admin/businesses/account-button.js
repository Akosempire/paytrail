"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Settings2 } from "lucide-react";
import { Button, Field, Input, Select, cx } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { formatMoney } from "@/lib/money";
import { updateBusinessAccount } from "../actions";

export function AccountButton({ business, plans }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("extend");
  const [form, setForm] = useState({ plan_id: business.plan_id || plans[0]?.id || "", amount: "", reference: "", status: business.status, extra_documents: "2", extra_days: "" });
  const [pending, start] = useTransition();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = () => start(async () => { const r = await updateBusinessAccount(business.id, { ...form, action: tab }); if (r.error) return toast(r.error, "error"); toast(r.message); setOpen(false); router.refresh(); });
  return (
    <>
      <Button size="sm" icon={Settings2} onClick={() => setOpen(true)}>Manage</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={business.name} description="Changes apply immediately."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" icon={pending ? Loader2 : undefined} loading={pending} onClick={submit}>Apply</Button></>}>
        <div className="mb-5 inline-flex rounded-lg bg-tray p-1">
          {[["extend", "Plan / payment"], ["trial", "Trial"], ["status", "Status"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cx("h-8 rounded-md px-3 text-[13px] font-medium", tab === k ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3")}>{l}</button>
          ))}
        </div>
        {tab === "extend" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan" htmlFor="ap" className="sm:col-span-2"><Select id="ap" value={form.plan_id} onChange={set("plan_id")}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.price_minor ? `${formatMoney(p.price_minor, p.currency)} / ${p.billing_interval}` : `Free (${p.currency})`}{p.active ? "" : " · hidden"}</option>)}</Select></Field>
            <Field label="Amount received" htmlFor="aa" hint="Leave empty to use the plan price."><Input id="aa" inputMode="decimal" value={form.amount} onChange={set("amount")} /></Field>
            <Field label="Reference" htmlFor="ar" optional><Input id="ar" value={form.reference} onChange={set("reference")} placeholder="Bank narration" /></Field>
            <p className="text-[13px] text-ink-3 sm:col-span-2">Activates the plan and adds one billing period (from today, or from the end of the current period if they're already on this plan).</p>
          </div>
        )}
        {tab === "trial" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Give back free documents" htmlFor="ed"><Input id="ed" inputMode="numeric" value={form.extra_documents} onChange={set("extra_documents")} /></Field>
            <Field label="Add trial days" htmlFor="ey"><Input id="ey" inputMode="numeric" value={form.extra_days} onChange={set("extra_days")} /></Field>
            <p className="text-[13px] text-ink-3 sm:col-span-2">Puts the account back on trial with the extra allowance.</p>
          </div>
        )}
        {tab === "status" && (
          <Field label="Account status" htmlFor="as" hint="Suspended accounts can sign in but can't send documents or take online payments.">
            <Select id="as" value={form.status} onChange={set("status")}>
              <option value="trialing">Trialing</option><option value="active">Active</option><option value="past_due">Past due</option><option value="canceled">Canceled</option><option value="suspended">Suspended</option>
            </Select>
          </Field>
        )}
      </Modal>
    </>
  );
}
