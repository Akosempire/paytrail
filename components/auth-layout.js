import { FileText, Receipt, Wallet, EyeOff } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";

const POINTS = [
  { icon: FileText, title: "Branded quotes in minutes", text: "Your logo, colours and terms on every quote, invoice and receipt." },
  { icon: EyeOff, title: "Know your real profit", text: "Add hidden costs like data, fuel and subscriptions. Only your team sees them." },
  { icon: Wallet, title: "Get paid online", text: "Customers pay with Bachs or Flutterwave. The invoice marks itself paid." },
  { icon: Receipt, title: "Receipts, automatically", text: "Every payment, online or by transfer, issues a numbered receipt." },
];

export function AuthLayout({ children }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-[#0c111d] px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-40 -bottom-40 size-[520px] rounded-full bg-[#1570EF]/25 blur-[120px]" />
        <Link href="/" className="relative"><Logo withWord wordClass="!text-white" /></Link>
        <div className="relative mt-auto max-w-lg">
          <p className="text-overline text-[#6ee0a6]">Quotes → invoices → receipts</p>
          <h2 className="mt-3 text-[40px] leading-[48px] font-semibold tracking-[-0.02em]">Every naira, from quote to receipt.</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/65">
            PayTrail helps freelancers and companies price jobs properly, send professional quotes and collect payment, all under their own brand.
          </p>
          <ul className="mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3.5">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
                  <Icon className="size-4 text-[#6ee0a6]" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-[13px] text-white/55">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex flex-col bg-canvas px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="lg:invisible"><Logo withWord /></Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
