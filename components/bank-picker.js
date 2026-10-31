"use client";
import { useId, useState } from "react";
import { Landmark } from "lucide-react";
import { Input, cx } from "@/components/ui";
import { NG_BANKS, searchBanks } from "@/lib/ng-banks";

// The bank name as free text, with Nigerian banks suggested as you type
// (GTBank, OPay, Moniepoint…). Any other bank can still be typed in full.
export function BankPicker({ id, name = "bank_name", defaultValue = "", value: controlled, onChange, suggest = true, placeholder = "Start typing your bank" }) {
  const [own, setOwn] = useState(defaultValue || "");
  const value = controlled ?? own;
  const set = (v) => { setOwn(v); onChange?.(v); };
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useId();
  const matches = suggest ? (value.trim() ? searchBanks(value, NG_BANKS, 8) : NG_BANKS.slice(0, 8)) : [];
  const exact = matches.length === 1 && matches[0].toLowerCase() === value.trim().toLowerCase();
  const show = open && matches.length > 0 && !exact;
  const choose = (b) => { set(b); setOpen(false); };
  return (
    <div className="relative">
      <Input id={id} name={name} value={value} autoComplete="off" placeholder={placeholder} icon={Landmark}
        role={suggest ? "combobox" : undefined} aria-expanded={suggest ? show : undefined} aria-controls={suggest ? list : undefined} aria-autocomplete={suggest ? "list" : undefined}
        aria-activedescendant={show ? `${list}-${active}` : undefined}
        onChange={(e) => { set(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
          else if (e.key === "Enter") { e.preventDefault(); choose(matches[active]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {show && (
        <ul id={list} role="listbox" className="absolute inset-x-0 z-30 mt-1 max-h-72 overflow-auto rounded-lg bg-surface p-1 shadow-[var(--shadow-pop)] ring-1 ring-line">
          {matches.map((b, i) => (
            <li key={b} id={`${list}-${i}`} role="option" aria-selected={i === active}
              onPointerDown={(e) => { e.preventDefault(); choose(b); }} onPointerEnter={() => setActive(i)}
              className={cx("flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm sm:min-h-9", i === active ? "bg-hover text-ink" : "text-ink-2")}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
