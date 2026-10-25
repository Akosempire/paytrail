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
      <header className="flex items-center justify-between px-4 py-3 sm:px-8 sm:py-4">
        <Link href={ctx.memberships.length ? "/app" : "/"}><Logo withWord /></Link>
        <ThemeToggle />
      </header>
      {/* bottom padding leaves room for the fixed action bar */}
      <div className="mx-auto w-full max-w-[880px] px-4 pb-32 sm:px-6">
        {/* phones: a quiet label and tally marks (one stroke per step; finishing strikes them through) */}
        <div className="mb-4 flex items-center justify-between sm:hidden">
          <span className="text-[13px] text-ink-3">{STEPS[index].label}</span>
          <Tally done={index + 1} total={STEPS.length} />
        </div>
        <ol className="mb-8 hidden grid-cols-4 gap-1.5 rounded-2xl bg-tray p-1.5 sm:grid" aria-label={`Setup progress: step ${index + 1} of ${STEPS.length}, ${STEPS[index].label}`}>
          {STEPS.map((s, i) => (
            <li key={s.key} aria-current={i === index ? "step" : undefined}
              className={`rounded-xl px-3 py-2.5 ${i === index ? "bg-surface shadow-[var(--shadow-card)] ring-1 ring-line" : ""}`}>
              <span className={`block text-[11px] tabular ${i === index ? "text-brand-ink" : "text-ink-3"}`}>Step {i + 1}</span>
              <span className={`block truncate text-[13px] font-medium ${i === index ? "text-ink" : "text-ink-3"}`}>{s.label}</span>
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

// progress as tally marks, like the strike in the Usetally logo
function Tally({ done, total }) {
  const gap = 6, h = 16, w = gap * (total - 1) + 2;
  const finished = done >= total;
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label={`Step ${done} of ${total}`}>
      <svg width={w + 6} height={h} viewBox={`-3 0 ${w + 6} ${h}`} aria-hidden="true" className="overflow-visible">
        {Array.from({ length: total }, (_, i) => (
          <line key={i} x1={1 + i * gap} y1="2" x2={1 + i * gap} y2={h - 2} strokeWidth="1.75" strokeLinecap="round"
            className={`transition-colors duration-500 ${i < done ? "stroke-brand" : "stroke-line-strong"}`} />
        ))}
        <line x1="-2" y1={h - 3} x2={w + 2} y2="3" strokeWidth="1.75" strokeLinecap="round"
          className={`stroke-brand transition-opacity duration-500 ${finished ? "opacity-100" : "opacity-0"}`} />
      </svg>
      <span className="text-[11px] text-ink-3 tabular">{done}/{total}</span>
    </span>
  );
}
