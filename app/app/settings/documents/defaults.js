"use client";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { FileText, Loader2, Receipt, ScrollText } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { DocPreview } from "@/components/doc-preview";
import { LayoutPanel } from "@/components/layout-panel";
import { buildModel } from "@/lib/doc-model";
import { defaultLayout } from "@/lib/doc-templates";
import { sampleDocument } from "@/lib/sample-document";
import { saveDocumentDefaults } from "./actions";

const KINDS = [["quote", "Quotations", ScrollText], ["invoice", "Invoices", FileText], ["receipt", "Receipts", Receipt]];

export function DocumentDefaults({ business, samples }) {
  const toast = useToast();
  const [kind, setKind] = useState("invoice");
  const [values, setValues] = useState(() => Object.fromEntries(KINDS.map(([k]) => {
    const d = defaultLayout(business, k);
    return [k, { template: d.template, paper: d.paper, layout: d.layout || {} }];
  })));
  const [pending, start] = useTransition();
  const value = values[kind];
  const deferred = useDeferredValue(value);
  // your latest real document if there is one, otherwise a sample in your branding
  const real = samples[kind];
  const sample = useMemo(() => real || sampleDocument(kind, business), [real, kind, business]);
  const model = useMemo(() => {
    const override = { template: deferred.template, paper: deferred.paper, layout: deferred.layout };
    return buildModel({ ...sample, business, override });
  }, [sample, deferred, business]);

  const save = () => start(async () => {
    const r = await saveDocumentDefaults(kind, value);
    toast(r.error || r.message, r.error ? "error" : undefined);
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="inline-flex gap-0.5 self-start rounded-lg bg-tray p-1" role="tablist" aria-label="Document type">
        {KINDS.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
            className={cx("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]", kind === k ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="p-5">
          <LayoutPanel kind={kind} value={value} onChange={(v) => setValues({ ...values, [kind]: v })} brandColor={business.brand_color} showInstructions={false} idPrefix={`def-${kind}`} />
          <div className="mt-5 border-t border-line pt-4">
            <Button variant="primary" icon={pending ? Loader2 : undefined} loading={pending} onClick={save}>Save default</Button>
          </div>
        </Card>
        <div className="min-w-0 rounded-2xl bg-tray p-3 sm:p-5">
          <p className="mb-3 text-[13px] text-ink-3">
            {real ? `Showing your latest ${kind === "quote" ? "quotation" : kind} with these settings.` : `Sample ${kind === "quote" ? "quotation" : kind} with your branding. Your own appears here once you've made one.`}
          </p>
          <DocPreview model={model} label={`Preview: ${value.template} template`} />
        </div>
      </div>
    </div>
  );
}
