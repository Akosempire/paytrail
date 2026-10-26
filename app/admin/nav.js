"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Blocks, Building2, LayoutDashboard, Settings2, Tags } from "lucide-react";
import { cx } from "@/components/ui";

const ICONS = { health: Activity, overview: LayoutDashboard, businesses: Building2, plans: Tags, integrations: Blocks, settings: Settings2 };

export function AdminNav({ items, mobile = false }) {
  const path = usePathname();
  return (
    <nav className={mobile ? "flex items-center gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] md:hidden" : "hidden items-center gap-0.5 rounded-lg bg-tray p-1 md:flex"} aria-label="Admin">
      {items.map((i) => {
        const Icon = ICONS[i.icon];
        const on = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium md:h-8", on ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>
            <Icon className="size-3.5" />{i.label}
          </Link>
        );
      })}
    </nav>
  );
}
