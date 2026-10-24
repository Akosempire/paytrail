"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { DocView } from "@/components/doc-view";
import { PAPERS } from "@/lib/doc-templates";

// A chrome-free page that prints exactly one document at its paper size.
// Sheet sizes use @page with the paper's margins; thermal rolls get a page as
// long as the receipt, measured after fonts load.
export function DocPrint({ model, papers, basePath, pdfHref, backHref, autoPrint }) {
  const ref = useRef(null);
  const [pageCss, setPageCss] = useState("");
  const spec = PAPERS[model.paper];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await document.fonts?.ready; } catch { /* fonts optional */ }
      await Promise.all([...(ref.current?.querySelectorAll("img") || [])].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
      if (cancelled) return;
      if (spec.thermal) {
        const px = ref.current.querySelector(".pt-doc").getBoundingClientRect().height;
        const mm = Math.ceil(px * 25.4 / 96) + 2;
        setPageCss(`@page { size: ${spec.w}mm ${mm}mm; margin: 0; }`);
      } else {
        setPageCss(`@page { size: ${spec.w}mm ${spec.h}mm; margin: ${spec.margin}mm; }`);
      }
      if (autoPrint) setTimeout(() => window.print(), 250);
    })();
    return () => { cancelled = true; };
  }, [model.paper, spec, autoPrint]);

  return (
    <div className="pt-print-root min-h-dvh bg-[#e9e9e6] px-3 py-6 print:p-0">
      <style>{`${pageCss} @media print { html, body { background: #fff !important; } }`}</style>
      <div className="pt-print-chrome mx-auto mb-5 flex max-w-3xl flex-wrap items-center gap-2 text-[13px]">
        {backHref && <Link href={backHref} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 font-medium text-[#344054] hover:bg-white/70"><ArrowLeft className="size-4" />Back</Link>}
        <label className="ml-auto flex items-center gap-2 text-[#475467]">Paper
          <select value={model.paper} onChange={(e) => { window.location.href = `${basePath}?paper=${e.target.value}`; }}
            className="h-9 rounded-md bg-white px-2 text-[#101828] ring-1 ring-[#d0d5dd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1570ef]">
            {papers.map((p) => <option key={p} value={p}>{PAPERS[p].label}</option>)}
          </select>
        </label>
        {pdfHref && <a href={pdfHref} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 font-medium text-[#101828] ring-1 ring-[#d0d5dd] hover:bg-[#f9fafb]"><Download className="size-4" />PDF</a>}
        <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#101828] px-3.5 font-semibold text-white hover:bg-[#1d2939] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1570ef] focus-visible:ring-offset-2"><Printer className="size-4" />Print</button>
        {spec.thermal && <p className="w-full text-right text-[12px] text-[#667085]">In the print dialog choose your receipt printer, set margins to "None" and scale to 100%.</p>}
      </div>
      <div ref={ref} className="flex justify-center">
        <DocView model={model} />
      </div>
    </div>
  );
}
