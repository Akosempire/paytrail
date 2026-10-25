"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Pencil, Plus } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { archiveCustomer, saveCustomer } from "@/app/app/customers/actions";

export function CustomerButton({ customer, variant = "primary", size = "md" }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(customer || { name: "", company: "", email: "", phone: "", address: "", notes: "" });
  const [pending, start] = useTransition();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  function save() {
    start(async () => {
      const r = await saveCustomer(customer?.id || null, form);
      if (r.error) return toast.error({ title: "Not saved", message: r.error });
      toast(r.message);
      setOpen(false);
      if (!customer) setForm({ name: "", company: "", email: "", phone: "", address: "", notes: "" });
      router.refresh();
    });
  }
  return (
    <>
      <Button variant={variant} size={size} icon={customer ? Pencil : Plus} onClick={() => setOpen(true)}>{customer ? "Edit" : "Add customer"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={customer ? "Edit customer" : "New customer"}
        footer={<>
          {customer && <Button variant="danger" icon={Archive} className="mr-auto" onClick={() => start(async () => { const r = await archiveCustomer(customer.id, !customer.archived_at); toast(r.message); setOpen(false); router.refresh(); })}>{customer.archived_at ? "Restore" : "Archive"}</Button>}
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" icon={pending ? Loader2 : undefined} loading={pending} onClick={save}>Save</Button>
        </>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="c-name"><Input id="c-name" value={form.name} onChange={set("name")} /></Field>
          <Field label="Company" htmlFor="c-co" optional><Input id="c-co" value={form.company} onChange={set("company")} /></Field>
          <Field label="Email" htmlFor="c-em"><Input id="c-em" type="email" value={form.email} onChange={set("email")} /></Field>
          <Field label="Phone / WhatsApp" htmlFor="c-ph" optional><Input id="c-ph" value={form.phone} onChange={set("phone")} /></Field>
          <Field label="Address" htmlFor="c-ad" optional className="sm:col-span-2"><Input id="c-ad" value={form.address} onChange={set("address")} /></Field>
          <Field label="Private notes" htmlFor="c-no" optional hint="Only your team sees these." className="sm:col-span-2"><Textarea id="c-no" rows={2} value={form.notes} onChange={set("notes")} /></Field>
        </div>
      </Modal>
    </>
  );
}
