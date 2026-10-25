import Link from "next/link";
import { Scissors } from "lucide-react";
import { Logo } from "@/components/ui";
import { BRAND } from "@/lib/brand";

// The end of the receipt: a "cut here" perforation, the links, and an
// oversized wordmark filled with LED dots that echo the hero's dot field.
const WRAP = "mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10";
const LINK = "text-[14px] text-hero-ink-2 transition-colors hover:text-hero-ink focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-accent";

const COLUMNS = [
  ["Product", [["How it works", "#how-it-works"], ["Pricing", "#pricing"], ["Start free", "/signup"], ["Sign in", "/login"]]],
  ["Legal", [["Terms", "/terms"], ["Privacy", "/privacy"], ["Data processing", "/dpa"], ["Sub-processors", "/subprocessors"]]],
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden">
      {/* perforation */}
      <div className={`flex items-center gap-3 text-hero-ink-2/60 ${WRAP}`} aria-hidden="true">
        <Scissors className="size-4 -rotate-90" />
        <span className="h-0 flex-1 border-t-2 border-dashed border-current opacity-50" />
      </div>

      <div className={`grid grid-cols-2 gap-x-6 gap-y-10 pt-12 pb-6 md:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,0.5fr))] ${WRAP}`}>
        <div className="col-span-2 max-w-[380px] md:col-span-1">
          <Logo withWord className="size-8" wordClass="text-hero-ink" />
          <p className="mt-4 text-[15px] leading-relaxed text-hero-ink-2">
            Price the job, send the quote, get paid into your own account, and hand over the receipt. All in one place.
          </p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-hero-paper px-3 py-1.5 font-mono text-[11.5px] tracking-[0.08em] text-hero-ink-2 uppercase ring-1 ring-black/[.05] dark:ring-white/[.06]">
            <span className="size-1.5 rounded-full bg-hero-accent" aria-hidden="true" />
            {BRAND.domain}
          </p>
        </div>
        {COLUMNS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <p className="font-mono text-[11.5px] tracking-[0.14em] text-hero-ink-2/70 uppercase">{title}</p>
            <ul className="mt-4 space-y-2.5">
              {links.map(([label, href]) => (
                <li key={label}>{href.startsWith("#") ? <a href={href} className={LINK}>{label}</a> : <Link href={href} className={LINK}>{label}</Link>}</li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* giant LED wordmark */}
      <div className="relative" aria-hidden="true">
        <p className="footer-mark font-display pt-[0.06em] text-center leading-[0.86] whitespace-nowrap select-none">usetally</p>
      </div>

      <div className={`flex flex-col gap-1 pt-2 pb-8 font-mono text-[11.5px] tracking-[0.08em] text-hero-ink-2/70 uppercase sm:flex-row sm:justify-between ${WRAP}`}>
        <span>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</span>
        <span>*** Thank you for your business ***</span>
      </div>
    </footer>
  );
}
