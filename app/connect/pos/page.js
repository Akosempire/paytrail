import { redirect } from "next/navigation";
import { ArrowLeftRight, Boxes, Receipt, ShieldCheck } from "lucide-react";
import { getContext } from "@/lib/context";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui";
import { checkReturnTo, cleanState, cleanText, returnOrigins, returnUrl } from "@/lib/pos-core";
import { ApproveForm } from "./approve";

export const metadata = { title: "Connect TrackOja POS", robots: { index: false } };
export const dynamic = "force-dynamic";

const SHARED = [
  [Receipt, "Sales come in as invoices", "Each completed TrackOja sale is recorded here as a paid (or part-paid) invoice with its receipts. Credit sales stay as balance due. Nothing is emailed to customers."],
  [Boxes, "Your products, for your invoices", "Usetally can look up this store's products and prices when you add items, and tells TrackOja to deduct stock when an invoice with those products is fully paid."],
  [ArrowLeftRight, "Only what's needed", "TrackOja sees this business's name and currency. Usetally never takes or holds the store's money."],
];

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.user) {
    const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string")).toString();
    redirect(`/login?next=${encodeURIComponent(`/connect/pos${qs ? `?${qs}` : ""}`)}`);
  }
  const returnTo = checkReturnTo(typeof sp.return_to === "string" ? sp.return_to : "", returnOrigins(process.env.POS_RETURN_ORIGINS));
  const state = cleanState(typeof sp.state === "string" ? sp.state : "");
  const store = cleanText(typeof sp.store === "string" ? sp.store : "", 120);

  if (!returnTo || !state) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-4">
          <h1 className="text-title-1 text-ink">This link can't be used</h1>
          <p className="text-sm text-ink-2">It didn't come from TrackOja, or part of it is missing. Open TrackOja, go to Settings → Connected apps and tap Connect Usetally again.</p>
          <Button href="/app" variant="primary">Go to Usetally</Button>
        </div>
      </AuthLayout>
    );
  }

  const eligible = (ctx.memberships || []).filter((m) => ["owner", "manager"].includes(m.role)).map((m) => ({ id: m.business_id, name: m.businesses?.name || "Business" }));
  const deny = returnUrl(returnTo, { error: "access_denied", state });
  if (!eligible.length) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-4">
          <h1 className="text-title-1 text-ink">Ask an owner or manager</h1>
          <p className="text-sm text-ink-2">Only an owner or manager of a Usetally business can connect TrackOja{store ? ` (${store})` : ""}. You're signed in as {ctx.user.email}.</p>
          <Button href={deny} variant="primary">Back to TrackOja</Button>
        </div>
      </AuthLayout>
    );
  }
  const { data: links } = await ctx.supabase.from("pos_connections").select("business_id, store_name").in("business_id", eligible.map((b) => b.id)).is("revoked_at", null);
  const initial = eligible.some((b) => b.id === ctx.business?.id) ? ctx.business.id : eligible[0].id;
  const single = eligible.length === 1 ? eligible[0] : null;

  return (
    <AuthLayout>
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-overline text-brand-ink">Connect an app</p>
          <h1 className="mt-2 text-title-1 text-ink">Connect TrackOja{store ? ` · ${store}` : " POS"}{single ? ` to ${single.name}` : ""}?</h1>
          <p className="mt-1 text-sm text-ink-2">TrackOja is asking to link this store to your Usetally business. You can disconnect any time in Settings → TrackOja POS.</p>
        </div>
        <ul className="flex flex-col gap-3">
          {SHARED.map(([Icon, title, text]) => (
            <li key={title} className="flex gap-3">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-brand ring-1 ring-line shadow-[var(--shadow-xs)]"><Icon className="size-4" /></span>
              <span className="min-w-0"><span className="block text-sm font-medium text-ink">{title}</span><span className="block text-[13px] text-ink-3">{text}</span></span>
            </li>
          ))}
        </ul>
        <ApproveForm returnTo={returnTo} state={state} store={store} businesses={eligible} initial={initial}
          links={Object.fromEntries((links || []).map((l) => [l.business_id, l.store_name || "a TrackOja store"]))} />
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-3"><ShieldCheck className="size-3.5" />Signed in as {ctx.user.email}</p>
      </div>
    </AuthLayout>
  );
}
