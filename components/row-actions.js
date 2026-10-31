"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, MoreHorizontal } from "lucide-react";
import { cx } from "@/components/ui";

// ⋯ on each invoice row: open it, copy the customer's link, download the PDF
export function RowActions({ id, token, number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const link = typeof window !== "undefined" && token ? `${window.location.origin}/d/${token}` : "";
  const item = "flex h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink";
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={`More for ${number}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className="inline-flex size-11 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-lg bg-surface p-1 shadow-[var(--shadow-pop)] ring-1 ring-line">
          <a role="menuitem" href={`/app/documents/${id}`} className={item}><ExternalLink className="size-4" />Open</a>
          {token && (
            <button role="menuitem" type="button" className={item} onClick={async () => {
              try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked */ }
              setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 1200);
            }}>{copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy customer link"}</button>
          )}
          {token && <a role="menuitem" href={`/d/${token}/pdf`} className={cx(item)}><Download className="size-4" />Download PDF</a>}
        </div>
      )}
    </div>
  );
}
