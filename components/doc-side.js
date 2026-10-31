"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check, CircleAlert, Copy, Download, ExternalLink, FileCode2, Link2, MessageCircle, Wallet } from "lucide-react";
import { Button, Field, Input, cx } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { saveEInvoiceDetails } from "@/app/app/documents/einvoice-actions";

// Pieces of the invoice page's side column that need the browser. The top
// bar (components/document-actions.js) owns Record payment, Remind and the
// Template panel; anything else on the page asks for them with docAction().
export const DOC_ACTION = "usetally:doc-action";
export function docAction(name) { window.dispatchEvent(new CustomEvent(DOC_ACTION, { detail: name })); }

// icon by name: server pages can't hand a component to the browser
const ICONS = { wallet: Wallet, remind: BellRing };
export function DocActionButton({ action, icon, children, ...rest }) {
  return <Button {...rest} icon={ICONS[icon]} onClick={() => docAction(action)}>{children}</Button>;
}
export function DocActionLink({ action, children, className }) {
  return <button type="button" onClick={() => docAction(action)} className={cx("font-semibold text-brand-ink hover:underline", className)}>{children}</button>;
}

// The customer's link as one slim bar under the header: is it opened, and the three ways to use it
export function LinkBar({ link, whatsapp, state, opened }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] max-sm:h-11 max-sm:flex-1 max-sm:justify-center max-sm:ring-1 max-sm:ring-line";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-line sm:flex-nowrap">
      <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-[13px]">
        <Link2 className="size-4 shrink-0 text-ink-3" aria-hidden />
        <span className="shrink-0 font-medium text-ink">Customer link</span>
        <span className={cx("min-w-0 truncate", opened ? "text-ink-2" : "text-warn-ink")}>· {state}</span>
      </span>
      <span className="flex w-full gap-1.5 sm:w-auto">
        <button type="button" className={btn} onClick={async () => {
          try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Couldn't copy the link."); }
        }}>{copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy"}</button>
        <a className={btn} href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" />WhatsApp</a>
        <a className={btn} href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />Open</a>
      </span>
    </div>
  );
}

// E-invoicing as one line ("3 details missing · Fix"); Fix asks for every
// missing business detail in one small form, here, instead of Settings.
// fields: [{ key, label, value, placeholder }] (only the missing ones)
export function EInvoiceLine({ docId, ready, missingCount, fields, canFix, banner = false, nigeria = true }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, f.value || ""])));
  const [pending, start] = useTransition();
  const fixable = canFix && fields.length > 0;
  const save = () => start(async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries(values)) form.set(k, v);
    const r = await saveEInvoiceDetails(form);
    if (r?.error) return toast.error(r.error);
    toast.success("Saved. Your invoices now carry these details.");
    setOpen(false);
    router.refresh();
  });
  const label = ready ? "Ready" : `${missingCount} detail${missingCount === 1 ? "" : "s"} missing`;
  return (
    <>
      {banner ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warn-soft px-4 py-3 text-[13px] text-warn-ink ring-1 ring-inset ring-warn/30">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">This customer is a business and may need a proper e-invoice to claim the VAT. {label}.</span>
          {fixable && <button type="button" onClick={() => setOpen(true)} className="font-semibold underline underline-offset-2">Fix</button>}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 text-[13px] ring-1 ring-line">
          <FileCode2 className="size-4 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1"><span className="font-medium text-ink">E-invoicing</span> <span className={ready ? "text-ink-3" : "text-warn-ink"}>· {label}</span></span>
          {!ready && fixable && <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center font-semibold text-brand-ink hover:underline">Fix</button>}
          <a href={`/app/documents/${docId}/einvoice`} className="inline-flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink" aria-label={`Download the e-invoice (XML)${nigeria ? " for NRS" : ""}`} title="Download e-invoice (XML)"><Download className="size-4" /></a>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add your e-invoicing details" description="These go on every invoice. You can change them later in Settings → Business & branding."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={pending} onClick={save}>Save details</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`ei-${f.key}`} className={f.wide ? "sm:col-span-2" : undefined}>
              <Input id={`ei-${f.key}`} value={values[f.key]} placeholder={f.placeholder} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            </Field>
          ))}
        </div>
      </Modal>
    </>
  );
}
