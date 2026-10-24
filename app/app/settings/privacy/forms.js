"use client";
import { useActionState, useState } from "react";
import { RotateCcw, Trash2, UserX } from "lucide-react";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton, useActionToast } from "@/components/ui-client";
import { cancelBusinessDeletion, deleteMyAccount, requestBusinessDeletion } from "./actions";

export function DeleteBusinessForm({ name }) {
  const [state, action] = useActionState(requestBusinessDeletion, null);
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field label={<>Type <span className="font-semibold text-ink">{name}</span> to confirm</>} htmlFor="confirm-business">
        <Input id="confirm-business" name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </Field>
      <SubmitButton variant="destructive" icon={Trash2} disabled={!ok} pendingText="Scheduling…" className="self-start">Delete business in 30 days</SubmitButton>
    </form>
  );
}

export function CancelDeletionButton() {
  const [state, action] = useActionState(cancelBusinessDeletion, null);
  useActionToast(state);
  return (
    <form action={action}>
      <SubmitButton variant="primary" size="sm" icon={RotateCcw} pendingText="Cancelling…">Keep my business</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm({ email }) {
  const [state, action] = useActionState(deleteMyAccount, null);
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field label={<>Type <span className="font-semibold text-ink">{email}</span> to confirm</>} htmlFor="confirm-account">
        <Input id="confirm-account" name="confirm" type="email" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </Field>
      <SubmitButton variant="destructive" icon={UserX} disabled={!ok} pendingText="Deleting…" className="self-start">Delete my account now</SubmitButton>
    </form>
  );
}
