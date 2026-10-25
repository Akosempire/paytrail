"use client";
import { useEffect, useRef, useState } from "react";

// Real totals from Usetally (see /stats.json): people using it and money
// processed in naira and dollars. Counts up once when it scrolls into view.
// Nothing shows until the numbers arrive, and nothing at all if an admin
// turned them off; a currency with nothing processed yet is left out.

const compact = (n, { currency } = {}) => {
  const f = new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: n >= 10000 ? 1 : 0 });
  return `${currency || ""}${f.format(n)}`;
};

function useCountUp(target, run) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf, start;
    const step = (t) => {
      start ??= t;
      const p = Math.min(1, (t - start) / 1400);
      setV(target * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return v;
}

function Stat({ value, format, label, run }) {
  const v = useCountUp(value, run);
  return (
    <div className="flex flex-col gap-2 border-t border-hero-line pt-5">
      <p className="font-display text-[clamp(40px,6vw,72px)] leading-none font-semibold tracking-[-0.04em] tabular-nums" aria-hidden="true">{format(v)}</p>
      <p className="sr-only">{format(value)} {label}</p>
      <p className="text-[15px] text-hero-ink-2" aria-hidden="true">{label}</p>
    </div>
  );
}

export function LiveStats({ wrap, kicker }) {
  const [stats, setStats] = useState(null);
  const [seen, setSeen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    fetch("/stats.json").then((r) => (r.ok ? r.json() : null)).then((d) => setStats(d?.stats || null)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!stats || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [stats]);
  if (!stats) return null;
  const items = [
    { value: stats.users, format: (n) => compact(Math.round(n)), label: stats.users === 1 ? "person using Usetally" : "people using Usetally" },
    stats.ngnMinor > 0 && { value: stats.ngnMinor / 100, format: (n) => compact(Math.round(n), { currency: "₦" }), label: "processed in naira" },
    stats.usdMinor > 0 && { value: stats.usdMinor / 100, format: (n) => compact(Math.round(n), { currency: "$" }), label: "processed in dollars" },
  ].filter(Boolean);
  return (
    <section ref={ref} className={`py-16 sm:py-20 ${wrap}`} aria-labelledby="live-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={kicker}>Live on Usetally</p>
          <h2 id="live-title" className="mt-3 max-w-[18ch] font-display text-[clamp(26px,3.2vw,40px)] leading-[1.08] font-semibold tracking-[-0.03em]">Businesses getting paid, right now.</h2>
        </div>
        <p className="flex items-center gap-2 text-[13px] text-hero-ink-2">
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
          Updated every few minutes
        </p>
      </div>
      <div className={`mt-10 grid gap-8 sm:gap-10 ${items.length === 3 ? "sm:grid-cols-3" : items.length === 2 ? "sm:grid-cols-2" : ""}`}>
        {items.map((it) => <Stat key={it.label} {...it} run={seen} />)}
      </div>
      <p className="mt-6 text-[13px] text-hero-ink-2">Totals of the payments businesses have recorded on Usetally, online and by transfer.</p>
    </section>
  );
}
