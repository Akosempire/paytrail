"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Input, cx } from "@/components/ui";
import { rankCustomers } from "@/lib/builder-core";

// Type to search customers (recent first). The last row adds what you typed as
// a new customer. The chosen customer shows as a chip with what they still owe.
export function CustomerPicker({ customers, recentIds = [], owes = {}, value, onChange, onAddNew, money, invalid, describedBy }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const input = useRef(null);
  const listId = useId();
  const selected = customers.find((c) => c.id === value) || null;
  const results = useMemo(() => rankCustomers(customers, q, recentIds).slice(0, 8), [customers, q, recentIds]);
  const addRow = q.trim() ? { add: true, name: q.trim() } : null;
  const rows = addRow ? [...results, addRow] : results;

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  function choose(row) {
    if (!row) return;
    setOpen(false);
    setQ("");
    if (row.add) onAddNew(row.name);
    else onChange(row.id);
  }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && rows.length) { e.preventDefault(); choose(rows[active]); }
    else if (e.key === "Escape") { if (open) { e.stopPropagation(); setOpen(false); } }
  }

  if (selected) {
    const due = owes[selected.id] || 0;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-subtle px-3 py-1.5 ring-1 ring-line">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{selected.name}{selected.company ? ` · ${selected.company}` : ""}</span>
            <span className="block truncate text-[12.5px] text-ink-3">{[selected.email, selected.phone].filter(Boolean).join(" · ") || "No contact details saved"}</span>
          </span>
          {due > 0 && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-medium text-warn-ink">Owes {money(due)}</span>}
          <button id="customer-change" type="button" onClick={() => { onChange(""); setTimeout(() => input.current?.focus(), 0); }} aria-label={`Change customer (${selected.name})`}
            className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"><X className="size-4" /></button>
        </span>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute top-[22px] left-3 z-[1] size-[18px] -translate-y-1/2 text-ink-3 sm:top-5" aria-hidden />
      <Input id="customer-search" ref={input} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        placeholder={customers.length ? "Search customers or type a new name" : "Type your customer's name"} autoComplete="off"
        className="h-11 pl-10 text-[16px] sm:h-10 sm:text-sm" />
      {open && rows.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 animate-rise overflow-y-auto rounded-xl bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-line">
          {rows.map((r, i) => (
            <li key={r.add ? "__add" : r.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onPointerDown={(e) => e.preventDefault()} onClick={() => choose(r)} onMouseEnter={() => setActive(i)}
              className={cx("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm", i === active ? "bg-hover" : "", r.add && "border-t border-line text-brand-ink")}>
              {r.add ? <><UserPlus className="size-4 shrink-0" /><span className="truncate">+ Add “{r.name}” as a new customer</span></> : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{r.name}{r.company ? ` · ${r.company}` : ""}</span>
                    {(r.email || r.phone) && <span className="block truncate text-[12px] text-ink-3">{r.email || r.phone}</span>}
                  </span>
                  {owes[r.id] > 0 && <span className="shrink-0 text-[12px] text-warn-ink">Owes {money(owes[r.id])}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
