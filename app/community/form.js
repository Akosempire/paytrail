"use client";
import { useState, useTransition } from "react";
import { CheckCircle2, MailCheck, Send } from "lucide-react";
import { Button, Field, Input, Select, cx } from "@/components/ui";
import { joinCommunity } from "./actions";

export function CommunityForm({ batches = [], stages, rules }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", batch: "", business_name: "", stage: "", consent: "", website: "" });
  const [err, setErr] = useState({ field: "", text: "" });
  const [done, setDone] = useState(null);
  const [pending, start] = useTransition();
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); if (err.field === k) setErr({ field: "", text: "" }); };
  const e = (k) => (err.field === k ? err.text : undefined);

  const submit = (ev) => {
    ev.preventDefault();
    start(async () => {
      const r = await joinCommunity(f);
      if (r?.error) { setErr({ field: r.field || "", text: r.error }); return; }
      setDone(r);
    });
  };

  if (done) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6 ring-1 ring-line">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-success-soft text-success-ink"><MailCheck className="size-5" aria-hidden="true" /></span>
        <h2 className="text-[20px] font-semibold text-ink">{done.emailed ? "Check your email" : "You're signed up"}</h2>
        <p className="text-[15px] leading-relaxed text-ink-2">
          {done.emailed ? <>We've sent the WhatsApp group link to <strong className="font-semibold text-ink">{done.email}</strong>. Open it on your phone and tap <strong className="font-semibold text-ink">Join the WhatsApp group</strong>. Not there? Check your spam or promotions folder.</> : "We couldn't send the email just now. We'll send your group link shortly."}
        </p>
        <button type="button" onClick={() => setDone(null)} className="text-[14px] font-medium text-brand-ink hover:underline">Wrong email? Sign up again</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-6">
      <Field label="Name" htmlFor="c-name" error={e("name")}><Input id="c-name" autoComplete="name" value={f.name} onChange={set("name")} /></Field>
      <Field label="Email" htmlFor="c-email" hint="We send the group link here." error={e("email")}><Input id="c-email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Phone number (WhatsApp)" htmlFor="c-phone" error={e("phone")}><Input id="c-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0801 234 5678" value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Batch" htmlFor="c-batch" error={e("batch")}>
        {batches.length ? (
          <Select id="c-batch" value={f.batch} onChange={set("batch")}><option value="" disabled>Choose your batch</option>{batches.map((b) => <option key={b} value={b}>{b}</option>)}</Select>
        ) : <Input id="c-batch" value={f.batch} onChange={set("batch")} placeholder="e.g. Batch 3" />}
      </Field>
      <Field label="Business name" htmlFor="c-biz" error={e("business_name")}><Input id="c-biz" autoComplete="organization" value={f.business_name} onChange={set("business_name")} /></Field>
      <Field label="Stage of business" htmlFor="c-stage" error={e("stage")}>
        <Select id="c-stage" value={f.stage} onChange={set("stage")}><option value="" disabled>Choose one</option>{stages.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">Do you agree to obey the community rules?</legend>
        {rules && <p className="mb-1 rounded-lg bg-tray px-3 py-2 text-[13px] leading-relaxed text-ink-2">{rules}</p>}
        <div className="flex gap-2">
          {[["yes", "Yes, I agree"], ["no", "No"]].map(([v, l]) => (
            <label key={v} className={cx("flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium ring-1 transition", f.consent === v ? (v === "yes" ? "bg-brand-soft text-brand-ink ring-brand" : "bg-tray text-ink ring-line-strong") : "bg-surface text-ink-2 ring-line hover:bg-hover")}>
              <input type="radio" name="consent" value={v} checked={f.consent === v} onChange={set("consent")} className="sr-only" />
              {f.consent === v && v === "yes" && <CheckCircle2 className="size-4" aria-hidden="true" />}{l}
            </label>
          ))}
        </div>
        {e("consent") && <p className="text-[13px] text-danger-ink" role="alert">{e("consent")}</p>}
      </fieldset>
      {/* only bots fill this */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} className="absolute left-[-9999px] h-px w-px opacity-0" aria-hidden="true" />
      {err.text && !["name", "email", "phone", "batch", "business_name", "stage", "consent"].includes(err.field) && <p className="text-[13px] text-danger-ink" role="alert">{err.text}</p>}
      <Button type="submit" variant="primary" size="lg" icon={Send} loading={pending} disabled={pending}>Send me the group link</Button>
      <p className="text-center text-[12.5px] text-ink-3">We'll only email you about the community. Unsubscribe from reminders any time.</p>
    </form>
  );
}
