import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/context";
import { Badge, Logo } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";
import { AdminNav } from "./nav";

export const metadata = { title: { default: "Platform admin", template: "%s · Usetally admin" } };

const NAV = [
  { href: "/admin", label: "Overview", icon: "overview" },
  { href: "/admin/businesses", label: "Businesses", icon: "businesses" },
  { href: "/admin/plans", label: "Plans & pricing", icon: "plans" },
  { href: "/admin/marketing", label: "Marketing", icon: "marketing" },
  { href: "/admin/integrations", label: "Integrations", icon: "integrations" },
  { href: "/admin/tax", label: "Tax filing", icon: "tax" },
  { href: "/admin/health", label: "Health & logs", icon: "health" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export default async function AdminLayout({ children }) {
  await requirePlatformAdmin();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex items-center gap-2.5"><Logo withWord /><Badge tone="violet" size="sm">Admin</Badge></Link>
          <div className="flex-1" />
          <ThemeToggle />
          <Link href="/app" className="hidden items-center gap-1.5 text-[13px] font-medium whitespace-nowrap text-ink-2 hover:text-ink sm:inline-flex"><ArrowLeft className="size-4" />Back to app</Link>
        </div>
        <AdminNav items={NAV} mobile />
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
