"use client";
import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FileText, Receipt, Users, Wallet, Building2, PlugZap, UsersRound, CreditCard,
  Plus, Menu, X, LogOut, ChevronsUpDown, Check, ShieldCheck, Sparkles, Tags, Printer, CircleHelp,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Alert, Avatar, Button, Logo, cx } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";
import { PageSkeleton } from "@/components/page-skeleton";
import { signOut } from "@/app/(auth)/actions";
import { InstallPrompt, clearOfflinePages } from "@/components/pwa";
import { Tour, TourButton } from "@/components/tour";
import { switchBusiness } from "@/app/app/actions";

function navFor({ kind, canSettings, canBilling, canPayments, canTeam, canCosts }) {
  return [
    { items: [{ href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
    { title: "Sell", items: [
      { href: "/app/quotes", label: "Quotes", icon: FileText },
      { href: "/app/invoices", label: "Invoices", icon: Receipt },
      { href: "/app/customers", label: "Customers", icon: Users },
    ] },
    { title: "Money", items: [
      { href: "/app/payments", label: "Payments & receipts", icon: Wallet },
      canCosts && { href: "/app/settings/costs", label: "Cost presets", icon: Tags },
    ].filter(Boolean) },
    { title: "Settings", items: [
      canSettings && { href: "/app/settings", label: "Business & branding", icon: Building2, exact: true },
      canSettings && { href: "/app/settings/documents", label: "Documents & printing", icon: Printer },
      canPayments && { href: "/app/settings/payments", label: "Payment setup", icon: PlugZap },
      kind === "company" && { href: "/app/settings/team", label: canTeam ? "Team & roles" : "Team", icon: UsersRound },
      canBilling && { href: "/app/settings/billing", label: "Plan & billing", icon: CreditCard },
      { href: "/app/settings/privacy", label: "Privacy & data", icon: ShieldCheck },
    ].filter(Boolean) },
  ].filter((g) => g.items.length);
}

export function AppShell({ business, member, memberships, isPlatformAdmin, allowance, perms, logo, tour, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  // the link you click lights up at once, before the server answers
  const [goingTo, setGoingTo] = useState(null);
  useEffect(() => { setOpen(false); setSwitcher(false); setGoingTo(null); }, [pathname]);
  const nav = navFor({ kind: business.kind, ...perms });
  const here = goingTo || pathname;
  const active = (item) => item.exact ? here === item.href : here === item.href || here.startsWith(item.href + "/");

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="relative px-3 pt-4 pb-2">
        <button type="button" onClick={() => setSwitcher(!switcher)}
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left ring-1 ring-transparent hover:bg-hover hover:ring-line">
          <Avatar name={business.name} src={logo} color={logo ? null : business.brand_color} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{business.name}</span>
            <span className="block truncate text-xs text-ink-3">{business.kind === "company" ? "Company" : "Freelancer"} · {member.roleLabel}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-3" />
        </button>
        {switcher && (
          <div className="absolute inset-x-3 top-full z-30 mt-1 animate-rise rounded-xl bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-line">
            <p className="px-2.5 pt-1.5 pb-1 text-overline text-ink-3">Your businesses</p>
            {memberships.map((m) => (
              <form key={m.business_id} action={switchBusiness}>
                <input type="hidden" name="business_id" value={m.business_id} />
                <button type="submit" className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-hover">
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {m.business_id === business.id && <Check className="size-4 text-brand" />}
                </button>
              </form>
            ))}
            <Link href="/onboarding?new=1" className="mt-1 flex items-center gap-2 rounded-md border-t border-line px-2.5 py-2 text-sm text-ink-2 hover:bg-hover">
              <Plus className="size-4" /> Add another business
            </Link>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 scroll-thin" aria-label="Main">
        {nav.map((group, i) => (
          <div key={i} className="mt-4 first:mt-1">
            {group.title && <p className="px-3 pb-1.5 text-overline text-ink-3">{group.title}</p>}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const on = active(item);
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={on ? "page" : undefined} data-tour={`nav:${item.href}`}
                      onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { setGoingTo(item.href); setOpen(false); } }}
                      className={cx("relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-75",
                        on ? "bg-brand-soft text-brand-ink ring-1 ring-inset ring-brand-line/60" : "text-ink-2 hover:bg-hover hover:text-ink")}>
                      <Icon className={cx("size-[18px]", on ? "text-brand" : "text-ink-3")} />
                      {item.label}
                      <PendingDot />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {isPlatformAdmin && (
          <div className="mt-4">
            <p className="px-3 pb-1.5 text-overline text-ink-3">{BRAND.name}</p>
            <Link href="/admin" className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-hover hover:text-ink">
              <ShieldCheck className="size-[18px] text-violet" /> Platform admin
            </Link>
          </div>
        )}
      </nav>

      <TrialMeter allowance={allowance} canBilling={perms.canBilling} status={business.subscription_status} />

      <div className="border-t border-line p-3">
        {/* phones: the theme switch lives here instead of the top bar */}
        <ThemeToggle row className="mb-1 lg:hidden" />
        <div className="flex items-center gap-3 rounded-lg p-2">
          <Avatar name={member.full_name || member.email} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{member.full_name || "You"}</span>
            <span className="block truncate text-xs text-ink-3">{member.email}</span>
          </span>
          <TourButton className="inline-flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
            <span className="sr-only">Take the tour</span><CircleHelp className="size-4" aria-hidden="true" />
          </TourButton>
          <form action={signOut} onSubmit={clearOfflinePages}>
            <button type="submit" aria-label="Sign out" title="Sign out" className="inline-flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-canvas">
      <InstallPrompt />
      <Tour userId={tour?.userId} done={tour?.done} />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-line bg-surface lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#101828]/45" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[284px] max-w-[85vw] animate-rise bg-surface shadow-[var(--shadow-dialog)]">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button type="button" className="inline-flex size-10 items-center justify-center rounded-md ring-1 ring-line-strong lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu" data-tour="menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <Link href="/app" className="lg:hidden"><Logo className="size-8" /></Link>
          <div className="flex-1" />
          <ThemeToggle className="max-lg:hidden" />
          <Button href="/app/invoices/new" variant="secondary" icon={Plus} className="max-sm:hidden">Invoice</Button>
          <Button href="/app/quotes/new" variant="primary" icon={Plus} data-tour="new-quote"><span className="max-sm:hidden">New </span>Quote</Button>
        </header>
        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{goingTo && goingTo !== pathname ? <PageSkeleton /> : children}</main>
      </div>
    </div>
  );
}

function TrialMeter({ allowance, canBilling, status }) {
  if (!allowance) return null;
  if (allowance.reason === "deletion_pending") return (
    <Link href="/app/settings/privacy" className="mx-3 mb-3 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <Alert intent="error" size="sm" live={false} title="Deletion scheduled" className="rounded-xl hover:border-line-strong">
        Deletes on {new Date(allowance.deletes_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. Select to cancel.
      </Alert>
    </Link>
  );
  if (status === "active" && allowance.limit == null) return null;
  const used = allowance.used ?? 0;
  const limit = allowance.limit;
  const trial = status === "trialing";
  let text;
  if (trial && allowance.mode === "documents") text = `${Math.max(limit - used, 0)} of ${limit} free documents left`;
  else if (trial && allowance.mode === "days") text = allowance.ends_at ? `Trial ends ${new Date(allowance.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Trial";
  else if (limit != null) text = `${used} of ${limit} documents this month`;
  else text = "Subscription needed";
  const pct = limit ? Math.min(100, (used / limit) * 100) : allowance.allowed ? 30 : 100;
  return (
    <div className="mx-3 mb-3 rounded-xl bg-tray p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink"><Sparkles className="size-4 text-brand" />{trial ? "Free trial" : "Your plan"}</div>
      <p className="mt-1 text-xs text-ink-3">{text}</p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line"><div className={cx("h-full rounded-full", allowance.allowed ? "bg-brand" : "bg-danger")} style={{ width: `${pct}%` }} /></div>
      {canBilling && <Link href="/app/settings/billing" className="mt-2.5 inline-block text-xs font-semibold text-brand-ink hover:underline">{trial ? "See plans" : "Manage plan"} →</Link>}
    </div>
  );
}

// a small pulse on the link while its page is on the way (fixed size, no layout shift)
function PendingDot() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" data-pending={pending ? "true" : undefined} className={cx("ml-auto size-1.5 rounded-full bg-brand transition-opacity duration-150", pending ? "animate-pulse opacity-100" : "opacity-0")} />;
}
