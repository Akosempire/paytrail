"use client";
// One short confetti burst in the brand colours, for an invoice paid in full.
// Skipped when the person prefers reduced motion.
export function confettiBurst({ count = 90, origin } = {}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const css = getComputedStyle(document.documentElement);
  const colors = ["--color-brand", "--color-success", "--color-warn", "--color-violet", "--color-brand-line"].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:70;overflow:hidden";
  document.body.appendChild(layer);
  const x0 = origin?.x ?? window.innerWidth / 2, y0 = origin?.y ?? window.innerHeight / 3;
  let left = count;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    const w = 6 + Math.random() * 6, h = w * (0.4 + Math.random() * 0.6);
    p.style.cssText = `position:absolute;left:${x0}px;top:${y0}px;width:${w}px;height:${h}px;border-radius:2px;background:${colors[i % colors.length] || "#1570ef"}`;
    layer.appendChild(p);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
    const speed = 220 + Math.random() * 320;
    const dx = Math.cos(angle) * speed, dy = Math.sin(angle) * speed;
    const anim = p.animate([
      { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx * 1.3}px, ${dy + 520}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 700, easing: "cubic-bezier(.15,.7,.4,1)", fill: "forwards" });
    anim.onfinish = () => { if (--left <= 0) layer.remove(); };
  }
  setTimeout(() => layer.remove(), 3000);
}
