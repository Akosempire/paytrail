"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, BookUser, ChevronDown, Loader2, Pencil, Plus } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { PostcodeField } from "@/components/postcode-field";
import { archiveCustomer, saveCustomer } from "@/app/app/customers/actions";

// Phones first: name, WhatsApp and email up front (big inputs, the right
// keyboard for each), the rest behind "More details", one full-width Save.
// On Android, "Pick from phone contacts" fills them in one tap.
const EMPTY = { name: "", company: "", email: "", phone: "", address: "", notes: "", tax_id: "", postcode: "" };
const BIG = "h-12 text-[16px] sm:h-10 sm:text-sm";

export function CustomerButton({ customer, variant = "primary", size = "md", autoOpen = false }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // "New customer" from the ➕ opens the form straight away
  useEffect(() => { if (autoOpen && !customer) setOpen(true); }, [autoOpen, customer]);
  const [form, setForm] = useState(customer || EMPTY);
  const [more, setMore] = useState(Boolean(customer && (customer.company || customer.address || customer.tax_id || customer.notes || customer.postcode)));
  const [canPick, setCanPick] = useState(false);
  useEffect(() => { setCanPick(typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window); }, []);
  const [pending, start] = useTransition();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function pick() {
    try {
      const [c] = await navigator.contacts.select(["name", "tel", "email"], { multiple: false });
      if (!c) return;
      setForm((f) => ({ ...f, name: c.name?.[0] || f.name, phone: c.tel?.[0] || f.phone, email: c.email?.[0] || f.email }));
    } catch { /* closed the picker */ }
  }
  function save() {
    if (!form.name.trim()) return toast.error("Enter their name.");
    start(async () => {
      const r = await saveCustomer(customer?.id || null, form);
      if (r.error) return toast.error({ title: "Not saved", message: r.error });
      toast(r.message);
      setOpen(false);
      if (!customer) { setForm(EMPTY); setMore(false); }
      router.refresh();
    });
  }
  return (
    <>
      <Button variant={variant} size={size} icon={customer ? Pencil : Plus} onClick={() => setOpen(true)}>{customer ? "Edit" : "Add customer"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={customer ? "Edit customer" : "New customer"}
        footer={<>
          <Button onClick={() => setOpen(false)} className="max-sm:hidden">Cancel</Button>
          <Button variant="primary" icon={pending ? Loader2 : undefined} loading={pending} onClick={save} className="max-sm:h-12 max-sm:flex-1 max-sm:text-[16px]">{customer ? "Save changes" : "Save customer"}</Button>
        </>}>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {canPick && !customer && (
            <button type="button" onClick={pick} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-soft text-[15px] font-semibold text-brand-ink ring-1 ring-brand-line/60">
              <BookUser className="size-5" />Pick from phone contacts
            </button>
          )}
          <Field label="Name" htmlFor="c-name"><Input id="c-name" value={form.name} onChange={set("name")} autoComplete="name" autoCapitalize="words" enterKeyHint="next" placeholder="Chioma Obi" className={BIG} /></Field>
          <Field label="WhatsApp / phone" htmlFor="c-ph" optional><Input id="c-ph" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" enterKeyHint="next" placeholder="0803 123 4567" className={BIG} /></Field>
          <Field label="Email" htmlFor="c-em" optional hint="To email them quotes, invoices and receipts."><Input id="c-em" type="email" inputMode="email" value={form.email} onChange={set("email")} autoComplete="email" autoCapitalize="none" enterKeyHint="done" placeholder="chioma@obifoods.ng" className={BIG} /></Field>

          <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-3.5 py-2 text-[14px] font-medium text-ink-2 ring-1 ring-line hover:bg-hover">
            <span className="flex min-w-0 flex-col text-left leading-tight">{more ? "Fewer details" : "More details"}<span className="truncate text-[12px] font-normal text-ink-3">Company, address, postcode, TIN, notes</span></span>
            <ChevronDown className={`size-4 transition-transform ${more ? "rotate-180" : ""}`} />
          </button>
          {more && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company" htmlFor="c-co" optional><Input id="c-co" value={form.company} onChange={set("company")} autoComplete="organization" className={BIG} /></Field>
              <Field label="Tax ID (TIN)" htmlFor="c-tin" optional hint="Business customers need it to claim VAT.">
                <Input id="c-tin" value={form.tax_id || ""} onChange={set("tax_id")} placeholder="12345678-0001" autoComplete="off" className={BIG} />
              </Field>
              <Field label="Address" htmlFor="c-ad" optional className="sm:col-span-2"><Input id="c-ad" value={form.address} onChange={set("address")} autoComplete="street-address" className={BIG} /></Field>
              <PostcodeField id="c-pc" value={form.postcode || ""} area={customer?.postcode_area || ""} verified={Boolean(customer?.postcode_verified_at)} onChange={(code) => setForm((f) => ({ ...f, postcode: code }))} />
              <Field label="Private notes" htmlFor="c-no" optional hint="Only your team sees these." className="sm:col-span-2"><Textarea id="c-no" rows={2} value={form.notes} onChange={set("notes")} /></Field>
              {customer && (
                <button type="button" className="inline-flex items-center gap-1.5 self-start text-[13.5px] font-medium text-danger-ink hover:underline sm:col-span-2"
                  onClick={() => start(async () => { const r = await archiveCustomer(customer.id, !customer.archived_at); toast(r.message); setOpen(false); router.refresh(); })}>
                  <Archive className="size-4" />{customer.archived_at ? "Restore this customer" : "Archive this customer"}
                </button>
              )}
            </div>
          )}
          <button type="submit" hidden />
        </form>
      </Modal>
    </>
  );
}
