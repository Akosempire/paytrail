"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [["/founder", "Overview"], ["/founder/plans", "Plans & prices"], ["/founder/customers", "Customers"]];

export function FounderNav() {
  const path = usePathname();
  return (
    <nav className="border-b border-line bg-surface" aria-label="Founder">
      <div className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {TABS.map(([href, label]) => {
          const on = href === "/founder" ? path === href : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined}
              className={`relative whitespace-nowrap px-3 py-3 text-sm font-medium ${on ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand" : "text-ink-3 hover:text-ink"}`}>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
