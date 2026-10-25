// For teams: three staff ID badges hanging from lanyards, one per role, each
// listing exactly what that role can do. Mirrors lib/permissions.js:
// juniors' documents need approval to send, they can't record payments, and
// they only see costs if the owner allows it.
const cx = (...c) => c.filter(Boolean).join(" ");

const YES = { mark: "✓", tone: "text-hero-accent" };
const NO = { mark: "✕", tone: "text-hero-ink-2/50" };
const ask = (label) => ({ label, tone: "text-[#b45309] dark:text-[#fbbf24]" });

const ROWS = ["Draft documents", "Send to customers", "Record payments", "See costs & profit", "Billing & team"];
const BADGES = [
  { role: "Owner", initial: "O", level: 3, id: "UT-0001", who: "Runs the business", strap: "bg-hero-accent", band: "bg-hero-accent text-white", access: [YES, YES, YES, YES, YES], tilt: "lg:-rotate-[4deg] lg:translate-y-2" },
  { role: "Finance", initial: "F", level: 2, id: "UT-0002", who: "Sends and collects", strap: "bg-hero-ink", band: "bg-hero-ink text-hero", access: [YES, YES, YES, YES, NO], tilt: "lg:-translate-y-4" },
  { role: "Junior", initial: "J", level: 1, id: "UT-0003", who: "Prepares drafts", strap: "bg-hero-ink-2/60", band: "bg-hero-tint text-hero-ink", access: [YES, ask("Approval"), NO, ask("If allowed"), NO], tilt: "lg:rotate-[4deg] lg:translate-y-3" },
];

function Badge({ b }) {
  return (
    <figure className={cx("group relative pt-14 transition-transform duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] hover:z-10 hover:!translate-y-0 hover:!rotate-0", b.tilt)}>
      {/* lanyard strap and clip */}
      <span aria-hidden="true" className={cx("absolute top-0 left-1/2 h-12 w-3 -translate-x-1/2 rounded-b-sm", b.strap)} />
      <span aria-hidden="true" className="absolute top-10 left-1/2 h-5 w-7 -translate-x-1/2 rounded-md bg-gradient-to-b from-[#d6d3cb] to-[#a9a59b] shadow-[inset_0_1px_0_rgba(255,255,255,.6)] dark:from-[#5b5852] dark:to-[#3b3934]" />
      <div className="relative overflow-hidden rounded-[20px] bg-hero-paper shadow-[0_1px_2px_rgba(20,16,8,.06),0_26px_50px_-26px_rgba(20,16,8,.45)] ring-1 ring-black/[.05] transition-shadow duration-300 group-hover:shadow-[0_1px_2px_rgba(20,16,8,.06),0_34px_60px_-26px_rgba(20,16,8,.55)] dark:ring-white/[.06]">
        {/* punched slot */}
        <span aria-hidden="true" className="absolute top-3 left-1/2 z-10 h-2 w-12 -translate-x-1/2 rounded-full bg-hero ring-1 ring-black/10 dark:ring-white/10" />
        <div className={cx("flex items-center justify-between px-5 pt-8 pb-3 font-mono text-[10.5px] tracking-[0.16em] uppercase", b.band)}>
          <span>Staff pass</span>
          <span>Lvl {b.level}</span>
        </div>
        <div className="px-5 pt-5 pb-5">
          <div className="flex items-center gap-3.5">
            <span aria-hidden="true" className="relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-hero-tint">
              <span className="absolute inset-0 opacity-40 [background:radial-gradient(circle,var(--color-hero-ink-2)_0.8px,transparent_1.2px)_0_0/4px_4px]" />
              <span className="font-display relative text-[22px] leading-none text-hero-ink">{b.initial}</span>
            </span>
            <div className="min-w-0">
              <figcaption className="font-display text-[26px] leading-none">{b.role}</figcaption>
              <p className="mt-1.5 truncate font-mono text-[10.5px] tracking-[0.08em] text-hero-ink-2 uppercase">{b.who}</p>
            </div>
          </div>
          <ul className="mt-5 space-y-2 border-t border-dashed border-hero-ink/20 pt-4">
            {ROWS.map((row, i) => {
              const a = b.access[i];
              return (
                <li key={row} className="flex items-baseline gap-2 text-[13px] whitespace-nowrap">
                  <span className={a === NO ? "text-hero-ink-2/70" : ""}>{row}</span>
                  <span aria-hidden="true" className="min-w-3 flex-1 -translate-y-[3px] border-b border-dotted border-hero-ink/20" />
                  {a.label
                    ? <span className={cx("font-mono text-[10.5px] tracking-[0.1em] uppercase", a.tone)}>{a.label}</span>
                    : <span className={cx("font-mono text-[12px]", a.tone)}><span className="sr-only">{a === YES ? "Yes" : "No"}</span><span aria-hidden="true">{a.mark}</span></span>}
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex items-end justify-between">
            <div aria-hidden="true" className="flex h-6 items-stretch gap-[2px] opacity-60">
              {[...(b.id + b.role)].slice(0, 16).map((ch, i) => <span key={i} className="bg-hero-ink" style={{ width: 1 + ((ch.charCodeAt(0) + i) % 3) }} />)}
            </div>
            <span className="font-mono text-[10.5px] tracking-[0.14em] text-hero-ink-2/70">{b.id}</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

export function Team({ wrap, kicker, h2 }) {
  return (
    <section className={`py-24 ${wrap}`} aria-labelledby="teams-title">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)] lg:items-center lg:gap-10">
        <div className="max-w-[500px]">
          <p className={kicker}>For teams</p>
          <h2 id="teams-title" className={`mt-4 ${h2}`}>Everyone does their part. You see everything.</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-hero-ink-2">Give every person a role. Junior drafts wait for approval before they reach a customer, and you decide who can see your costs and profit.</p>
          <p className="mt-6 inline-flex items-center gap-2 font-mono text-[11.5px] tracking-[0.12em] text-hero-ink-2 uppercase">
            <span className="size-1.5 rounded-full bg-hero-accent" aria-hidden="true" />Managers can do everything except billing
          </p>
        </div>
        {/* phones: swipe through the badges; desktop: three hanging side by side */}
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
          {BADGES.map((b) => <div key={b.role} className="w-[78%] shrink-0 snap-center sm:w-[46%] lg:w-auto"><Badge b={b} /></div>)}
        </div>
      </div>
    </section>
  );
}
