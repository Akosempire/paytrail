"use client";
import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui-client";

// a reply box; `action` is a server action bound to the thread
export function ReplyBox({ action, placeholder = "Write a reply…", buttonText = "Send" }) {
  const [state, run] = useActionState(action, null);
  const ref = useRef(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={run} className="flex flex-col gap-3 px-5 py-4">
      <FormMessage state={state} />
      <Textarea name="body" required rows={4} maxLength={5000} placeholder={placeholder} aria-label="Your reply" />
      <div className="flex justify-end"><SubmitButton icon={Send} pendingText="Sending…">{buttonText}</SubmitButton></div>
    </form>
  );
}
