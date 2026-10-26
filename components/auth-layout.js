import Link from "next/link";
import { preload } from "react-dom";
import { Logo } from "@/components/ui";
import { ThemeSwitch } from "@/components/landing/theme-switch";
import { DotField } from "@/components/landing/dot-field";

// Sign in, sign up and password pages. Same world as the landing page: warm
// paper, the moving dot field, the display font, and on wide screens a
// "welcome receipt" that prints out listing what an account includes.
const LINES = ["Branded quotes", "Hidden costs & real profit", "Online payments", "Automatic receipts", "Team roles & approvals"];

function WelcomeReceipt() {
  return (
    <div className="mx-auto w-full max-w-[380px]" aria-hidden="true">
      <div className="relative z-10 flex h-12 items-center justify-between rounded-2xl bg-hero-ink px-5 font-mono text-[11px] tracking-[0.16em] text-hero uppercase shadow-[0_18px_40px_-20px_rgba(20,16,8,.6)]">
        <span>Usetally</span><span className="flex items-center gap-2"><span className="size-1.5 animate-pulse rounded-full bg-[#5a9dff]" />Printing</span>
      </div>
      <div className="-mt-2 mx-4 overflow-hidden">
        <div className="receipt-print receipt-shadow">
          <div className="receipt-edge bg-hero-paper px-6 pt-7 pb-9 font-mono text-[12px] leading-relaxed text-hero-ink">
            <p className="font-display text-center text-[22px] leading-none">usetally</p>
            <p className="mt-1.5 text-center text-[10.5px] tracking-[0.18em] text-hero-ink-2 uppercase">Welcome receipt</p>
            <div className="my-4 border-t border-dashed border-hero-ink/30" />
            <ul className="space-y-1.5">
              {LINES.map((l) => (
                <li key={l} className="flex items-baseline gap-2">
                  <span>{l}</span>
                  <span className="min-w-3 flex-1 -translate-y-[3px] border-b border-dotted border-hero-ink/25" />
                  <span className="text-hero-accent">✓</span>
                </li>
              ))}
            </ul>
            <div className="my-4 border-t border-dashed border-hero-ink/30" />
            <p className="flex justify-between"><span>Card needed to start</span><span>NO</span></p>
            <p className="mt-1 flex justify-between text-[14px] font-semibold"><span>Our cut of payments</span><span className="text-hero-accent">0%</span></p>
            <div className="mt-5 flex h-8 items-stretch justify-center gap-[2px] opacity-70">
              {[...("usetally-welcome-0001")].map((ch, i) => <span key={i} className="bg-hero-ink" style={{ width: 1 + ((ch.charCodeAt(0) + i) % 3) }} />)}
            </div>
            <p className="mt-3 text-center text-[10.5px] tracking-[0.16em] text-hero-ink-2 uppercase">*** Thank you ***</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthLayout({ children }) {
  preload("/fonts/orbitron-700.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <div className="auth-skin relative min-h-dvh bg-hero text-hero-ink">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0"><DotField /></div>
      <div className="relative z-[1] grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <aside className="hidden flex-col px-12 py-8 lg:flex">
          <Link href="/" className="self-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff]"><Logo withWord wordClass="text-hero-ink" /></Link>
          <div className="my-auto py-10">
            <p className="text-center text-[13px] font-semibold tracking-[0.14em] text-hero-accent uppercase">Quotes → invoices → receipts</p>
            <p className="font-display mx-auto mt-4 max-w-[460px] text-center text-[clamp(30px,3vw,42px)] leading-[1.05]">Every naira, from quote to receipt.</p>
            <div className="mt-10"><WelcomeReceipt /></div>
          </div>
        </aside>
        <main className="flex flex-col px-4 py-6 sm:px-10">
          <div className="flex items-center justify-between">
            <Link href="/" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff] lg:invisible"><Logo withWord wordClass="text-hero-ink" /></Link>
            <ThemeSwitch />
          </div>
          <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-10">
            <div className="rounded-[26px] bg-hero-paper/90 p-6 shadow-[0_1px_2px_rgba(20,16,8,.05),0_30px_60px_-34px_rgba(20,16,8,.45)] ring-1 ring-black/[.05] backdrop-blur-sm sm:p-9 dark:ring-white/[.06]">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
