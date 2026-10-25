"use client";
import { useEffect, useRef, useState } from "react";

// A tall section whose inner panel stays pinned while you scroll through it.
// Exposes progress as the CSS variable --p (0 → 1) and the current step to
// children, without re-rendering on every scroll frame.
//   children(step, still, compact)
//   still:   reduced motion or a very short screen (landscape phone): the final
//            state, not pinned
//   compact: phones and tablets (< 1024 px wide): pinned, with a layout that
//            fits one small screen
export function ScrollScene({ steps = 1, heightVh = 250, className = "", children, label }) {
  const outer = useRef(null);
  const [step, setStep] = useState(0);
  const [still, setStill] = useState(true); // server render: final state, no pin
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = outer.current;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const short = matchMedia("(max-height: 519px)");
    const narrow = matchMedia("(max-width: 1023px)");
    const isStill = () => reduce.matches || short.matches;
    let frame = 0, last = -1;
    const update = () => {
      frame = 0;
      if (isStill()) { el.style.setProperty("--p", "1"); if (last !== steps - 1) { last = steps - 1; setStep(steps - 1); } return; }
      const rect = el.getBoundingClientRect();
      const total = Math.max(1, el.offsetHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, -rect.top / total));
      el.style.setProperty("--p", p.toFixed(4));
      const s = Math.min(steps - 1, Math.floor(p * steps * 0.9999));
      if (s !== last) { last = s; setStep(s); }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onMq = () => { setStill(isStill()); setCompact(narrow.matches); last = -1; update(); };
    onMq();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    for (const m of [reduce, short, narrow]) m.addEventListener("change", onMq);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll);
      for (const m of [reduce, short, narrow]) m.removeEventListener("change", onMq);
    };
  }, [steps]);

  return (
    <section ref={outer} aria-label={label} className={`relative ${className}`} style={{ height: still ? "auto" : `${heightVh}vh`, ...(still ? { "--p": 1 } : {}) }} data-step={still ? steps - 1 : step}>
      {/* svh on phones: the pinned panel doesn't jump when the address bar hides */}
      <div className={still ? "" : "sticky top-0 flex h-svh items-center overflow-hidden lg:h-dvh"}>
        {typeof children === "function" ? children(still ? steps - 1 : step, still, compact) : children}
      </div>
    </section>
  );
}

// a paragraph whose words light up as --p moves from `from` to `to`
export function ScrollWords({ text, from = 0, to = 1, className = "" }) {
  const words = text.split(" ");
  return (
    <p className={className}>
      {words.map((w, i) => {
        const at = from + ((to - from) * i) / words.length;
        return (
          <span key={i} style={{ opacity: `clamp(0.2, calc((var(--p) - ${at.toFixed(3)}) * ${(words.length / (to - from) / 1.5).toFixed(2)} + 0.2), 1)`, transition: "opacity 120ms linear" }}>
            {w}{i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </p>
  );
}
