"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { Switch, useToast } from "@/components/ui-client";
import { DEFAULT_INVOICE_EMAIL, fillTemplate, reminderWhen } from "@/lib/reminders-core";
import { formatMoney } from "@/lib/money";
import { UpgradeNote } from "@/components/upgrade-note";
import { deleteReminderRule, saveInvoiceEmail, saveReminderRule, setRemindersEnabled, toggleReminderRule } from "./actions";

const VARS = [["{client}", "Client's first name"], ["{amount}", "Amount due"], ["{due_date}", "Due date"], ["{number}", "Invoice number"], ["{link}", "Link to view and pay"]];

function sample(business) {
  const due = new Date(Date.now() + 7 * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return { client: "Chioma", amount: formatMoney(15000000, business.currency || "NGN"), due_date: due, number: "INV-0042", link: "usetally.com/d/…", business: business.name };
}

// a message box with tap-to-insert variables and a live preview
function TemplateBox({ id, value, onChange, business, rows = 6 }) {
  const ref = useRef(null);
  const insert = (v) => {
    const el = ref.current;
    if (!el) return onChange(value + v);
    const a = el.selectionStart ?? value.length, b = el.selectionEnd ?? value.length;
    const next = value.slice(0, a) + v + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + v.length, a + v.length); });
  };
  return (
    <div className="flex flex-col gap-2">
      <Textarea ref={ref} id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="text-[15px] sm:text-sm" />
      <div className="flex flex-wrap gap-1.5" aria-label="Insert a detail">
        {VARS.map(([v, label]) => (
          <button key={v} type="button" onClick={() => insert(v)} title={label}
            className="inline-flex h-9 items-center rounded-md bg-tray px-2.5 font-mono text-[12px] text-ink-2 ring-1 ring-line hover:bg-hover hover:text-ink">{v}</button>
        ))}
      </div>
      <details className="rounded-lg bg-subtle px-3.5 py-2.5 text-[13px] ring-1 ring-line">
        <summary className="cursor-pointer font-medium text-ink-2">Preview</summary>
        <p className="mt-2 whitespace-pre-line text-ink-2">{fillTemplate(value, sample(business))}</p>
      </details>
    </div>
  );
}

function RuleEditor({ rule, business, taken, onDone }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const initial = rule?.offset_days ?? 3;
  const [when, setWhen] = useState(initial < 0 ? "before" : initial === 0 ? "on" : "after");
  const [days, setDays] = useState(Math.abs(initial) || 3);
  const [subject, setSubject] = useState(rule?.subject ?? "Invoice {number} is now overdue");
  const [message, setMessage] = useState(rule?.message ?? "Hi {client},\n\nInvoice {number} for {amount} was due on {due_date} and is still unpaid. Please pay it here: {link}\n\nThank you.");
  const offset = when === "on" ? 0 : when === "before" ? -Number(days) : Number(days);
  const clash = taken.includes(offset) && offset !== rule?.offset_days;
  function save() {
    start(async () => {
      const r = await saveReminderRule(rule?.id || null, { offset_days: offset, subject, message, enabled: rule ? rule.enabled : true });
      if (r.error) return toast.error({ title: "Not saved", message: r.error });
      toast(r.message); onDone(); router.refresh();
    });
  }
  function remove() {
    start(async () => {
      const r = await deleteReminderRule(rule.id);
      if (r.error) return toast.error(r.error);
      toast(r.message); onDone(); router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-4 border-t border-line bg-subtle/60 px-5 py-4">
      <Field label="When">
        <div className="flex items-center gap-2">
          {when !== "on" && <div className="w-20 shrink-0"><Input aria-label="Days" type="number" min="1" max={when === "before" ? 30 : 90} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="h-11 sm:h-10" /></div>}
          <Select aria-label="Before or after the due date" value={when} onChange={(e) => setWhen(e.target.value)} className="h-11 min-w-0 flex-1 sm:h-10 sm:flex-none">
            <option value="before">{days == 1 ? "day" : "days"} before the due date</option>
            <option value="on">On the due date</option>
            <option value="after">{days == 1 ? "day" : "days"} after the due date</option>
          </Select>
        </div>
      </Field>
      {clash && <p className="-mt-2 text-[13px] text-danger-ink">There's already a reminder for that day.</p>}
      <Field label="Subject" htmlFor={`s-${rule?.id || "new"}`}><Input id={`s-${rule?.id || "new"}`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} /></Field>
      <Field label="Message" htmlFor={`m-${rule?.id || "new"}`}><TemplateBox id={`m-${rule?.id || "new"}`} value={message} onChange={setMessage} business={business} /></Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={save} loading={pending} disabled={clash} className="max-sm:h-11">{rule ? "Save reminder" : "Add reminder"}</Button>
        <Button onClick={onDone} className="max-sm:h-11">Cancel</Button>
        {rule && <Button variant="ghost" icon={Trash2} onClick={remove} className="ml-auto text-danger-ink max-sm:h-11">Remove</Button>}
      </div>
    </div>
  );
}

export function RemindersSettings({ business, rules, sent30, locked = false }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(business.reminders_enabled);
  const [editing, setEditing] = useState(null); // rule id, "new" or null
  const [email, setEmail] = useState(business.email_template_invoice || DEFAULT_INVOICE_EMAIL);
  const taken = rules.map((r) => r.offset_days);
  const run = (fn, after) => start(async () => { const r = await fn(); if (r.error) { toast.error(r.error); after?.(true); return; } toast(r.message); router.refresh(); });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader icon={Mail} title="Invoice email" description="Sent with every invoice. You can still change it before sending." />
        <div className="flex flex-col gap-3 p-5">
          <TemplateBox id="invoice-email" value={email} onChange={setEmail} business={business} rows={7} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={pending} onClick={() => run(() => saveInvoiceEmail(email === DEFAULT_INVOICE_EMAIL ? "" : email))} className="max-sm:h-11">Save email</Button>
            {email !== DEFAULT_INVOICE_EMAIL && <Button onClick={() => setEmail(DEFAULT_INVOICE_EMAIL)} className="max-sm:h-11">Use the standard email</Button>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={BellRing} title="Automatic reminders"
          description={sent30 ? `${sent30} reminder${sent30 === 1 ? "" : "s"} sent in the last 30 days.` : "Emailed to your client about unpaid invoices. Only invoices with a client email get them, and each one is sent once."} />
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
          {locked && <UpgradeNote compact title="Automatic reminders are on paid plans">{on ? "Paused on the Free plan. Your reminders are kept and start again when you upgrade." : "Set them up once and Usetally chases late invoices for you."} The Remind button on each invoice stays free.</UpgradeNote>}
          <Switch checked={on && !locked} disabled={locked} label="Send payment reminders" description={locked ? "Available on paid plans." : "Turn off to stop all reminders for every invoice."}
            onChange={(v) => { setOn(v); run(() => setRemindersEnabled(v), () => setOn(!v)); }} />
        </div>
        <ul className={cx("divide-y divide-line border-t border-line", (!on || locked) && "opacity-60")}>
          {rules.map((r) => (
            <li key={r.id}>
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">{reminderWhen(r.offset_days)}{!r.enabled && <Badge size="sm">Off</Badge>}</p>
                  <p className="truncate text-[13px] text-ink-3">{r.subject}</p>
                </div>
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(editing === r.id ? null : r.id)} aria-label={`Edit the reminder ${reminderWhen(r.offset_days).toLowerCase()}`} className="max-sm:h-11">Edit</Button>
                <button type="button" role="switch" aria-checked={r.enabled} aria-label={`${reminderWhen(r.offset_days)}: ${r.enabled ? "on" : "off"}`} disabled={!on}
                  onClick={() => run(() => toggleReminderRule(r.id, !r.enabled))}
                  className={cx("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]", r.enabled ? "bg-brand" : "bg-line-strong")}>
                  <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", r.enabled ? "translate-x-[22px]" : "translate-x-0.5")} />
                </button>
              </div>
              {editing === r.id && <RuleEditor rule={r} business={business} taken={taken} onDone={() => setEditing(null)} />}
            </li>
          ))}
          {editing === "new" && <li><RuleEditor business={business} taken={taken} onDone={() => setEditing(null)} /></li>}
        </ul>
        {editing !== "new" && rules.length < 8 && (
          <div className="border-t border-line px-5 py-3"><Button variant="ghost" icon={Plus} onClick={() => setEditing("new")} className="max-sm:h-11">Add a reminder</Button></div>
        )}
      </Card>
    </div>
  );
}
