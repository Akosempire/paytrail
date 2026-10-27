import { CheckCircle2, CircleAlert, FileCode2, Download } from "lucide-react";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";

// On an invoice: is it ready for Nigeria's e-invoicing, and the UBL file
export function EInvoiceCard({ docId, check, nigeria = true }) {
  return (
    <Card>
      <CardHeader title="E-invoicing" icon={FileCode2} description={nigeria ? "NRS e-invoicing (UBL format)" : "Structured e-invoice (UBL format)"}
        actions={check.ready ? <Badge tone="success" size="sm">Ready</Badge> : <Badge tone="warn" size="sm">Needs details</Badge>} />
      <div className="flex flex-col gap-3 p-5 text-[13px]">
        {check.missing.length > 0 && (
          <ul className="space-y-1.5">{check.missing.map((m) => <li key={m} className="flex gap-2 text-ink-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />{m}</li>)}</ul>
        )}
        {check.advice.length > 0 && (
          <ul className="space-y-1.5">{check.advice.map((m) => <li key={m} className="flex gap-2 text-ink-3"><CircleAlert className="mt-0.5 size-4 shrink-0 text-ink-3" />{m}</li>)}</ul>
        )}
        {check.ready && !check.advice.length && <p className="flex gap-2 text-ink-2"><CheckCircle2 className="size-4 shrink-0 text-success" />Ready for e-invoicing.</p>}
        <a href={`/app/documents/${docId}/einvoice`} className={buttonClass({ size: "sm" }) + " self-start"}><Download className="size-3.5" aria-hidden />Download e-invoice (XML)</a>
      </div>
    </Card>
  );
}
