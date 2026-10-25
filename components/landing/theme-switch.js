"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// A small dotted track with a sliding knob. The knob's position and icon come
// from the page's data-theme (via the dark: variant), so it is right on the
// first paint with no flash; React only tracks the state for screen readers.
export function ThemeSwitch() {
  const [dark, setDark] = useState(null);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);
  const toggle = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("pt-theme", next); } catch { /* storage blocked */ }
    setDark(next === "dark");
  };
  return (
    <button type="button" role="switch" aria-checked={Boolean(dark)} aria-label="Dark mode" onClick={toggle} title="Switch light / dark"
      className="group relative h-[30px] w-[56px] shrink-0 rounded-full bg-hero-paper/80 ring-1 ring-black/[.08] backdrop-blur-sm transition-colors ring-inset hover:ring-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff] dark:ring-white/10 dark:hover:ring-white/25">
      {/* dotted track, like the page's dot field */}
      <span aria-hidden="true" className="absolute inset-[5px] rounded-full opacity-50 [background:radial-gradient(circle,var(--color-hero-ink-2)_0.7px,transparent_1.1px)_0_0/5px_5px]" />
      <span aria-hidden="true"
        className="absolute top-[3px] left-[3px] flex size-6 items-center justify-center rounded-full bg-hero-ink text-hero shadow-[0_1px_2px_rgba(0,0,0,.25),0_4px_10px_-4px_rgba(0,0,0,.4)] transition-transform duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] dark:translate-x-[26px]">
        <Sun className="size-3.5 transition-all duration-300 group-active:scale-90 dark:hidden" />
        <Moon className="hidden size-3.5 transition-all duration-300 group-active:scale-90 dark:block" />
      </span>
    </button>
  );
}
