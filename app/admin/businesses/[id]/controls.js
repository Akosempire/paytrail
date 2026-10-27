"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { formatMoney } from "@/lib/money";
import { giveFreeAccess } from "../../actions";

// e.g. "a free year of Team" for early users and community partners
export function FreeAccessButton({ business, plans }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const team = plans.find((p) => p.name === "Team" && p.billing_interval === "month") || plans[0];
  const [form, setForm] = useState({ plan_id: team?.id || "", months: "12", note: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <>
      <Button size="sm" icon={Gift} onClick={() => setOpen(true)}>Give free access</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Free access for ${business.name}`} description="They get the plan's features, and documents carry their own brand. No payment is taken."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" icon={Gift} loading={pending}
          onClick={() => start(async () => { const r = await giveFreeAccess(business.id, form); if (r.error) return toast(r.error, "error"); toast(r.message); setOpen(false); router.refresh(); })}>Give access</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan" htmlFor="fp" className="sm:col-span-2"><Select id="fp" value={form.plan_id} onChange={set("plan_id")}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatMoney(p.price_minor, p.currency)} / {p.billing_interval}){p.active ? "" : " · hidden"}</option>)}</Select></Field>
          <Field label="For how long" htmlFor="fm"><Select id="fm" value={form.months} onChange={set("months")}>{[["1", "1 month"], ["3", "3 months"], ["6", "6 months"], ["12", "1 year"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Note" htmlFor="fn" optional><Input id="fn" value={form.note} onChange={set("note")} placeholder="e.g. @leyeConnect community" /></Field>
          <p className="text-[13px] text-ink-3 sm:col-span-2">Starts today, or after their current paid period if they're already on this plan. Shows in their billing history as free access.</p>
        </div>
      </Modal>
    </>
  );
}
