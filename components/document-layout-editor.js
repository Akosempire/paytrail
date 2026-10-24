"use client";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { Download, Loader2, Printer, SlidersHorizontal, X } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { DocPreview } from "@/components/doc-preview";
import { LayoutPanel } from "@/components/layout-panel";
import { buildModel } from "@/lib/doc-model";
import { PAPERS, TEMPLATES, resolveLayout } from "@/lib/doc-templates";
import { saveDocumentLayout } from "@/app/app/documents/actions";

// The document as the customer will see it, with print/PDF and an optional
// layout panel. Financial values come from the saved document only.
export function DocumentLayoutEditor({ doc, items, business, payLink, canEdit, canSetDefault, printHref, pdfHref }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const resolved = resolveLayout({ kind: doc.kind, template: doc.template, paper: doc.paper, layout: doc.layout }, business);
  const initial = { template: resolved.template, paper: resolved.paper, layout: doc.layout || {}, payment_instructions: doc.payment_instructions || "" };
  const [value, setValue] = useState(initial);
  const [asDefault, setAsDefault] = useState(false);
  const deferred = useDeferredValue(value);
  const model = useMemo(() => buildModel({ doc: { ...doc, ...deferred }, items, business, payLink }), [doc, items, business, payLink, deferred]);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const issued = !["draft", "pending_approval"].includes(doc.status);

  const save = () => start(async () => {
    const r = await saveDocumentLayout(doc.id, value, { asDefault });
    if (r?.error) toast(r.error, "error"); else { toast(r.message); setOpen(false); }
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[13px] text-ink-3">
          <span className="font-medium text-ink-2">{TEMPLATES[model.template].name}</span> · {PAPERS[model.paper].label}
        </p>
        {canEdit && doc.status !== "void" && (
          <Button size="sm" variant={open ? "soft" : "secondary"} icon={open ? X : SlidersHorizontal} onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Close" : "Customise"}
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={Printer} href={printHref}>Print</Button>
        <a href={pdfHref} className="inline-flex h-8 items-center gap-2 rounded-sm bg-surface px-3 text-[13px] font-medium text-ink shadow-[var(--shadow-xs)] ring-1 ring-inset ring-line-strong hover:bg-subtle focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">
          <Download className="size-3.5" />Download PDF
        </a>
      </div>

      <div className={cx("grid grid-cols-[minmax(0,1fr)] gap-4", open && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0 rounded-2xl bg-tray p-3 sm:p-5">
          <DocPreview model={model} />
        </div>
        {open && (
          <Card className="p-5 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto">
            {issued && <p className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-[12.5px] text-info-ink">This document has been issued. You can change how it looks; amounts, items and the branding it was sent with stay the same. The change is logged.</p>}
            <LayoutPanel kind={doc.kind} value={value} onChange={setValue} brandColor={business.brand_color} />
            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
              {canSetDefault && (
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                  Use as default for new {doc.kind === "quote" ? "quotations" : "invoices"}
                </label>
              )}
              <div className="flex gap-2">
                <Button variant="primary" icon={pending ? Loader2 : undefined} loading={pending} disabled={!dirty && !asDefault} onClick={save}>Save layout</Button>
                <Button variant="ghost" disabled={!dirty} onClick={() => setValue(initial)}>Reset</Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
