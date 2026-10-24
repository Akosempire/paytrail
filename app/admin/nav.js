"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, Settings2, Tags } from "lucide-react";
import { cx } from "@/components/ui";

const ICONS = { overview: LayoutDashboard, businesses: Building2, plans: Tags, settings: Settings2 };

export function AdminNav({ items }) {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-0.5 rounded-lg bg-tray p-1 md:flex" aria-label="Admin">
      {items.map((i) => {
        const Icon = ICONS[i.icon];
        const on = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={cx("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium", on ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>
            <Icon className="size-3.5" />{i.label}
          </Link>
        );
      })}
    </nav>
  );
}
