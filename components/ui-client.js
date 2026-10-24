"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, Loader2, Moon, Sun, X, CheckCircle2, AlertCircle } from "lucide-react";
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

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md animate-rise items-center gap-2.5 rounded-xl bg-contrast px-4 py-3 text-sm text-white shadow-[var(--shadow-pop)]">
            {t.tone === "error" ? <AlertCircle className="size-4 shrink-0 text-[#fda29b]" /> : <CheckCircle2 className="size-4 shrink-0 text-[#6ee0a6]" />}
            {t.message}
          </div>
        ))}
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

export function FormMessage({ state }) {
  if (!state?.error) return null;
  return <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger-ink ring-1 ring-inset ring-danger/25">{state.error}</p>;
}
