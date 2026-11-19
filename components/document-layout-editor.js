"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, LayoutTemplate, Loader2, X } from "lucide-react";
import { Alert, Button, Card, cx } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { DocPreview } from "@/components/doc-preview";
import { LayoutPanel } from "@/components/layout-panel";
import { buildModel } from "@/lib/doc-model";
import { PAPERS, TEMPLATES, resolveLayout } from "@/lib/doc-templates";
import { saveDocumentLayout } from "@/app/app/documents/actions";
import { DocView } from "@/components/doc-view";
import { IMAGE_EVENT, exportDocImage } from "@/components/doc-image";
import { DOC_ACTION } from "@/components/doc-side";

// The document as the customer will see it, with print/PDF and an optional
// layout panel. Financial values come from the saved document only.
export function DocumentLayoutEditor({ doc, items, business, payLink, canEdit, canSetDefault, printHref, pdfHref, extraTemplates = false, lockedTemplates = false }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const resolved = resolveLayout({ kind: doc.kind, template: doc.template, paper: doc.paper, layout: doc.layout }, business);
  const initial = { template: resolved.template, paper: resolved.paper, layout: doc.layout || {}, payment_instructions: doc.payment_instructions || "" };
  const [value, setValue] = useState(initial);
  const [asDefault, setAsDefault] = useState(false);
  const deferred = useDeferredValue(value);
  const model = useMemo(() => buildModel({ doc: { ...doc, ...deferred }, items, business, payLink }), [doc, items, business, payLink, deferred]);
  const opened = useRef(initial).current; // how it looked when this page opened (for "Undo changes")
  const dirty = JSON.stringify(value) !== JSON.stringify(opened);
  const issued = !["draft", "pending_approval"].includes(doc.status);

  // "Image" (next to PDF): a full-size copy, off screen, is turned into a PNG
  const shot = useRef(null);
  const [imaging, setImaging] = useState(false);
  useEffect(() => {
    const go = async () => {
      if (imaging) return;
      setImaging(true);
      try {
        await new Promise((r) => setTimeout(r, 50)); // let the off-screen copy render
        const how = await exportDocImage(shot.current?.firstElementChild, doc.number || "document");
        if (how === "downloaded") toast("Image saved. Send it on WhatsApp, or wherever you like.");
      } catch { toast.error("Couldn't make the image. Try the PDF instead."); }
      finally { setImaging(false); }
    };
    window.addEventListener(IMAGE_EVENT, go);
    return () => window.removeEventListener(IMAGE_EVENT, go);
  }, [imaging, doc.number, toast]);

  // "Template & paper…" in the top bar's ⋯ menu
  const top = useRef(null);
  useEffect(() => {
    const on = (e) => {
      if (e.detail !== "template" || !canEdit) return;
      setOpen(true);
      setTimeout(() => top.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 0);
    };
    window.addEventListener(DOC_ACTION, on);
    return () => window.removeEventListener(DOC_ACTION, on);
  }, [canEdit]);

  // A pick saves straight away (no "Save layout" to forget), so the customer's
  // link, the PDF and "Preview as customer" always show what's on screen.
  const savedRef = useRef(JSON.stringify(initial));
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  useEffect(() => {
    const now = JSON.stringify(value);
    if (now === savedRef.current) return;
    setStatus("saving");
    const t = setTimeout(() => start(async () => {
      const r = await saveDocumentLayout(doc.id, value, { asDefault: false });
      if (r?.error) {
        toast(r.error, "error");
        setValue(JSON.parse(savedRef.current)); // back to what's really saved
        setStatus("idle");
      } else { savedRef.current = now; setStatus("saved"); }
    }), 500);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeDefault = (on) => {
    setAsDefault(on);
    if (!on) return;
    start(async () => {
      const r = await saveDocumentLayout(doc.id, value, { asDefault: true });
      if (r?.error) { toast(r.error, "error"); setAsDefault(false); } else toast(r.message);
    });
  };

  return (
    <div ref={top} className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[13px] text-ink-3">
          <span className="font-medium text-ink-2">{TEMPLATES[model.template].name}</span> · {PAPERS[model.paper].label}
        </p>
        {/* drafts: in view; sent and unpaid: from ⋯ ("Templates & paper…"); paid or cancelled: never */}
        {canEdit && (!issued || open) && (
          <Button size="sm" variant={open ? "soft" : "secondary"} icon={open ? X : LayoutTemplate} onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Close" : "Templates"}
          </Button>
        )}
      </div>

      {imaging && (
        <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
          <div ref={shot}><DocView model={model} /></div>
        </div>
      )}
      <div className={cx("grid grid-cols-[minmax(0,1fr)] gap-4", open && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0 rounded-2xl bg-tray p-3 sm:p-5">
          <DocPreview model={model} />
        </div>
        {open && (
          <Card className="p-5 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto">
            {issued && <Alert intent="info" size="sm" live={false} title="Already issued" className="mb-4">You can change how it looks. Amounts, items and the branding it was sent with stay the same, and the change is logged.</Alert>}
            <LayoutPanel kind={doc.kind} value={value} onChange={setValue} brandColor={business.brand_color} extraTemplates={extraTemplates} lockedTemplates={lockedTemplates} />
            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
              {canSetDefault && (
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <input type="checkbox" checked={asDefault} disabled={pending} onChange={(e) => makeDefault(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                  Use as default for new {doc.kind === "quote" ? "quotations" : "invoices"}
                </label>
              )}
              <div className="flex items-center gap-3">
                <p className="mr-auto inline-flex items-center gap-1.5 text-[13px] text-ink-3" role="status" aria-live="polite">
                  {status === "saving" || pending ? <><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Saving…</> : status === "saved" ? <><Check className="size-3.5 text-success" aria-hidden="true" />Saved. Your customer sees this.</> : "Changes save as you pick."}
                </p>
                <Button variant="ghost" size="sm" disabled={!dirty || pending} onClick={() => setValue(opened)}>Undo changes</Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
