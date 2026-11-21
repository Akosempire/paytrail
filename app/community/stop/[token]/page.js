import Link from "next/link";
import { Logo } from "@/components/ui";
import { StopButton } from "./stop";

export const metadata = { title: "Stop community reminders", robots: { index: false } };

export default async function StopPage({ params }) {
  const { token } = await params;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 text-center">
      <Link href="/" aria-label="Usetally home"><Logo withWord /></Link>
      <div className="flex max-w-sm flex-col items-center gap-3">
        <h1 className="text-[22px] font-semibold text-ink">Stop the reminders?</h1>
        <p className="text-[15px] text-ink-2">We'll stop emailing you about the WhatsApp community. You can still join from the link in your first email.</p>
        <StopButton token={token} />
      </div>
    </div>
  );
}
