"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Pencil, Plus } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { minorToInput, VAT_CATEGORIES } from "@/lib/money";
import { archiveProduct, saveProduct } from "@/app/app/products/actions";

const EMPTY = { name: "", description: "", unit: "", price: "", vat_category: "standard" };
const BIG = "h-12 text-[16px] sm:h-10 sm:text-sm";

export function ProductButton({ product, currencySymbol = "₦", variant = "primary", size = "md", label }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const initial = product ? { name: product.name, description: product.description, unit: product.unit, price: minorToInput(product.unit_price_minor), vat_category: product.vat_category } : EMPTY;
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  function save() {
    if (!form.name.trim()) return toast.error("Enter a name.");
    start(async () => {
      const r = await saveProduct(product?.id || null, form);
      if (r.error) return toast.error({ title: "Not saved", message: r.error });
      toast(r.message);
      setOpen(false);
      if (!product) setForm(EMPTY);
      router.refresh();
    });
  }
  return (
    <>
      <Button variant={variant} size={size} icon={product ? Pencil : Plus} onClick={() => { setForm(initial); setOpen(true); }} aria-label={product ? `Edit ${product.name}` : undefined}>
        {label ?? (product ? "Edit" : "Add product")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={product ? "Edit product" : "New product"}
        footer={<>
          <Button onClick={() => setOpen(false)} className="max-sm:hidden">Cancel</Button>
          <Button variant="primary" icon={pending ? Loader2 : undefined} loading={pending} onClick={save} className="max-sm:h-12 max-sm:flex-1 max-sm:text-[16px]">{product ? "Save changes" : "Save product"}</Button>
        </>}>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label="Name" htmlFor="p-name"><Input id="p-name" value={form.name} onChange={set("name")} autoCapitalize="sentences" placeholder="Logo design" className={BIG} /></Field>
          <Field label="Description" htmlFor="p-desc" optional hint="Shown under the item on the invoice."><Textarea id="p-desc" rows={2} value={form.description} onChange={set("description")} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price" htmlFor="p-price"><Input id="p-price" inputMode="decimal" prefix={currencySymbol} value={form.price} onChange={set("price")} placeholder="0" className={BIG} /></Field>
            <Field label="Unit" htmlFor="p-unit" optional><Input id="p-unit" value={form.unit} onChange={set("unit")} placeholder="hour, kg, job" maxLength={20} className={BIG} /></Field>
          </div>
          <Field label="VAT" htmlFor="p-vat" hint="Zero-rated and exempt items get no VAT, and the invoice says why.">
            <Select id="p-vat" value={form.vat_category} onChange={set("vat_category")}>
              {Object.entries(VAT_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          {product && (
            <button type="button" className="inline-flex items-center gap-1.5 self-start text-[13.5px] font-medium text-danger-ink hover:underline"
              onClick={() => start(async () => { const r = await archiveProduct(product.id, !product.archived_at); if (r.error) return toast.error(r.error); toast(r.message); setOpen(false); router.refresh(); })}>
              <Archive className="size-4" />{product.archived_at ? "Restore this product" : "Archive this product"}
            </button>
          )}
          <button type="submit" hidden />
        </form>
      </Modal>
    </>
  );
}
