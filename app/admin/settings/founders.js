"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LineChart, Trash2, UserPlus } from "lucide-react";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { addFounder, removeFounder } from "../actions";

// who can open the read-only founder dashboard
export function FounderAccess({ founders, missingSql }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ email: "", note: "" });
  const run = (fn, after) => start(async () => {
    const r = await fn();
    if (r.error) return toast.error({ title: "Not saved", message: r.error }, { duration: 12000 });
    toast.success({ title: "Saved", message: r.message });
    after?.();
    router.refresh();
  });
  return (
    <Card>
      <CardHeader icon={LineChart} iconTone="brand" title="Founder access"
        description="Non-technical founders see customers, money in and the payment gateway on a view-only dashboard. They can't open this admin area, keys or settings." />
      <div className="flex flex-col gap-5 p-5">
        {missingSql ? <p className="text-sm text-warn-ink">Run supabase/RUN_NEW_2026-11-08a.sql in Supabase → SQL Editor to turn this on.</p> : (
          <>
            <form className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); run(() => addFounder(form), () => setForm({ email: "", note: "" })); }}>
              <Field label="Their email" htmlFor="fd-email"><Input id="fd-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="chima@usetally.cc" autoComplete="off" /></Field>
              <Field label="Note" htmlFor="fd-note" optional><Input id="fd-note" value={form.note} maxLength={80} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Co-founder, growth" /></Field>
              <Button type="submit" variant="primary" icon={UserPlus} loading={pending}>Give access</Button>
            </form>
            {founders.length ? (
              <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                {founders.map((f) => (
                  <li key={f.email} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{f.email}</span>{f.note && <span className="block truncate text-xs text-ink-3">{f.note}</span>}</span>
                    <Button variant="ghost" size="sm" icon={Trash2} disabled={pending} aria-label={`Remove ${f.email}`} onClick={() => run(() => removeFounder(f.email))}>Remove</Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-3">No founders added yet. They open the dashboard from the app menu, or at usetally.cc/founder.</p>}
          </>
        )}
      </div>
    </Card>
  );
}
