import Link from "next/link";
import { BarChart3, ChevronRight, CreditCard, Database, HardDrive, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/context";
import { Badge, Card, PageHeader, cx } from "@/components/ui";
import { emailStatus } from "@/lib/email";
import { r2Check } from "@/lib/storage";
import { credentialsFor } from "@/lib/payments";
import { platformConfig } from "@/lib/platform-config";
import { googleEnabled } from "@/lib/auth-providers";
import { supabaseUrl } from "@/lib/supabase/url";
import { createSupabaseService } from "@/lib/supabase/server";

export const metadata = { title: "Integrations" };

const TONE = { ok: "success", warn: "warn", off: "neutral" };

function Tile({ href, icon: Icon, name, what, state, label, detail }) {
  const body = (
    <>
      <span className={cx("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", state === "ok" ? "bg-success-soft text-success-ink" : state === "warn" ? "bg-warn-soft text-warn-ink" : "bg-tray text-ink-3")}><Icon className="size-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-semibold text-ink">{name}</span><Badge tone={TONE[state]} size="sm">{label}</Badge></span>
        <span className="mt-0.5 block text-[13px] text-ink-3">{what}</span>
        {detail && <span className="mt-1.5 block text-[13px] text-ink-2">{detail}</span>}
      </span>
      {href && <ChevronRight className="size-5 shrink-0 self-center text-ink-3" aria-hidden="true" />}
    </>
  );
  return href
    ? <Link href={href} className="flex min-w-0 gap-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-card)] ring-1 ring-line transition hover:ring-line-strong">{body}</Link>
    : <div className="flex min-w-0 gap-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-card)] ring-1 ring-line">{body}</div>;
}

export default async function Integrations() {
  await requirePlatformAdmin();
  const [email, storage, billing, cfg, google] = await Promise.all([
    emailStatus().catch(() => null),
    r2Check().catch(() => ({ ready: false, note: "Couldn't check" })),
    credentialsFor(createSupabaseService(), null).catch(() => null),
    platformConfig(),
    googleEnabled().catch(() => false),
  ]);
  const provider = { sendhiiv: "Sendhiiv", brevo: "Brevo", "brevo-smtp": "Brevo" }[email?.provider] || "SMTP";
  const billName = { stripe: "Stripe", paystack: "Paystack", flutterwave: "Flutterwave", bachs: "Bachs" }[billing?.provider];
  const ref = (() => { try { return new URL(supabaseUrl()).host.split(".")[0]; } catch { return ""; } })();
  const system = [
    ["Supabase address", Boolean(supabaseUrl())], ["Supabase public key", Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)],
    ["Supabase service key", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)], ["Encryption key (APP_ENCRYPTION_KEY)", (process.env.APP_ENCRYPTION_KEY || "").length >= 32],
    ["Scheduled jobs secret (CRON_SECRET)", Boolean(process.env.CRON_SECRET)],
  ];
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Integrations" description="Every outside service Usetally uses. Keys are pasted here, checked before saving and stored encrypted; nothing needs a redeploy." />

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Services</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Tile href="/admin/integrations/email" icon={Mail} name="Email" what="Sign-up codes, resets, invoices, receipts and alerts."
            state={email?.ready ? "ok" : "warn"} label={email?.ready ? `Connected · ${provider}` : "Not set up"}
            detail={email?.ready ? (email.source === "dashboard" ? "Key saved here" : "Using settings from Vercel. Paste a key here to manage it in one place.") : "Sign-up codes are being sent by Supabase."} />
          <Tile href="/admin/integrations/storage" icon={HardDrive} name="File storage" what="Logos, signatures and files attached to documents."
            state={storage.ready ? "ok" : "warn"} label={storage.ready ? "Cloudflare R2" : "Supabase Storage"} detail={storage.note} />
          <Tile href="/admin/integrations/payments" icon={CreditCard} name="Subscription payments" what="How businesses pay for their Usetally plan."
            state={!billing || billing.provider === "manual" ? "off" : billing.mode === "live" ? "ok" : "warn"}
            label={!billing || billing.provider === "manual" ? "Bank transfer" : billing.mode === "live" ? `${billName} · live` : `${billName} · test key`}
            detail={!billing || billing.provider === "manual" ? "You activate plans by hand after a transfer." : billing.mode === "live" ? "Real payments, verified with the provider before a plan starts." : "A test key can't take real payments. Paste your live key."} />
          <Tile href="/admin/integrations/analytics" icon={BarChart3} name="Analytics" what="Visitor analytics on the live site."
            state={cfg.analytics.sabilytics || cfg.analytics.ga ? "ok" : "off"}
            label={[cfg.analytics.sabilytics && "Sabilytics", cfg.analytics.ga && "Google Analytics"].filter(Boolean).join(" + ") || "Off"}
            detail={cfg.analytics.sabilytics ? `Sabilytics site ${cfg.analytics.sabilytics.site} on ${cfg.analytics.sabilytics.domain}` : null} />
          <Tile href={ref ? `https://supabase.com/dashboard/project/${ref}/auth/providers` : null} icon={ShieldCheck} name="Sign in with Google" what="Set up in Supabase (Authentication → Sign In / Providers)."
            state={google ? "ok" : "off"} label={google ? "On" : "Off"} detail={google ? "The Google button shows on sign-in and sign-up." : "Turn it on in Supabase; the button appears here within 5 minutes."} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Stays in Vercel</h2>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-tray text-ink-3"><Database className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">System keys</p>
              <p className="mt-0.5 text-[13px] text-ink-3">The site needs these to reach the database and unlock saved keys, so they can't live in the database themselves. Set once in Vercel → Settings → Environment Variables.</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {system.map(([k, ok]) => (
                  <li key={k} className="flex items-center gap-2 text-[13px]"><KeyRound className={cx("size-4", ok ? "text-success" : "text-danger")} aria-hidden="true" /><span className="text-ink-2">{k}</span><Badge tone={ok ? "success" : "danger"} size="sm" className="ml-auto">{ok ? "Set" : "Missing"}</Badge></li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
