// Notices: inline alerts for success, error, warning and info.
//
// Design rules (kept on purpose, please don't "brighten" these):
//  - the container is always a neutral surface with a fine 1px border,
//    never a coloured fill;
//  - intent colour appears only on the small icon and the title;
//  - the message stays a neutral, muted grey;
//  - every intent/body colour passes WCAG AA on the surface, light and dark
//    (tokens: --color-notice*, --color-intent-* in globals.css).
//
// Usage
//   <Alert intent="success" title="Payment received">₦537,500 from Chioma Obi was added to INV-0042.</Alert>
//   <Alert intent="error" title="Couldn't save">{state.error}</Alert>
//   <Alert intent="warning" title="Trial ends in 3 days" action={<Button size="sm" href="/app/settings/billing">Choose a plan</Button>} />
//   <Alert intent="info" variant="accent">Changes apply to new documents only.</Alert>
//   <Alert intent="error">{message}</Alert>          // one line, no title
//
// Roles: errors and warnings announce immediately (role="alert"); success and
// info are polite (role="status"). Pass live={false} for notes that are part
// of the page from the start, so screen readers don't announce them on load.
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

const cx = (...c) => c.filter(Boolean).join(" ");

export const INTENTS = {
  success: { icon: CircleCheck, text: "text-intent-success", accent: "border-l-intent-success", role: "status", label: "Success" },
  error: { icon: CircleAlert, text: "text-intent-error", accent: "border-l-intent-error", role: "alert", label: "Error" },
  warning: { icon: TriangleAlert, text: "text-intent-warning", accent: "border-l-intent-warning", role: "alert", label: "Warning" },
  info: { icon: Info, text: "text-intent-info", accent: "border-l-intent-info", role: "status", label: "Info" },
};

// older tone names used around the app
const ALIASES = { danger: "error", warn: "warning", brand: "info", neutral: "info", violet: "info" };
export const intentOf = (tone) => (INTENTS[tone] ? tone : ALIASES[tone] || "info");

export function Alert({ intent = "info", title, children, icon, action, variant = "surface", size = "md", live = true, className, id }) {
  const key = intentOf(intent);
  const it = INTENTS[key];
  const Icon = icon || it.icon;
  const sm = size === "sm";
  return (
    <div
      id={id}
      role={live ? it.role : "note"}
      data-intent={key}
      className={cx(
        "flex w-full gap-3 rounded-lg border border-notice-line bg-notice text-left",
        variant === "accent" && cx("border-l-2", it.accent),
        sm ? "px-3 py-2.5" : "px-4 py-3.5",
        className,
      )}
    >
      <Icon className={cx("shrink-0", sm ? "mt-px size-4" : "mt-0.5 size-[18px]", it.text)} strokeWidth={2} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{it.label}: </span>
        {title && <p className={cx("font-medium leading-snug", sm ? "text-[13px]" : "text-sm", it.text)}>{title}</p>}
        {children && (
          <div className={cx("leading-snug [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-medium [&_strong]:text-ink",
            sm ? "text-[12.5px]" : "text-[13.5px]",
            title ? "mt-1 text-notice-body" : "text-ink")}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

// A list of notices from data, e.g. results coming back from the server:
//   <AlertStack items={[{ intent: "success", title: "Saved" }, { intent: "warning", title: "…", message: "…" }]} />
export function AlertStack({ items = [], className, size }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {list.map((n, i) => (
        <Alert key={n.id || `${n.intent}-${n.title || n.message}-${i}`} intent={n.intent} title={n.title} action={n.action} size={size} live={n.live ?? true}>
          {n.message}
        </Alert>
      ))}
    </div>
  );
}
