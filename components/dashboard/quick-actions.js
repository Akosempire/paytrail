import Link from "next/link";
import { ClipboardPaste, FileText, HandCoins, Receipt, UserPlus } from "lucide-react";
import { cx } from "@/components/ui";

// The dashboard's shortcuts: the five things people start most often.
// Phones: five icons in a row, all in thumb reach. Computers: a row of tiles.
export function QuickActions({ canCreate = true, canRecord = true, hasUnpaid = false }) {
  const items = [
    canCreate && { href: "/app/quotes/new", label: "New quote", short: "Quote", hint: "Price a job", icon: FileText, main: true },
    canCreate && { href: "/app/invoices/new", label: "New invoice", short: "Invoice", hint: "Bill a customer", icon: Receipt },
    canCreate && { href: "/app/invoices/new?paste=1", label: "Paste an order", short: "Paste", hint: "From WhatsApp", icon: ClipboardPaste },
    canRecord && { href: hasUnpaid ? "#collect" : "/app/invoices?status=open", label: "Record payment", short: "Payment", hint: "Money received", icon: HandCoins },
    { href: "/app/customers?new=1", label: "New customer", short: "Customer", hint: "Save their details", icon: UserPlus },
  ].filter(Boolean);
  return (
    <nav aria-label="Quick actions">
      <ul className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((a) => (
          <li key={a.label} className="min-w-0">
            <Link href={a.href} aria-label={a.label}
              className={cx("group flex h-full flex-col items-center gap-1.5 rounded-xl px-1 py-3 ring-1 transition-[box-shadow,transform] duration-150 hover:-translate-y-px focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] sm:flex-row sm:gap-3 sm:p-3.5",
                a.main ? "bg-brand text-white ring-brand shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-pop)]" : "bg-surface text-ink ring-line shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-pop)]")}>
              <span className={cx("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", a.main ? "bg-white/15" : "text-brand-ink ring-1 ring-line")}>
                <a.icon className="size-[18px]" />
              </span>
              <span className="min-w-0 max-w-full text-center sm:text-left">
                <span className="block truncate text-[11.5px] font-semibold sm:hidden">{a.short}</span>
                <span className="hidden truncate text-[13.5px] font-semibold sm:block">{a.label}</span>
                <span className={cx("hidden truncate text-[12px] lg:block", a.main ? "text-white/75" : "text-ink-3")}>{a.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
