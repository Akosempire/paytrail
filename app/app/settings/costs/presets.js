"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2, Plus, Tags, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, EmptyState, Field, Input, Select } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { formatMoney } from "@/lib/money";
import { COST_CATEGORIES } from "@/lib/format";
import { addPreset, deletePreset } from "./actions";

export function Presets({ presets, currency }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ label: "", category: "data", amount: "" });
  const run = (fn, after) => start(async () => { const r = await fn(); if (r.error) toast(r.error, "error"); else { toast(r.message); after?.(); } router.refresh(); });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader title="Your presets" icon={EyeOff} iconTone="violet" description="Visible only to people allowed to see costs." />
        {presets.length ? (
          <ul className="divide-y divide-line">
            {presets.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{p.label}</span><span className="text-xs text-ink-3">{COST_CATEGORIES[p.category]}</span></span>
                <span className="text-sm font-semibold tabular">{formatMoney(p.amount_minor, currency)}</span>
                <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${p.label}`} onClick={() => run(() => deletePreset(p.id))} className="!px-2" />
              </li>
            ))}
          </ul>
        ) : <div className="p-5"><EmptyState compact icon={Tags} title="No presets yet" description="Add the costs you include on most jobs." /></div>}
      </Card>
      <Card className="self-start">
        <CardHeader title="Add a preset" />
        <div className="flex flex-col gap-4 p-5">
          <Field label="Name" htmlFor="pl"><Input id="pl" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Monthly data (MTN 100GB)" /></Field>
          <Field label="Category" htmlFor="pc"><Select id="pc" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(COST_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label={`Amount (${currency})`} htmlFor="pa"><Input id="pa" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="15000" /></Field>
          <Button variant="primary" icon={pending ? Loader2 : Plus} loading={pending} onClick={() => run(() => addPreset(form), () => setForm({ label: "", category: "data", amount: "" }))}>Add preset</Button>
        </div>
      </Card>
    </div>
  );
}
