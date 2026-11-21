import Link from "next/link";
import { Logo } from "@/components/ui";
import { STAGES } from "@/lib/community";
import { communitySettings } from "@/lib/community-run";
import { CommunityForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Join the Usetally WhatsApp community",
  description: "A WhatsApp community for business owners and founders building businesses that last. Sign up and get the group link by email.",
  alternates: { canonical: "/community" },
};

export default async function CommunityPage() {
  const cfg = await communitySettings().catch(() => ({ ready: false }));
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex h-16 max-w-xl items-center px-4 sm:px-6">
        <Link href="/" aria-label="Usetally home"><Logo withWord /></Link>
      </header>
      <main className="mx-auto max-w-xl px-4 pt-4 pb-16 sm:px-6">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-brand-ink uppercase">WhatsApp community</p>
        <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">Join the Usetally community</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Connect with business owners and founders, get practical tips on growing and getting paid, and hear about our webinars first. Fill this in and we'll email you the group link.</p>
        <div className="mt-8">
          {cfg.ready ? <CommunityForm batches={cfg.batches} stages={STAGES} rules={cfg.rules} /> : (
            <div className="rounded-2xl bg-surface p-6 text-[15px] text-ink-2 ring-1 ring-line">Sign-ups are closed right now. Please check back soon.</div>
          )}
        </div>
      </main>
    </div>
  );
}
