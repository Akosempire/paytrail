"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Boxes, Loader2, Plus, Search } from "lucide-react";
import { Input, cx } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { formatMoney } from "@/lib/money";
import { searchTrackOja } from "@/app/app/documents/pos-actions";

// Products from the connected TrackOja store. Picking one adds a line with its
// name and price, linked to the product so TrackOja deducts the stock once the
// invoice is fully paid.
export function TrackOjaPicker({ open, onClose, onPick, currency, store }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState({ products: [], error: null, searched: false });
  const [pending, start] = useTransition();
  const [added, setAdded] = useState({});
  const box = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setAdded({});
    setTimeout(() => box.current?.focus(), 50);
  }, [open]);

  // search as you type (debounced); the latest answer wins
  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(() => start(async () => {
      const r = await searchTrackOja(q.trim());
      if (n !== seq.current) return;
      setResult({ products: r?.products || [], error: r?.error || null, searched: true });
    }), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, open]);

  const money = (v) => formatMoney(v, currency);
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Add from TrackOja"
      description={store ? `Products from ${store}. TrackOja deducts the stock when this invoice is fully paid.` : "Products from your TrackOja store."}>
      <div className="flex flex-col gap-4">
        <Input ref={box} icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, SKU or barcode" aria-label="Search TrackOja products" />
        {result.error ? (
          <p className="rounded-lg bg-danger-soft px-3.5 py-3 text-[13px] text-danger-ink">{result.error}</p>
        ) : result.searched && !result.products.length && !pending ? (
          <p className="px-1 py-6 text-center text-[13px] text-ink-3">{q ? "No products match." : "This store has no active products yet."}</p>
        ) : (
          <div className="overflow-hidden rounded-xl ring-1 ring-line">
            <ul className="max-h-[46vh] divide-y divide-line overflow-y-auto" aria-busy={pending}>
              {!result.searched && <li className="flex items-center justify-center gap-2 px-4 py-8 text-[13px] text-ink-3"><Loader2 className="size-4 animate-spin" />Loading products…</li>}
              {result.products.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => { onPick(p); setAdded((a) => ({ ...a, [p.id]: (a[p.id] || 0) + 1 })); }}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-hover focus-visible:bg-hover focus-visible:outline-none">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-3 ring-1 ring-line"><Boxes className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{p.name}</span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {[p.sku && `SKU ${p.sku}`, p.track_inventory && p.stock_qty != null && `${+Number(p.stock_qty).toFixed(3)}${p.unit ? ` ${p.unit}` : ""} in stock`].filter(Boolean).join(" · ") || " "}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13.5px] font-medium tabular-nums text-ink">{money(p.price_minor)}</span>
                    <span className={cx("inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium ring-1 ring-inset", added[p.id] ? "bg-success-soft text-success-ink ring-success/25" : "text-brand-ink ring-brand-line/60")}>
                      <Plus className="size-3.5" />{added[p.id] ? `Added ${added[p.id]}` : "Add"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
