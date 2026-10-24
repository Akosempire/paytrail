"use client";
import { useActionState } from "react";
import { Check } from "lucide-react";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui-client";
import { acceptInvite } from "./actions";

export function AcceptInvite({ token, name }) {
  const [state, action] = useActionState(acceptInvite, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <Field label="Your name" htmlFor="name" hint="Your teammates see this on activity."><Input id="name" name="name" defaultValue={name} required /></Field>
      <SubmitButton size="lg" block icon={Check} pendingText="Joining…">Accept & join team</SubmitButton>
    </form>
  );
}
