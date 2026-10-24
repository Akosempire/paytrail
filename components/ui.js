// PayTrail component library. Visual language from the Kasuwa design system:
// cool-grey canvas, white cards on grey trays, one confident blue, large radii.
// Everything here renders on the server; interactive pieces live in ui-client.js.
import Link from "next/link";

export const cx = (...c) => c.filter(Boolean).join(" ");

export const TONE_SOFT = {
  neutral: "bg-tray text-ink-2 ring-line-strong/60",
  brand: "bg-brand-soft text-brand-ink ring-brand-line/70",
  success: "bg-success-soft text-success-ink ring-success/25",
  warn: "bg-warn-soft text-warn-ink ring-warn/30",
  info: "bg-info-soft text-info-ink ring-info/25",
  violet: "bg-violet-soft text-violet-ink ring-violet/25",
  danger: "bg-danger-soft text-danger-ink ring-danger/25",
};
export const TONE_OUTLINE = {
  neutral: "ring-line-strong/80 text-ink-2",
  brand: "ring-brand-line text-brand-ink",
  success: "ring-success/30 text-success-ink",
  warn: "ring-warn/35 text-warn-ink",
  info: "ring-info/30 text-info-ink",
  violet: "ring-violet/30 text-violet-ink",
  danger: "ring-danger/30 text-danger-ink",
};
export const TONE_ICON = {
  neutral: "text-ink-3", brand: "text-brand", success: "text-success", warn: "text-warn",
  info: "text-info", violet: "text-violet", danger: "text-danger",
};
export const TONE_DOT = {
  neutral: "bg-ink-3", brand: "bg-brand", success: "bg-success", warn: "bg-warn",
  info: "bg-info", violet: "bg-violet", danger: "bg-danger",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,color,box-shadow] select-none disabled:opacity-45 disabled:pointer-events-none aria-disabled:opacity-45 aria-disabled:pointer-events-none focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]";
const BUTTON_VARIANT = {
  primary: "bg-primary-gradient text-white",
  dark: "bg-contrast text-white hover:bg-contrast-hover",
  secondary: "bg-surface text-ink ring-1 ring-inset ring-line-strong shadow-[var(--shadow-xs)] hover:bg-subtle",
  soft: "bg-brand-soft text-brand-ink ring-1 ring-inset ring-brand-line/60 hover:ring-brand-line",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink",
  danger: "text-danger-ink hover:bg-danger-soft",
  destructive: "bg-danger text-white shadow-[var(--shadow-xs)] hover:bg-danger-ink",
  link: "text-brand-ink hover:underline underline-offset-4 !h-auto !px-0",
};
const BUTTON_SIZE = {
  sm: "h-8 px-3 text-[13px] rounded-sm",
  md: "h-10 px-4 text-sm rounded-md",
  lg: "h-12 px-5 text-[15px] rounded-lg",
};
const ICON_SIZE = { sm: "size-3.5", md: "size-4", lg: "size-[18px]" };

export function buttonClass({ variant = "secondary", size = "md", block, className } = {}) {
  return cx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], block && "w-full", className);
}

export function Button({ variant = "secondary", size = "md", icon: Icon, iconRight: IconRight, block, loading, className, children, href, type = "button", ...rest }) {
  const classes = buttonClass({ variant, size, block, className });
  const content = (
    <>
      {Icon && <Icon className={cx(ICON_SIZE[size], "shrink-0", loading && "animate-spin")} aria-hidden />}
      {children}
      {IconRight && <IconRight className={cx(ICON_SIZE[size], "shrink-0")} aria-hidden />}
    </>
  );
  if (href !== undefined) {
    const external = /^https?:/.test(href);
    if (external) return <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>{content}</a>;
    return <Link href={href} className={classes} {...rest}>{content}</Link>;
  }
  return (
    <button type={type} {...rest} disabled={rest.disabled || loading} className={classes}>
      {content}
    </button>
  );
}

export function Card({ className, children, as: Tag = "section", ...rest }) {
  return (
    <Tag {...rest} className={cx("overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-card)] ring-1 ring-line", className)}>
      {children}
    </Tag>
  );
}

export function IconChip({ icon: Icon, tone = "neutral", size = "md", className }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-line shadow-[var(--shadow-xs)]",
      size === "sm" && "size-8", size === "md" && "size-10", size === "lg" && "size-12", className)}>
      <Icon className={cx(size === "sm" ? "size-4" : "size-[18px]", TONE_ICON[tone])} aria-hidden />
    </span>
  );
}

export function CardHeader({ title, description, icon, iconTone = "neutral", actions, className }) {
  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <IconChip icon={icon} tone={iconTone} size="sm" />}
        <div className="min-w-0">
          <h3 className="text-title-3 text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-title-1 text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, count, description, action }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-tray px-4 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {count != null && <span className="text-[13px] text-ink-3 tabular">({count})</span>}
        {description && <span className="hidden truncate text-[13px] text-ink-3 sm:inline">· {description}</span>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = "neutral", trend, className }) {
  return (
    <div className={cx("flex min-w-0 flex-col rounded-xl bg-surface p-5 shadow-[var(--shadow-card)] ring-1 ring-line", className)}>
      {icon && <IconChip icon={icon} tone={tone} />}
      <div className={cx("flex flex-wrap items-center gap-2", icon && "mt-5")}>
        <span className="truncate text-[24px] leading-9 font-semibold tracking-[-0.02em] text-ink tabular sm:text-[26px]">{value}</span>
        {trend && <TrendPill value={trend.value} direction={trend.direction} />}
      </div>
      <span className="mt-0.5 text-sm text-ink-2">{label}</span>
      {hint && <span className="mt-1 text-xs text-ink-3">{hint}</span>}
    </div>
  );
}

export function StatGroup({ children, cols = 4, className }) {
  return (
    <div className={cx("grid gap-1.5 rounded-2xl bg-tray p-1.5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3", cols === 4 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function TrendPill({ value, direction = "up" }) {
  return (
    <span className={cx("inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset", direction === "up" ? TONE_SOFT.success : TONE_SOFT.danger)}>
      {direction === "up" ? "↑" : "↓"} {value}
    </span>
  );
}

export function Badge({ tone = "neutral", icon: Icon, children, className, solid, size = "md" }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-sm font-medium whitespace-nowrap ring-1 ring-inset",
      size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
      solid ? TONE_SOFT[tone] : cx("bg-surface", TONE_OUTLINE[tone]), className)}>
      {Icon && <Icon className={cx(size === "sm" ? "size-3" : "size-3.5", "shrink-0", !solid && TONE_ICON[tone])} aria-hidden />}
      {!Icon && <span className={cx("size-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action, compact }) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface/60 text-center", compact ? "px-4 py-8" : "px-6 py-14")}>
      <IconChip icon={Icon} size="lg" />
      <div>
        <p className="text-title-3 text-ink">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Callout({ tone = "warn", icon: Icon, title, children, className, action }) {
  return (
    <div className={cx("flex gap-3 rounded-lg p-3.5 text-[13px] ring-1 ring-inset", TONE_SOFT[tone], className)}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

const CONTROL =
  "w-full rounded-md bg-surface text-sm text-ink ring-1 ring-inset ring-line-strong shadow-[var(--shadow-xs)] placeholder:text-ink-3 transition-shadow focus:outline-none focus:ring-brand focus:shadow-[var(--shadow-focus)] aria-[invalid=true]:ring-danger disabled:bg-subtle disabled:text-ink-3";

export function Field({ label, hint, error, children, className, htmlFor, optional }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
          {label} {optional && <span className="font-normal text-ink-3">(optional)</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-xs font-medium text-danger-ink">{error}</p> : hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function Input({ className, icon: Icon, prefix, ...rest }) {
  if (Icon || prefix) {
    return (
      <div className={cx("relative", className)}>
        {Icon && <Icon className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-ink-3" aria-hidden />}
        {prefix && <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-ink-3">{prefix}</span>}
        <input {...rest} className={cx(CONTROL, "h-10 pr-3", Icon ? "pl-10" : "pl-8")} />
      </div>
    );
  }
  return <input {...rest} className={cx(CONTROL, "h-10 px-3.5", className)} />;
}

export function Textarea({ className, ...rest }) {
  return <textarea {...rest} className={cx(CONTROL, "px-3.5 py-2.5 leading-relaxed", className)} />;
}

export function Select({ className, children, controlSize = "md", ...rest }) {
  return (
    <div className={cx("relative", className)}>
      <select {...rest} className={cx(CONTROL, "appearance-none pr-9", controlSize === "sm" ? "h-8 rounded-sm pl-2.5 text-[13px]" : "h-10 pl-3.5")}>
        {children}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

export function Checkbox({ label, description, className, ...rest }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3", className)}>
      <input type="checkbox" {...rest} className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-[var(--color-brand)]" />
      <span className="min-w-0">
        <span className="text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

export function ListRow({ href, leading, title, subtitle, trailing, className }) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-[13px] text-ink-3">{subtitle}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-3">{trailing}</div>}
    </>
  );
  const cls = cx("flex items-center gap-3 px-5 py-3.5", href && "transition-colors hover:bg-subtle", className);
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function Avatar({ name = "", src, size = "md", color }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
  const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-sm" };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cx("shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-line", sizes[size])} />;
  }
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", sizes[size], !color && "bg-brand-soft text-brand-ink")}
      style={color ? { background: color, color: "#fff" } : undefined}>
      {letters}
    </span>
  );
}

export function DescriptionList({ items, className }) {
  return (
    <dl className={cx("divide-y divide-line", className)}>
      {items.filter(Boolean).map(([term, value]) => (
        <div key={term} className="flex items-start justify-between gap-6 px-5 py-3 text-sm">
          <dt className="shrink-0 text-ink-3">{term}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Kbd({ children }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface px-1 font-mono text-[11px] text-ink-3">{children}</kbd>;
}

export function CodeBlock({ children, className }) {
  return <code className={cx("block overflow-x-auto rounded-md bg-contrast px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed text-white", className)}>{children}</code>;
}

// PayTrail mark: a receipt with a trail of dots leading to a tick
export function Logo({ className = "size-9", withWord, wordClass = "" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 40 40" className={className} aria-hidden>
        <defs>
          <linearGradient id="pt-g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#4c95f5" />
            <stop offset="1" stopColor="#1570EF" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#pt-g)" />
        <path d="M13 9.5h14a1.5 1.5 0 0 1 1.5 1.5v19.3l-2.6-1.6-2.6 1.6-2.6-1.6-2.6 1.6-2.6-1.6-2.6 1.6V11a1.5 1.5 0 0 1 1.5-1.5Z" fill="#fff" opacity=".95" />
        <circle cx="15.5" cy="15.5" r="1.3" fill="#1570EF" />
        <circle cx="19" cy="18.5" r="1.3" fill="#1570EF" opacity=".75" />
        <path d="m21.2 21.4 2 2 3.6-4.2" fill="none" stroke="#079455" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withWord && <span className={cx("text-[17px] font-semibold tracking-[-0.02em] text-ink", wordClass)}>PayTrail</span>}
    </span>
  );
}
