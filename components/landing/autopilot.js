import { BellRing, CalendarClock, ClipboardPaste, Package, QrCode, Repeat } from "lucide-react";

// "Get paid without chasing": automatic reminders, scheduled sending and
// repeating invoices (paid plans and the trial), plus the everyday helpers
// every plan has. Example cards only, no customer claims.
const cx = (...c) => c.filter(Boolean).join(" ");
const PAPER = "rounded-[18px] bg-hero-paper text-hero-ink shadow-[0_1px_2px_rgba(20,16,8,.06),0_26px_50px_-26px_rgba(20,16,8,.45)] ring-1 ring-black/[.05] dark:ring-white/[.06]";
const TIMELINE = [["3 days before", "Friendly heads-up"], ["Due today", "Payment link"], ["7 days late", "A firmer nudge"]];
const EXTRAS = [
  [Package, "Saved products and prices"],
  [ClipboardPaste, "Paste an order list from WhatsApp"],
  [QrCode, "Share by WhatsApp, link, QR or PDF"],
];

function Card({ icon: Icon, title, text, children, className }) {
  return (
    <article className={cx(PAPER, "flex flex-col p-6", className)}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-hero-accent/10 text-hero-accent"><Icon className="size-5" aria-hidden="true" /></span>
      <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-hero-ink-2">{text}</p>
      <div className="mt-6 flex-1 border-t border-dashed border-hero-ink/20 pt-5">{children}</div>
    </article>
  );
}

export function Autopilot({ wrap, kicker, h2 }) {
  return (
    <section className={`py-24 ${wrap}`} aria-labelledby="autopilot-title">
      <div className="max-w-[640px]">
        <p className={kicker}>On autopilot</p>
        <h2 id="autopilot-title" className={`mt-4 ${h2}`}>Get paid without <span className="text-hero-accent">chasing.</span></h2>
        <p className="mt-5 text-[17px] leading-relaxed text-hero-ink-2">Set it once. Usetally reminds late payers, sends invoices when you choose, and makes your monthly ones for you.</p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        <Card icon={BellRing} title="Automatic reminders" text="Polite emails before and after the due date, in your words. They stop the moment the invoice is paid.">
          <ol className="space-y-3">
            {TIMELINE.map(([when, what], i) => (
              <li key={when} className="flex items-center gap-3 text-[13px]">
                <span className={cx("size-2.5 shrink-0 rounded-full", i === 2 ? "bg-hero-ink" : "bg-hero-accent")} aria-hidden="true" />
                <span className="w-[96px] shrink-0 font-mono text-[11px] tracking-[0.08em] text-hero-ink-2 uppercase">{when}</span>
                <span className="font-medium">{what}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card icon={CalendarClock} title="Scheduled sending" text="Write the invoice tonight and pick when it lands: Monday at 8, the first of the month, whenever suits.">
          <div className="rounded-xl bg-hero-tint/70 px-4 py-3 text-[13px]">
            <p className="font-mono text-[10.5px] tracking-[0.14em] text-hero-ink-2 uppercase">Scheduled · example</p>
            <p className="mt-1 font-semibold">Mon, 8:00 AM</p>
            <p className="text-hero-ink-2">INV-0051 to Kora Logistics</p>
          </div>
        </Card>
        <Card icon={Repeat} title="Repeating invoices" text="Retainers, rent, subscriptions: Usetally makes the next invoice every week or month, and can email it too.">
          <div className="rounded-xl bg-hero-tint/70 px-4 py-3 text-[13px]">
            <p className="font-mono text-[10.5px] tracking-[0.14em] text-hero-ink-2 uppercase">Repeats monthly · example</p>
            <p className="mt-1 font-semibold">Website maintenance</p>
            <p className="text-hero-ink-2">Next one made on the 1st</p>
          </div>
        </Card>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ul className="flex flex-wrap gap-2">
          {EXTRAS.map(([Icon, t]) => (
            <li key={t} className="inline-flex h-9 items-center gap-2 rounded-full bg-hero-paper/80 px-3.5 text-[13px] font-medium ring-1 ring-black/[.06] dark:ring-white/[.08]"><Icon className="size-3.5 text-hero-accent" aria-hidden="true" />{t}</li>
          ))}
        </ul>
        <p className="font-mono text-[11px] tracking-[0.12em] text-hero-ink-2 uppercase">Reminders &amp; scheduling: paid plans and the free trial</p>
      </div>
    </section>
  );
}
