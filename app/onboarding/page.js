import { redirect } from "next/navigation";
import Link from "next/link";
import { getContext } from "@/lib/context";
import { logoUrl } from "@/lib/site";
import { Logo } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";
import { StepStart, StepBrand, StepMoney, StepFinish } from "./steps";

export const metadata = { title: "Set up your business" };

const STEPS = [
  { key: "start", label: "Your business" },
  { key: "brand", label: "Branding" },
  { key: "money", label: "Money & numbering" },
  { key: "finish", label: "Finish" },
];

export default async function Onboarding({ searchParams }) {
  const params = await searchParams;
  const ctx = await getContext();
  if (!ctx.user) redirect("/login?next=/onboarding");

  // a business you own that hasn't finished setup is resumed, never duplicated
  const owned = ctx.memberships.filter((m) => m.role === "owner").map((m) => m.business_id);
  let pending = null;
  if (owned.length) {
    const { data } = await ctx.supabase.from("businesses").select("*").in("id", owned).is("onboarded_at", null).order("created_at", { ascending: false }).limit(1);
    pending = data?.[0] || null;
  }
  if (!pending && ctx.memberships.length && !params.new) redirect("/app");

  const step = pending ? (["brand", "money", "finish"].includes(params.step) ? params.step : "brand") : "start";
  const index = STEPS.findIndex((s) => s.key === step);
  const name = ctx.user.user_metadata?.full_name || "";

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link href={ctx.memberships.length ? "/app" : "/"}><Logo withWord /></Link>
        <ThemeToggle />
      </header>
      <div className="mx-auto w-full max-w-[880px] px-4 pb-16 sm:px-6">
        <ol className="mb-8 grid grid-cols-4 gap-1.5 rounded-2xl bg-tray p-1.5" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s.key} aria-current={i === index ? "step" : undefined}
              className={`rounded-xl px-3 py-2.5 ${i === index ? "bg-surface shadow-[var(--shadow-card)] ring-1 ring-line" : ""}`}>
              <span className={`block text-[11px] font-semibold tabular ${i <= index ? "text-brand-ink" : "text-ink-3"}`}>Step {i + 1}</span>
              <span className={`hidden truncate text-[13px] font-medium sm:block ${i === index ? "text-ink" : "text-ink-3"}`}>{s.label}</span>
            </li>
          ))}
        </ol>
        {step === "start" && <StepStart ownerName={name} firstBusiness={!ctx.memberships.length} />}
        {step === "brand" && <StepBrand business={pending} logo={logoUrl(pending.logo_path)} />}
        {step === "money" && <StepMoney business={pending} />}
        {step === "finish" && <StepFinish business={pending} />}
      </div>
    </div>
  );
}
