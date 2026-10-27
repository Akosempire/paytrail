"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Pause, Play, Plus, RefreshCw, Save, UsersRound } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { CopyButton, useToast } from "@/components/ui-client";
import { minorToInput } from "@/lib/money";
import { assignConsultant, newConsultantLink, saveConsultant, saveFilingFee, setConsultantActive } from "../actions";

function useRun() {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn, after) => start(async () => { const r = await fn(); if (r?.error) return toast.error(r.error); toast.success(r.message); after?.(); router.refresh(); });
  return [pending, run];
}

export function AssignConsultant({ returnId, current, consultants }) {
  const [pending, run] = useRun();
  return (
    <div className="flex items-center gap-2 lg:w-64">
      <Select aria-label="Consultant" value={current || ""} disabled={pending} onChange={(e) => run(() => assignConsultant(returnId, e.target.value || null))}>
        <option value="">Not assigned</option>
        {consultants.map((c) => <option key={c.id} value={c.id} disabled={!c.active && c.id !== current}>{c.name}{c.active ? "" : " (paused)"}</option>)}
      </Select>
    </div>
  );
}

const BLANK = { name: "", firm: "", email: "", phone: "", citn: "" };
export function Consultants({ consultants }) {
  const [pending, run] = useRun();
  const [form, setForm] = useState(BLANK);
  const [open, setOpen] = useState(!consultants.length);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Card>
      <CardHeader icon={UsersRound} title="Tax consultants" description="Each one gets an email for every request assigned to them, and a private page to record the filing."
        actions={<Button size="sm" icon={Plus} onClick={() => setOpen(!open)}>Add consultant</Button>} />
      {open && (
        <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="tc-name"><Input id="tc-name" value={form.name} onChange={set("name")} /></Field>
          <Field label="Email" htmlFor="tc-email"><Input id="tc-email" type="email" value={form.email} onChange={set("email")} /></Field>
          <Field label="Phone" htmlFor="tc-phone" optional><Input id="tc-phone" value={form.phone} onChange={set("phone")} /></Field>
          <Field label="Firm" htmlFor="tc-firm" optional><Input id="tc-firm" value={form.firm} onChange={set("firm")} /></Field>
          <Field label="CITN membership number" htmlFor="tc-citn" optional><Input id="tc-citn" value={form.citn} onChange={set("citn")} /></Field>
          <div className="flex items-end"><Button variant="primary" icon={Save} loading={pending} onClick={() => run(() => saveConsultant(form), () => { setForm(BLANK); setOpen(false); })}>Save consultant</Button></div>
        </div>
      )}
      <ul className="divide-y divide-line">
        {consultants.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[14px] font-medium text-ink">{c.name}{c.active ? <Badge size="sm" tone="success">Active</Badge> : <Badge size="sm" tone="neutral">Paused</Badge>}</p>
              <p className="truncate text-[12.5px] text-ink-3">{[c.firm, c.email, c.phone, c.citn_number && `CITN ${c.citn_number}`].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={c.link} label="Copy their link" />
              <Button size="sm" icon={RefreshCw} onClick={() => run(() => newConsultantLink(c.id))} title="Make a new private link">New link</Button>
              <Button size="sm" icon={c.active ? Pause : Play} onClick={() => run(() => setConsultantActive(c.id, !c.active))}>{c.active ? "Pause" : "Resume"}</Button>
            </div>
          </li>
        ))}
        {!consultants.length && <li className="px-5 py-4 text-[13px] text-ink-3">No consultants yet.</li>}
      </ul>
    </Card>
  );
}

export function FeeSetting({ fee }) {
  const [pending, run] = useRun();
  const [value, setValue] = useState(fee ? minorToInput(fee) : "0");
  return (
    <Card>
      <CardHeader title="Price shown to businesses" description="Per VAT return. 0 shows “Free while we test this”. Collect the fee however you agree with the business for now." />
      <div className="flex items-end gap-3 p-5">
        <Field label="Fee per return (₦)" htmlFor="tf-fee"><Input id="tf-fee" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="w-40" /></Field>
        <Button variant="primary" icon={Save} loading={pending} onClick={() => run(() => saveFilingFee(value))}>Save</Button>
      </div>
    </Card>
  );
}
