"use client";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { Send } from "lucide-react";
import { Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton, useToast } from "@/components/ui-client";
import { STATUSES } from "@/lib/feedback-core";
import { setThreadStatus, teamReply } from "../actions";

export function StatusSelect({ id, status }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Select controlSize="sm" aria-label="Status" defaultValue={status} disabled={pending}
      onChange={(e) => start(async () => { const r = await setThreadStatus(id, e.target.value); r?.error ? toast.error(r.error) : toast.success(r.message); })}>
      {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
    </Select>
  );
}

export function TeamReply({ id, status }) {
  const [state, run] = useActionState(teamReply.bind(null, id), null);
  const ref = useRef(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={run} className="flex flex-col gap-3 px-5 py-4">
      <FormMessage state={state} />
      <Textarea name="body" required rows={5} maxLength={5000} placeholder="Reply as the Usetally team. They get it by email and in the app." aria-label="Reply" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <label className="flex items-center gap-2 text-[13px] text-ink-2">After sending, mark as
          <Select name="status" controlSize="sm" defaultValue={status === "open" ? "open" : status}>
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </label>
        <SubmitButton icon={Send} pendingText="Sending…">Send reply</SubmitButton>
      </div>
    </form>
  );
}
