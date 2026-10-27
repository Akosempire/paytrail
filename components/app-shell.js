"use client";
import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FileText, Receipt, Users, Wallet, Building2, PlugZap, UsersRound, CreditCard,
  Plus, Menu, X, Home, ChevronRight, Landmark, LogOut, ChevronsUpDown, Check, ShieldCheck, Sparkles, Tags, Printer, CircleHelp, ClipboardPaste, UserPlus, HandCoins,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Alert, Avatar, Button, Logo, cx } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";
import { PageSkeleton } from "@/components/page-skeleton";
import { signOut } from "@/app/(auth)/actions";
import { InstallPrompt, clearOfflinePages } from "@/components/pwa";
import { Tour, TourButton } from "@/components/tour";
import { switchBusiness } from "@/app/app/actions";

function navFor({ kind, canSettings, canBilling, canPayments, canTeam, canCosts, canTax }) {
  return [
    { items: [{ href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
    { title: "Sell", items: [
      { href: "/app/quotes", label: "Quotes", icon: FileText },
      { href: "/app/invoices", label: "Invoices", icon: Receipt },
      { href: "/app/customers", label: "Customers", icon: Users },
    ] },
    { title: "Money", items: [
      { href: "/app/payments", label: "Payments & receipts", icon: Wallet },
      canTax && { href: "/app/tax", label: "Tax", icon: Landmark },
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
  const [create, setCreate] = useState(false); // the ➕ sheet on phones
  // the link you click lights up at once, before the server answers
  const [goingTo, setGoingTo] = useState(null);
  useEffect(() => { setOpen(false); setSwitcher(false); setCreate(false); setGoingTo(null); }, [pathname]);
  const nav = navFor({ kind: business.kind, ...perms });
  const here = goingTo || pathname;
  // screens with their own save bar at the bottom (editor, business settings) don't show the tabs
  const tabs = !/\/(new|edit)$/.test(pathname) && pathname !== "/app/settings";
  const active = (item) => item.exact ? here === item.href : here === item.href || here.startsWith(item.href + "/");

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* trial and Free: Usetally's brand sits on top; paying businesses see only their own */}
      {!business.paying && (
        <Link href="/app" className="flex items-center px-5 pt-5 pb-1" aria-label="Usetally home"><Logo withWord className="size-7" /></Link>
      )}
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

  // phones: Menu is a full page (big rows in thumb reach), not a drawer
  const row = "flex min-h-[52px] items-center gap-3.5 px-4 py-2.5 text-[15px] font-medium text-ink active:bg-hover hover:bg-hover";
  const menuPage = (
    <div className="mx-auto flex max-w-xl flex-col gap-5 pb-4">
      <h1 className="text-title-1 text-ink">Menu</h1>
      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        <div className="flex items-center gap-3.5 px-4 py-4">
          <Avatar size="lg" name={business.name} src={logo} color={logo ? null : business.brand_color} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-ink">{business.name}</p>
            <p className="truncate text-[13px] text-ink-3">{business.kind === "company" ? "Company" : "Freelancer"} · {member.roleLabel}</p>
          </div>
        </div>
        {memberships.length > 1 && (
          <div className="border-t border-line">
            <p className="px-4 pt-3 pb-1 text-overline text-ink-3">Switch business</p>
            {memberships.filter((m) => m.business_id !== business.id).map((m) => (
              <form key={m.business_id} action={switchBusiness}>
                <input type="hidden" name="business_id" value={m.business_id} />
                <button type="submit" className={cx(row, "w-full text-left")}><Avatar size="sm" name={m.name} /><span className="min-w-0 flex-1 truncate">{m.name}</span><ChevronRight className="size-4 text-ink-3" /></button>
              </form>
            ))}
          </div>
        )}
        <Link href="/onboarding?new=1" className={cx(row, "border-t border-line text-ink-2")}><span className="inline-flex size-8 items-center justify-center rounded-lg bg-subtle"><Plus className="size-4" /></span>Add another business</Link>
      </div>

      {nav.map((group, i) => (
        <section key={i}>
          {group.title && <p className="px-1 pb-2 text-overline text-ink-3">{group.title}</p>}
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} data-tour={`nav:${item.href}`} onClick={(e) => { if (!e.metaKey && !e.ctrlKey && e.button === 0) setGoingTo(item.href); }} className={row}>
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink"><item.icon className="size-[18px]" /></span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {isPlatformAdmin && (
        <section>
          <p className="px-1 pb-2 text-overline text-ink-3">{BRAND.name}</p>
          <Link href="/admin" className={cx(row, "rounded-2xl bg-surface ring-1 ring-line")}><span className="inline-flex size-8 items-center justify-center rounded-lg bg-violet-soft text-violet"><ShieldCheck className="size-[18px]" /></span><span className="flex-1">Platform admin</span><ChevronRight className="size-4 text-ink-3" /></Link>
        </section>
      )}

      <div className="-mx-3"><TrialMeter allowance={allowance} canBilling={perms.canBilling} status={business.subscription_status} /></div>

      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        <div className="px-2 py-1"><ThemeToggle row /></div>
        <TourButton className={cx(row, "w-full border-t border-line text-left")}><span className="inline-flex size-8 items-center justify-center rounded-lg bg-subtle"><CircleHelp className="size-[18px] text-ink-2" /></span>Take the tour</TourButton>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
        <Avatar name={member.full_name || member.email} />
        <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium text-ink">{member.full_name || "You"}</span><span className="block truncate text-[12.5px] text-ink-3">{member.email}</span></span>
        <form action={signOut} onSubmit={clearOfflinePages}>
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[14px] font-medium text-danger-ink ring-1 ring-line hover:bg-danger-soft"><LogOut className="size-4" />Sign out</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-canvas">
      <InstallPrompt />
      <Tour userId={tour?.userId} done={tour?.done} />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-line bg-surface lg:block">{sidebar}</aside>
      {create && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-[#101828]/45" onClick={() => setCreate(false)} />
          <div role="dialog" aria-modal="true" aria-label="Create" className="absolute inset-x-0 bottom-0 animate-rise rounded-t-3xl bg-surface px-3 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-[var(--shadow-dialog)]">
            <div className="flex justify-center pb-2"><span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line-strong" /></div>
            <ul className="flex flex-col">
              {CREATE.filter((c) => !c.perm || perms[c.perm]).map((c) => (
                <li key={c.href}>
                  <Link href={c.href} onClick={() => setCreate(false)} className="flex min-h-14 items-center gap-3.5 rounded-2xl px-3 py-2.5 hover:bg-hover active:bg-hover">
                    <span className={cx("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", c.main ? "bg-brand text-white" : "bg-brand-soft text-brand-ink")}><c.icon className="size-5" aria-hidden /></span>
                    <span className="min-w-0"><span className="block text-[15px] font-semibold text-ink">{c.label}</span><span className="block text-[12.5px] text-ink-3">{c.hint}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setCreate(false)} className="mt-1 flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-medium text-ink-2 ring-1 ring-line">Cancel</button>
          </div>
        </div>
      )}
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          {/* paying businesses see their own brand; trial and Free see Usetally's */}
          <Link href="/app" className="flex min-w-0 items-center gap-2.5 lg:hidden" aria-label={business.paying ? business.name : "Usetally home"}>
            {business.paying ? <><Avatar name={business.name} src={logo} color={logo ? null : business.brand_color} /><span className="truncate text-[15px] font-semibold text-ink">{business.name}</span></> : <Logo withWord className="size-8" />}
          </Link>
          <div className="flex-1" />
          <ThemeToggle className="max-lg:hidden" />
          {/* quick create lives on Home only: every list page has its own button */}
          {pathname === "/app" && <>
            <Button href="/app/invoices/new" variant="secondary" icon={Plus} className="max-lg:hidden">Invoice</Button>
            <Button href="/app/quotes/new" variant="primary" icon={Plus} data-tour="new-quote" className="max-lg:hidden">New Quote</Button>
          </>}
          {/* phones: the menu lives in the bottom bar; screens without it (editor, settings) keep this */}
          {!tabs && (
            <Link href="/app/menu" className="inline-flex size-10 items-center justify-center rounded-md ring-1 ring-line-strong lg:hidden" aria-label="Menu" data-tour="menu"><Menu className="size-5" /></Link>
          )}
        </header>
        <main className={cx("mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8", tabs && "max-lg:pb-28")}>{goingTo && goingTo !== pathname ? <PageSkeleton /> : pathname === "/app/menu" ? menuPage : children}</main>
      </div>
      {tabs && (
        <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
          <div className="mx-auto grid max-w-xl grid-cols-5 items-end">
            {TABS.map((t) => {
              if (t.create) return (
                <div key="create" className="flex justify-center pb-1.5">
                  <button type="button" onClick={() => setCreate(true)} aria-label="Create" aria-haspopup="dialog" data-tour="new-quote"
                    className="-mt-5 inline-flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-[0_10px_24px_-8px_rgba(23,92,211,.7)] ring-4 ring-surface transition-transform active:scale-95">
                    <Plus className="size-7" aria-hidden />
                  </button>
                </div>
              );
              const menuOn = t.menu && (pathname === "/app/menu" || !TABS.some((x) => x.href && active(x)));
              const on = t.menu ? menuOn : active(t);
              const cls = cx("flex min-h-14 flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition-colors", on ? "text-brand-ink" : "text-ink-3 hover:text-ink");
              const inner = <><span className={cx("inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-brand-soft")}><t.icon className="size-5" aria-hidden /></span>{t.label}</>;
              return t.menu
                ? <Link key="menu" href="/app/menu" aria-current={pathname === "/app/menu" ? "page" : undefined} data-tour="menu" onClick={() => setGoingTo("/app/menu")} className={cls}>{inner}</Link>
                : <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                    onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) setGoingTo(t.href); }} className={cls}>{inner}</Link>;
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

// bottom bar on phones and tablets, in thumb reach: the two lists people use
// most, a big ➕ in the middle, and the full menu
const TABS = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/quotes", label: "Quotes", icon: FileText },
  { create: true },
  { href: "/app/invoices", label: "Invoices", icon: Receipt },
  { menu: true, label: "Menu", icon: Menu },
];

// what the ➕ offers
const CREATE = [
  { href: "/app/quotes/new", label: "New quote", hint: "Price a job and send it", icon: FileText, main: true },
  { href: "/app/invoices/new", label: "New invoice", hint: "Bill a customer directly", icon: Receipt },
  { href: "/app/invoices/new?paste=1", label: "Paste a WhatsApp order", hint: "Turn a customer's list into an invoice", icon: ClipboardPaste },
  { href: "/app/invoices?status=open", label: "Record a payment", hint: "On an unpaid invoice", icon: HandCoins, perm: "canTax" },
  { href: "/app/customers?new=1", label: "New customer", hint: "Save their details for next time", icon: UserPlus },
];

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
  const free = Boolean(allowance.free);
  const trial = status === "trialing" && !free;
  let text;
  if (trial && allowance.mode === "documents") text = `${Math.max(limit - used, 0)} of ${limit} free documents left`;
  else if (trial && allowance.mode === "days") text = allowance.ends_at ? `Trial ends ${new Date(allowance.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Trial";
  else if (free) text = `${used} of ${limit} free documents this month`;
  else if (limit != null) text = `${used} of ${limit} documents this month`;
  else text = "Subscription needed";
  const pct = limit ? Math.min(100, (used / limit) * 100) : allowance.allowed ? 30 : 100;
  return (
    <div className="mx-3 mb-3 rounded-xl bg-tray p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink"><Sparkles className="size-4 text-brand" />{trial ? "Free trial" : free ? "Free plan" : "Your plan"}</div>
      <p className="mt-1 text-xs text-ink-3">{text}</p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line"><div className={cx("h-full rounded-full", allowance.allowed ? "bg-brand" : "bg-danger")} style={{ width: `${pct}%` }} /></div>
      {canBilling && <Link href="/app/settings/billing" className="mt-2.5 inline-block text-xs font-semibold text-brand-ink hover:underline">{trial ? "See plans" : free ? "Upgrade" : "Manage plan"} →</Link>}
    </div>
  );
}

// a small pulse on the link while its page is on the way (fixed size, no layout shift)
function PendingDot() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" data-pending={pending ? "true" : undefined} className={cx("ml-auto size-1.5 rounded-full bg-brand transition-opacity duration-150", pending ? "animate-pulse opacity-100" : "opacity-0")} />;
}
