"use client";
import { createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, Loader2, Moon, Sun, X } from "lucide-react";
import { Alert, INTENTS, intentOf } from "@/components/alert";
import { Button, cx } from "@/components/ui";

// submit button that shows a spinner while its form's server action runs
export function SubmitButton({ children, pendingText, icon, variant = "primary", ...rest }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} icon={pending ? Loader2 : icon} loading={pending} {...rest}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement;
    ref.current?.querySelector("input,select,textarea,button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-[#101828]/45 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        className={cx("relative flex max-h-[92vh] w-full animate-rise flex-col overflow-hidden rounded-t-2xl bg-surface shadow-[var(--shadow-dialog)] ring-1 ring-line sm:rounded-2xl", widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-title-2 text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 ring-1 ring-line hover:bg-hover hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled, name }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {name && <input type="hidden" name={name} value={checked ? "on" : ""} />}
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]",
          checked ? "bg-brand" : "bg-line-strong")}>
        <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

export function Segmented({ value, onChange, options, size = "md", className, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-tray p-1 no-scrollbar", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>
            {Icon && <Icon className="size-3.5" />}
            {o.label}
            {o.count != null && <span className="text-ink-3 tabular">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function CopyButton({ value, label = "Copy", copiedLabel = "Copied", variant = "secondary", size = "sm", className }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant={variant} size={size} className={className} icon={copied ? Check : Copy}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); } catch { /* clipboard blocked; nothing else to do */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}>
      {copied ? copiedLabel : label}
    </Button>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(null);
  useEffect(() => { setTheme(document.documentElement.dataset.theme || "light"); }, []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" aria-label={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("pt-theme", next); } catch { /* storage blocked */ }
        setTheme(next);
      }}
      className="inline-flex size-10 items-center justify-center rounded-md text-ink-2 ring-1 ring-inset ring-line-strong hover:bg-hover hover:text-ink">
      {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

const ToastContext = createContext(() => {});
export function useToast() { return useContext(ToastContext); }

// Toasts use the same rules as <Alert>: neutral surface, colour on icon + title.
//   const toast = useToast();
//   toast("Invoice sent")                                  // success, one line
//   toast("Couldn't reach Paystack", "error")
//   toast({ intent: "warning", title: "Trial ends soon", message: "Pick a plan to keep sending." })
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((input, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    const t = typeof input === "object" && input !== null && !isValidElement(input) ? { ...input } : { message: input, intent: tone };
    t.intent = intentOf(t.intent || tone);
    setToasts((list) => [...list.slice(-3), { id, ...t }]);
    setTimeout(() => dismiss(id), t.intent === "error" || t.intent === "warning" ? 7000 : 4200);
  }, [dismiss]);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const it = INTENTS[t.intent];
          return (
            <div key={t.id} role={it.role} className="pointer-events-auto flex w-full max-w-[420px] animate-rise items-start gap-3 rounded-xl border border-notice-line bg-notice px-4 py-3 shadow-[var(--shadow-pop)]">
              <it.icon className={cx("mt-0.5 size-[18px] shrink-0", it.text)} aria-hidden="true" />
              <div className="min-w-0 flex-1 leading-snug">
                <span className="sr-only">{it.label}: </span>
                {t.title && <p className={cx("text-sm font-medium", it.text)}>{t.title}</p>}
                {t.message && <p className={cx("text-[13.5px]", t.title ? "mt-0.5 text-notice-body" : "text-ink")}>{t.message}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-1 rounded-md p-1 text-notice-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// shows server-action results ({ ok, message } or { error }) as a toast
export function useActionToast(state) {
  const toast = useToast();
  const last = useRef(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.error) toast(state.error, "error");
    else if (state.message) toast(state.message);
  }, [state, toast]);
}

// the error (or message) a server action returned, shown inline above a form
export function FormMessage({ state, success = false }) {
  if (state?.error) return <Alert intent="error" size="sm" title={state.errorTitle}>{state.error}</Alert>;
  if (success && state?.message) return <Alert intent="success" size="sm" title={state.messageTitle}>{state.message}</Alert>;
  return null;
}
