import Link from "next/link";
import { Logo } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";

export function LegalLayout({ title, updated, children }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-[860px] items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/"><Logo withWord /></Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-[860px] px-4 pb-20 sm:px-6">
        <article className="rounded-2xl bg-surface p-6 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-10">
          <p className="text-overline text-brand-ink">Legal</p>
          <h1 className="mt-2 text-title-1 text-ink">{title}</h1>
          <p className="mt-1 text-[13px] text-ink-3">Last updated {updated}</p>
          <div className="legal mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-ink-2">{children}</div>
        </article>
        <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-3">
          <Link href="/terms" className="hover:text-ink">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy Policy</Link>
          <Link href="/dpa" className="hover:text-ink">Data Processing Agreement</Link>
          <Link href="/subprocessors" className="hover:text-ink">Sub-processors</Link>
          <Link href="/" className="hover:text-ink">Home</Link>
        </nav>
      </main>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-title-2 text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function List({ items }) {
  return <ul className="ml-5 list-disc space-y-1.5 marker:text-ink-3">{items.map((i) => <li key={typeof i === "string" ? i : i.key}>{i}</li>)}</ul>;
}
