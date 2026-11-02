import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cx } from "@/components/ui";

// the small "this is on paid plans" line shown where a locked feature lives
// (works in server and client components)
export function UpgradeNote({ title, children, className, compact = false }) {
  return (
    <div className={cx("flex items-start gap-3 rounded-xl bg-violet-soft/60 ring-1 ring-inset ring-violet-soft", compact ? "px-3 py-2.5" : "px-4 py-3.5", className)}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-violet-ink shadow-[var(--shadow-xs)]"><Sparkles className="size-3.5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        {children && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{children}</p>}
      </div>
      <Link href="/app/settings/billing" className="shrink-0 self-center rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-canvas shadow-[var(--shadow-xs)] hover:opacity-90">Upgrade</Link>
    </div>
  );
}

// a tiny tag next to a locked option
export function PaidTag({ className }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md bg-violet-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-ink", className)}><Sparkles className="size-2.5" aria-hidden="true" />Paid</span>;
}
