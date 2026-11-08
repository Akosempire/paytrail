import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireFounderView } from "@/lib/context";
import { Badge, Logo } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";

export const metadata = { title: { default: "Founder dashboard", template: "%s · Usetally" }, robots: { index: false } };

// Read-only. Founders are not platform admins: the admin area (settings, keys,
// health, integrations, tax, marketing) stays closed to them.
export default async function FounderLayout({ children }) {
  const ctx = await requireFounderView();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/founder" className="flex items-center gap-2.5"><Logo withWord /><Badge tone="brand" size="sm">Founder</Badge></Link>
          <div className="flex-1" />
          {ctx.isPlatformAdmin && <Link href="/admin" className="hidden text-[13px] font-medium whitespace-nowrap text-ink-2 hover:text-ink sm:inline">Platform admin</Link>}
          <ThemeToggle />
          <Link href="/app" className="inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /><span className="hidden sm:inline">Back to app</span><span className="sm:hidden">App</span></Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
