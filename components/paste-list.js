"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, CircleAlert, Loader2, Sparkles, UserRound, StickyNote } from "lucide-react";
import { Badge, Button, Textarea, cx } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { formatMoney } from "@/lib/money";
import { parseItemList } from "@/lib/paste-items";
import { readPastedList } from "@/app/app/documents/paste-actions";

// Paste the message a customer sent (WhatsApp, SMS, email) and get invoice
// items. On paid plans, AI reads it (chatty messages, sentences, emails with
// sign-offs); otherwise, or if the AI can't, simple line-by-line reading.
// Shows what it read before anything is added, so you can check it.
export function PasteList({ open, onClose, onAdd, currency, initialText = "", ai = true }) {
  const [text, setText] = useState(initialText);
  const [mode, setMode] = useState("each");
  const [read, setRead] = useState(null);       // AI result for `readFor`
  const [readFor, setReadFor] = useState("");
  const [reading, setReading] = useState(false);
  const [aiOff, setAiOff] = useState(!ai);      // plan, no key, or failed: simple reading
  const [simple, setSimple] = useState(false);  // the person chose simple reading
  const [off, setOff] = useState(() => new Set()); // unticked lines
  const [useCustomer, setUseCustomer] = useState(true);
  const [useNotes, setUseNotes] = useState(true);
  const box = useRef(null);
  const cache = useRef(new Map());

  useEffect(() => { if (open) { setText(initialText); setSimple(false); setTimeout(() => box.current?.focus(), 50); } }, [open, initialText]);

  // ask the AI once the text stops changing
  useEffect(() => {
    if (!open || aiOff) return;
    const t = text.trim();
    if (t.length < 3) { setRead(null); setReadFor(""); return; }
    if (cache.current.has(t)) { setRead(cache.current.get(t)); setReadFor(t); return; }
    let live = true;
    const timer = setTimeout(async () => {
      setReading(true);
      try {
        const r = await readPastedList(t, currency);
        if (!live) return;
        if (r?.ai) { cache.current.set(t, r); setRead(r); setReadFor(t); }
        else if (["plan", "off", "signed-out"].includes(r?.fallback)) setAiOff(true);
        else { setRead(null); setReadFor(t); }
      } catch { if (live) { setRead(null); setReadFor(t); } }
      finally { if (live) setReading(false); }
    }, 700);
    return () => { live = false; clearTimeout(timer); };
  }, [text, open, aiOff, currency]);

  const rules = useMemo(() => parseItemList(text, { mode }), [text, mode]);
  const byAi = Boolean(read && readFor === text.trim() && !simple);
  const items = byAi ? read.items : rules;
  useEffect(() => { setOff(new Set()); }, [items]);
  const chosen = items.filter((_, n) => !off.has(n));
  const noPrice = chosen.filter((i) => i.price == null).length;
  const total = chosen.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
  const money = (v) => formatMoney(Math.round(v * 100), currency);
  const who = byAi && (read.customer?.name || read.customer?.phone || read.customer?.email) ? read.customer : null;
  const notes = byAi && read.notes ? read.notes : "";
  const waiting = reading && !byAi;

  async function fromClipboard() {
    try { const t = await navigator.clipboard.readText(); if (t) setText(t); } catch { box.current?.focus(); }
  }
  const toggle = (n) => setOff((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const add = () => onAdd(chosen, { customer: who && useCustomer ? who : null, notes: notes && useNotes ? notes : "" });

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Paste a list"
      description={aiOff ? "Copy the customer's message (WhatsApp, SMS or email) and paste it here. Each line becomes an item." : "Paste the customer's message (WhatsApp, SMS or email) as it is. AI picks out the items, quantities and prices."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={ClipboardPaste} disabled={!chosen.length || waiting} onClick={add}>{chosen.length ? `Add ${chosen.length} item${chosen.length === 1 ? "" : "s"}` : "Add items"}</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Textarea ref={box} rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="The customer's message" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
            placeholder={aiOff ? "2 x Rice 50kg - 45,000\nGroundnut oil 5L ₦12,000\nIndomie carton ×5 @ 7.5k" : "Good morning ma, I need 3 bags of rice 50kg and 2 gallons of groundnut oil. Rice is 45k per bag, oil 12,500 each. Add delivery 3000."} className="font-mono text-[13px]" />
          {!text && <Button size="sm" icon={ClipboardPaste} onClick={fromClipboard} className="absolute bottom-2 left-2">Paste from clipboard</Button>}
        </div>

        <div className="flex min-h-7 flex-wrap items-center gap-2 text-[13px] text-ink-2">
          {byAi ? (
            <>
              <Badge size="sm" tone="violet"><Sparkles className="size-3" aria-hidden="true" />Read by AI</Badge>
              <span className="text-ink-3">Check it, untick anything that isn't an item.</span>
              <button type="button" onClick={() => setSimple(true)} className="ml-auto text-[12.5px] font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline">Use simple reading</button>
            </>
          ) : waiting ? (
            <span className="inline-flex items-center gap-1.5 text-ink-3"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Reading the message with AI…</span>
          ) : text.trim() ? (
            <>
              Prices in the list are
              <span className="inline-flex rounded-lg bg-tray p-0.5">
                {[["each", "for one"], ["total", "for the whole line"]].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
                    className={cx("rounded-md px-2.5 py-1 text-[12.5px] font-medium", mode === k ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>{label}</button>
                ))}
              </span>
              {simple && read && readFor === text.trim() && <button type="button" onClick={() => setSimple(false)} className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-ink hover:underline"><Sparkles className="size-3.5" aria-hidden="true" />Use AI reading</button>}
              {!aiOff && !read && readFor === text.trim() && <span className="ml-auto text-[12.5px] text-ink-3">AI couldn't read it, so this is the simple reading.</span>}
            </>
          ) : null}
        </div>

        {items.length > 0 && !waiting && (
          <div className="overflow-hidden rounded-xl ring-1 ring-line">
            <ul className="max-h-[38vh] divide-y divide-line overflow-y-auto">
              {items.map((i, n) => (
                <li key={n}>
                  <label className={cx("flex cursor-pointer items-baseline gap-3 px-3.5 py-2.5 text-[13.5px] hover:bg-hover", off.has(n) && "opacity-50")}>
                    <input type="checkbox" checked={!off.has(n)} onChange={() => toggle(n)} className="size-4 shrink-0 translate-y-0.5 accent-[var(--color-brand)]" aria-label={`Add ${i.description}`} />
                    <span className={cx("min-w-0 flex-1 truncate text-ink", off.has(n) && "line-through")}>{i.description}</span>
                    <span className="shrink-0 tabular-nums text-ink-3">{i.quantity} ×</span>
                    <span className={cx("w-28 shrink-0 text-right tabular-nums", i.price == null ? "text-warn-ink" : "text-ink")}>{i.price == null ? "No price" : money(i.price)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-line bg-subtle px-3.5 py-2.5 text-[13px]">
              <span className="text-ink-3">{chosen.length} of {items.length} item{items.length === 1 ? "" : "s"}</span>
              <span className="font-semibold tabular-nums text-ink">{money(total)}</span>
            </div>
          </div>
        )}

        {(who || notes) && !waiting && (
          <div className="flex flex-col gap-2 rounded-xl bg-tray p-3 text-[13px]">
            {who && (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={useCustomer} onChange={(e) => setUseCustomer(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" />
                <span className="min-w-0"><span className="inline-flex items-center gap-1.5 font-medium text-ink"><UserRound className="size-3.5" aria-hidden="true" />Use as the customer</span><span className="block truncate text-ink-3">{[who.name, who.phone, who.email].filter(Boolean).join(" · ")}</span></span>
              </label>
            )}
            {notes && (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={useNotes} onChange={(e) => setUseNotes(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" />
                <span className="min-w-0"><span className="inline-flex items-center gap-1.5 font-medium text-ink"><StickyNote className="size-3.5" aria-hidden="true" />Add to notes</span><span className="block text-ink-3">{notes}</span></span>
              </label>
            )}
          </div>
        )}
        {noPrice > 0 && !waiting && <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><CircleAlert className="size-3.5 shrink-0" />{noPrice} line{noPrice === 1 ? " has" : "s have"} no price yet. Add {noPrice === 1 ? "it" : "them"} after.</p>}
      </div>
    </Modal>
  );
}
