"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { minorToInput } from "@/lib/money";
import { recordFiling } from "./actions";

export function FilingForm({ token, returnId, vat, currency }) {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const submit = (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => { const r = await recordFiling(token, returnId, form); if (r.error) return toast.error(r.error); toast.success(r.message); router.refresh(); });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-tray p-4">
      <p className="text-[14px] font-semibold text-ink">Record the filing</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Amount to pay (${currency})`} htmlFor={`a-${returnId}`}><Input id={`a-${returnId}`} name="amount" inputMode="decimal" defaultValue={minorToInput(vat)} required /></Field>
        <Field label="Payment reference" htmlFor={`p-${returnId}`}><Input id={`p-${returnId}`} name="paymentReference" placeholder="From Rev360 / Remita" /></Field>
        <Field label="Filing reference" htmlFor={`r-${returnId}`} optional><Input id={`r-${returnId}`} name="reference" /></Field>
        <Field label="Acknowledgement" htmlFor={`f-${returnId}`} optional hint="PDF or screenshot, up to 4 MB."><Input id={`f-${returnId}`} name="file" type="file" accept=".pdf,image/*" /></Field>
      </div>
      <Button type="submit" variant="primary" icon={FileCheck2} loading={pending} className="self-start">Mark as filed &amp; tell the business</Button>
    </form>
  );
}
