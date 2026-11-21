import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/ui";
import { createSupabaseService } from "@/lib/supabase/server";
import { communitySettings } from "@/lib/community-run";
import { OpenGroup } from "./open";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join the Usetally WhatsApp community", robots: { index: false } };

// The button in the email lands here: we note that they opened it (so the
// reminders stop) and send them on to the WhatsApp group.
export default async function JoinPage({ params }) {
  const { token } = await params;
  if (!/^[\w-]{20,64}$/.test(token)) notFound();
  const service = createSupabaseService();
  const [{ data: row }, cfg] = await Promise.all([
    service.from("community_signups").select("name").eq("token", token).maybeSingle(),
    communitySettings(service),
  ]);
  if (!row) notFound();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 text-center">
      <Link href="/" aria-label="Usetally home"><Logo withWord /></Link>
      {cfg.link ? <OpenGroup token={token} link={cfg.link} name={String(row.name).split(" ")[0]} /> : <p className="max-w-sm text-[15px] text-ink-2">The group link is being updated. Please try again a little later.</p>}
    </div>
  );
}
