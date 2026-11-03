"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cx } from "@/components/ui";

// Hide amounts (the eye, like a banking app): blurs every amount marked
// data-money, on this device, until it's tapped again. Remembered, and set
// before the page paints (app/layout.js), so amounts never flash.
export const HIDE_MONEY_KEY = "pt-hide-money";

export function MoneyEye({ className }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(document.documentElement.dataset.hideMoney === "1"); }, []);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    if (next) document.documentElement.dataset.hideMoney = "1"; else delete document.documentElement.dataset.hideMoney;
    try { localStorage.setItem(HIDE_MONEY_KEY, next ? "1" : "0"); } catch { /* private mode */ }
  };
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button type="button" onClick={toggle} aria-pressed={hidden} aria-label={hidden ? "Show amounts" : "Hide amounts"} title={hidden ? "Show amounts" : "Hide amounts"}
      className={cx("inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]", className)}>
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
