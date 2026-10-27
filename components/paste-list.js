"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, CircleAlert } from "lucide-react";
import { Button, Textarea, cx } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { formatMoney } from "@/lib/money";
import { parseItemList } from "@/lib/paste-items";

// Paste the list a customer sent (WhatsApp, SMS, email) and get invoice items.
// Shows what it read before anything is added, so you can check it.
export function PasteList({ open, onClose, onAdd, currency, initialText = "" }) {
  const [text, setText] = useState(initialText);
  const [mode, setMode] = useState("each");
  const box = useRef(null);
  useEffect(() => { if (open) { setText(initialText); setTimeout(() => box.current?.focus(), 50); } }, [open, initialText]);
  const items = useMemo(() => parseItemList(text, { mode }), [text, mode]);
  const noPrice = items.filter((i) => i.price == null).length;
  const total = items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
  const money = (v) => formatMoney(Math.round(v * 100), currency);

  async function fromClipboard() {
    try { const t = await navigator.clipboard.readText(); if (t) setText(t); } catch { box.current?.focus(); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Paste a list"
      description="Copy the customer's message (WhatsApp, SMS or email) and paste it here. Each line becomes an item."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={ClipboardPaste} disabled={!items.length} onClick={() => onAdd(items)}>{items.length ? `Add ${items.length} item${items.length === 1 ? "" : "s"}` : "Add items"}</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Textarea ref={box} rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="The list"
            placeholder={"2 x Rice 50kg - 45,000\nGroundnut oil 5L ₦12,000\nIndomie carton ×5 @ 7.5k"} className="font-mono text-[13px]" />
          {!text && <Button size="sm" icon={ClipboardPaste} onClick={fromClipboard} className="absolute right-2 bottom-2">Paste</Button>}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          Prices in the list are
          <span className="inline-flex rounded-lg bg-tray p-0.5">
            {[["each", "for one"], ["total", "for the whole line"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
                className={cx("rounded-md px-2.5 py-1 text-[12.5px] font-medium", mode === k ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>{label}</button>
            ))}
          </span>
        </div>

        {items.length > 0 && (
          <div className="overflow-hidden rounded-xl ring-1 ring-line">
            <ul className="max-h-[38vh] divide-y divide-line overflow-y-auto">
              {items.map((i, n) => (
                <li key={n} className="flex items-baseline gap-3 px-3.5 py-2.5 text-[13.5px]">
                  <span className="min-w-0 flex-1 truncate text-ink">{i.description}</span>
                  <span className="shrink-0 tabular-nums text-ink-3">{i.quantity} ×</span>
                  <span className={cx("w-28 shrink-0 text-right tabular-nums", i.price == null ? "text-warn-ink" : "text-ink")}>{i.price == null ? "No price" : money(i.price)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-line bg-subtle px-3.5 py-2.5 text-[13px]">
              <span className="text-ink-3">{items.length} item{items.length === 1 ? "" : "s"}</span>
              <span className="font-semibold tabular-nums text-ink">{money(total)}</span>
            </div>
          </div>
        )}
        {noPrice > 0 && <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><CircleAlert className="size-3.5 shrink-0" />{noPrice} line{noPrice === 1 ? " has" : "s have"} no price yet. Add {noPrice === 1 ? "it" : "them"} after.</p>}
      </div>
    </Modal>
  );
}
