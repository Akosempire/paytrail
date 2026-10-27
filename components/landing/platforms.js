import { Landmark, MessageCircle } from "lucide-react";

// "Get paid with": the ways your customers pay and how you send. Grey by
// default; each logo shows its own colours on hover. In dark mode the tile
// turns to paper on hover so dark logos stay readable. Logos belong to their
// owners; no endorsement is implied.
const PLATFORMS = [
  ["Bachs", "bachs", "Recommended"],
  ["Paystack", "paystack", "Payments"],
  ["Flutterwave", "flutterwave", "Payments"],
  ["Stripe", "stripe", "Payments"],
  ["Bank transfer", Landmark, "One-tap confirm"],
  ["WhatsApp", MessageCircle, "Send & share"],
];

const TILE = "group flex h-[112px] flex-col items-center justify-center gap-3.5 rounded-2xl bg-hero-paper/70 px-4 ring-1 ring-black/[.05] backdrop-blur-sm transition-[background-color,box-shadow,transform] duration-300 ring-inset hover:-translate-y-0.5 hover:bg-[#fffdf8] hover:shadow-[0_18px_36px_-22px_rgba(20,16,8,.4)] dark:ring-white/[.06] dark:hover:bg-[#f4f1ea]";

export function Platforms({ wrap, kicker }) {
  return (
    <section className={`py-20 ${wrap}`} aria-labelledby="platforms-title">
      <div>
        <p className={kicker}>Get paid with</p>
        <h2 id="platforms-title" className="font-display mt-3 text-[clamp(26px,3vw,38px)] leading-[1.05]">Tools you already use.</h2>
      </div>
      <ul className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {PLATFORMS.map(([name, logo, role]) => (
          <li key={name} className={TILE}>
            {typeof logo === "string" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/logos/${logo}.svg`} alt={name} loading="lazy" decoding="async"
                className="h-7 w-auto max-w-[128px] object-contain transition-[filter,opacity] duration-300 [filter:grayscale(1)_opacity(.5)] group-hover:[filter:none] dark:[filter:grayscale(1)_invert(1)_opacity(.55)] dark:group-hover:[filter:none]" />
            ) : (() => { const Icon = logo; return (
              <span className="flex h-7 items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-hero-ink/50 transition-colors duration-300 group-hover:text-[#151513] dark:text-hero-ink/55">
                <Icon className="size-5" aria-hidden="true" />{name}
              </span>
            ); })()}
            <span className={`font-mono text-[10.5px] tracking-[0.14em] uppercase transition-colors dark:group-hover:text-[#5d5b53] ${role === "Recommended" ? "text-hero-accent" : "text-hero-ink-2/70"}`}>{role}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
