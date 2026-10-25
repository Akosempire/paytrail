import Link from "next/link";

// The landing page's buttons. Same language as the rest of the page: the
// brand blue with a faint LED-dot texture, text centred.
const cx = (...c) => c.filter(Boolean).join(" ");
const DOTS = "pointer-events-none absolute inset-0 rounded-full opacity-[.16] [background:radial-gradient(circle,#fff_0.9px,transparent_1.3px)_0_0/6px_6px] [mask-image:radial-gradient(ellipse_at_center,#000,transparent_75%)]";

export function PrimaryCta({ href, children, size = "lg", block = false, className }) {
  const lg = size === "lg";
  return (
    <Link href={href}
      className={cx(
        "group relative isolate inline-flex items-center justify-center overflow-hidden rounded-full bg-[#175cd3] font-semibold text-white",
        "shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_1px_2px_rgba(10,30,80,.25),0_14px_30px_-14px_rgba(23,92,211,.7)]",
        "transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-px hover:bg-[#1765e6] hover:shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_1px_2px_rgba(10,30,80,.25),0_18px_36px_-14px_rgba(23,92,211,.85)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff] focus-visible:ring-offset-2 focus-visible:ring-offset-hero dark:bg-[#2563eb] dark:hover:bg-[#3171f0]",
        lg ? "h-[54px] px-8 text-[15px]" : "h-9 px-4 text-[13px]",
        block && "w-full",
        className,
      )}>
      <span aria-hidden="true" className={DOTS} />
      <span className="relative">{children}</span>
    </Link>
  );
}

// quieter partner to PrimaryCta: hairline outline, fills with ink on hover
export function SecondaryCta({ href, children, block = false, className, onDark = false }) {
  return (
    <Link href={href}
      className={cx(
        "group inline-flex h-[54px] items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff]",
        onDark ? "text-[#f2efe7] ring-1 ring-white/20 ring-inset hover:bg-white/10" : "text-hero-ink ring-1 ring-hero-ink/15 ring-inset hover:bg-hero-ink hover:text-hero",
        block && "w-full",
        className,
      )}>
      {children}
    </Link>
  );
}
