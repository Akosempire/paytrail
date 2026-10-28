"use client";
import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { Field, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui-client";
import { decidePosLink } from "./actions";

export function ApproveForm({ returnTo, state, store, businesses, initial, links }) {
  const [result, action] = useActionState(decidePosLink, null);
  const [business, setBusiness] = useState(initial);
  const current = links[business];
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="state" value={state} />
      <input type="hidden" name="store" value={store} />
      <FormMessage state={result} />
      {businesses.length > 1 ? (
        <Field label="Connect to" htmlFor="business_id">
          <Select id="business_id" name="business_id" value={business} onChange={(e) => setBusiness(e.target.value)}>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="business_id" value={business} />
      )}
      {current && (
        <p className="rounded-lg bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn-ink ring-1 ring-inset ring-warn/30">
          This business is connected to <strong>{current}</strong> now. Approving replaces that link.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <SubmitButton name="decision" value="approve" size="lg" block icon={Check} pendingText="Connecting…">Approve</SubmitButton>
        <SubmitButton name="decision" value="deny" variant="secondary" size="lg" block>Deny</SubmitButton>
      </div>
    </form>
  );
}
