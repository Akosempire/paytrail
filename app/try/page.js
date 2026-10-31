import Link from "next/link";
import { Logo, buttonClass } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";
import { TryInvoice } from "./try-invoice";
import { getContext } from "@/lib/context";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = {
  title: "Make an invoice free, no sign-up",
  description: "Make a professional invoice in a minute, right in your browser. No account needed until you want to send it.",
  alternates: { canonical: "/try" },
};

export default async function Page() {
  // signed in already: the real builder is one click away
  const ctx = supabaseConfigured() ? await getContext().catch(() => null) : null;
  const signedIn = Boolean(ctx?.user);
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 backdrop-blur sm:px-8">
        <Link href="/" aria-label="Usetally home"><Logo withWord /></Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn
            ? <Link href="/app/invoices/new" className={buttonClass({ variant: "primary", size: "sm" })}>Open my account</Link>
            : <>
                <Link href="/login" className="inline-flex min-h-9 items-center px-2 text-[13px] font-medium text-ink-2 hover:text-ink max-sm:hidden">Sign in</Link>
                <Link href="/signup" className={buttonClass({ variant: "primary", size: "sm" })}>Create free account</Link>
              </>}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1760px] px-4 pt-6 sm:px-6 lg:px-8">
        <TryInvoice />
      </main>
    </div>
  );
}
