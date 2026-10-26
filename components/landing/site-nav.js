"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LayoutDashboard, LogIn, Menu, UserPlus, UserRound, X } from "lucide-react";
import { Logo } from "@/components/ui";
import { ThemeSwitch } from "@/components/landing/theme-switch";

// Floating nav: a round logo badge and two pill buttons on the left, and a
// small white card on the right (Menu · account · theme). No bar behind it,
// so the page shows through; it stays at the top while you scroll.
const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq-title", label: "Questions" },
];
const cx = (...c) => c.filter(Boolean).join(" ");
const PILL = "h-11 items-center rounded-full px-5 text-[12.5px] font-semibold tracking-[0.04em] uppercase transition-[transform,background-color] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff] focus-visible:ring-offset-2 focus-visible:ring-offset-hero";
const CARD = "bg-hero-paper text-hero-ink shadow-[0_1px_2px_rgba(0,0,0,.08),0_10px_30px_-12px_rgba(0,0,0,.28)] ring-1 ring-black/[.06] dark:ring-white/10";

export function SiteNav({ signedIn, wrap }) {
  const [open, setOpen] = useState(null); // "menu" | "account" | null
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const toggle = (k) => setOpen((o) => (o === k ? null : k));
  const item = "flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium text-hero-ink hover:bg-hero-tint";

  return (
    <header className="pointer-events-none sticky top-0 z-30">
      <div className={cx("flex items-center justify-between gap-3 py-3 sm:py-4", wrap)}>
        <div className="pointer-events-auto flex items-center gap-2.5">
          {/* the logo mark on its own, as tall as the pills and the Menu card */}
          <Link href="/" aria-label="Usetally home" className="flex shrink-0 rounded-[12px] drop-shadow-[0_6px_14px_rgba(23,92,211,.28)] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff] focus-visible:ring-offset-2 focus-visible:ring-offset-hero">
            <Logo className="size-11 sm:size-12" />
          </Link>
          {/* signed in: the dashboard is in the account menu, so no pill for it here */}
          {!signedIn && (
            <Link href="/signup" className={cx(PILL, "hidden bg-[#175cd3] text-white hover:bg-[#1765e6] sm:inline-flex dark:bg-[#2563eb]")}>Get started free</Link>
          )}
          <a href="#pricing" className={cx(PILL, "hidden bg-[#dbeafe] text-[#175cd3] hover:bg-[#cfe2fd] md:inline-flex dark:bg-[#5a9dff]/20 dark:text-[#9cc3ff]")}>See pricing</a>
        </div>

        <div ref={ref} className="pointer-events-auto relative">
          <div className={cx("flex h-12 items-center rounded-2xl px-1.5 sm:h-14 sm:px-2", CARD)}>
            <button type="button" onClick={() => toggle("menu")} aria-expanded={open === "menu"} aria-controls="site-menu"
              className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[14px] font-semibold hover:bg-hero-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff]">
              {open === "menu" ? <X className="size-5" /> : <Menu className="size-5" />}<span>Menu</span>
            </button>
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-hero-line" />
            <button type="button" onClick={() => toggle("account")} aria-expanded={open === "account"} aria-controls="site-account" aria-label="Account"
              className="flex h-10 items-center gap-1.5 rounded-xl px-3 hover:bg-hero-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff]">
              <UserRound className="size-[18px]" /><ChevronDown className={cx("size-3.5 transition-transform", open === "account" && "rotate-180")} />
            </button>
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-hero-line" />
            <span className="px-2"><ThemeSwitch /></span>
          </div>

          {open === "menu" && (
            <nav id="site-menu" aria-label="Main" className={cx("absolute right-0 mt-2 w-[min(320px,calc(100vw-32px))] animate-rise rounded-2xl p-2", CARD)}>
              {LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(null)} className={item}>{l.label}</a>)}
              <div className="my-1.5 h-px bg-hero-line" />
              {signedIn
                ? <Link href="/app" className={cx(item, "text-[#175cd3] dark:text-[#9cc3ff]")}><LayoutDashboard className="size-4" />Open dashboard</Link>
                : <Link href="/signup" className={cx(item, "text-[#175cd3] dark:text-[#9cc3ff]")}><UserPlus className="size-4" />Get started free</Link>}
            </nav>
          )}
          {open === "account" && (
            <div id="site-account" className={cx("absolute right-0 mt-2 w-[min(260px,calc(100vw-32px))] animate-rise rounded-2xl p-2", CARD)}>
              {signedIn ? (
                <Link href="/app" className={item}><LayoutDashboard className="size-4" />Dashboard</Link>
              ) : (
                <>
                  <Link href="/login" className={item}><LogIn className="size-4" />Sign in</Link>
                  <Link href="/signup" className={item}><UserPlus className="size-4" />Create an account</Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
