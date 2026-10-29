"use client";
import { useActionState, useState } from "react";
import { Send } from "lucide-react";
import { Field, Input, Textarea, cx } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui-client";
import { KINDS } from "@/lib/feedback-core";
import { startThread } from "./actions";

export function NewThread({ initialKind = "feature", from = "" }) {
  const [state, action] = useActionState(startThread, null);
  const [kind, setKind] = useState(KINDS[initialKind] ? initialKind : "feature");
  return (
    <form action={action} className="flex flex-col gap-4 px-5 py-5">
      <FormMessage state={state} inline />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="page" value={from} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">What's it about?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(KINDS).map(([k, v]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
              className={cx("flex min-h-[64px] flex-col items-start justify-center rounded-lg px-3 py-2 text-left ring-1 transition-colors",
                kind === k ? "bg-brand-soft ring-brand" : "bg-surface ring-line hover:bg-hover")}>
              <span className={cx("text-[13px] font-semibold", kind === k ? "text-brand-ink" : "text-ink")}>{v.verb}</span>
              <span className="mt-0.5 text-[11.5px] leading-4 text-ink-3">{v.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Title" htmlFor="fb-subject">
        <Input id="fb-subject" name="subject" required minLength={3} maxLength={140}
          placeholder={kind === "feature" ? "e.g. Let me send invoices on WhatsApp" : kind === "problem" ? "e.g. My logo doesn't show on receipts" : "A few words"} />
      </Field>
      <Field label="Message" htmlFor="fb-body" hint="The more detail, the better. We read every message.">
        <Textarea id="fb-body" name="body" required rows={6} maxLength={5000} placeholder="Tell us what you need and why it would help your business." />
      </Field>
      <div className="flex justify-end">
        <SubmitButton icon={Send} pendingText="Sending…">Send to the team</SubmitButton>
      </div>
    </form>
  );
}
