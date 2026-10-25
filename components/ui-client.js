"use client";
import { createContext, isValidElement, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
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

const noop = Object.assign(() => {}, { success() {}, error() {}, warning() {}, info() {}, loading() {}, update() {}, dismiss() {}, promise: (p) => p });
const ToastContext = createContext(noop);
export function useToast() { return useContext(ToastContext); }

// Toasts: every result and state change the person should know about.
// Same rules as <Alert>: neutral surface, colour only on icon + title.
//
//   const toast = useToast();
//   toast("Invoice sent")                                   // success
//   toast.error("Couldn't reach Paystack")                  // also: success, warning, info
//   toast.warning({ title: "Trial ends soon", message: "Pick a plan to keep sending." })
//   toast.error("Payment failed", { action: { label: "Retry", onClick: retry } })
//   const id = toast.loading("Sending invoice…"); … toast.update(id, { intent: "success", message: "Sent" })
//   await toast.promise(sendInvoice(), { loading: "Sending…", success: "Sent", error: (e) => e.message })
//
// Errors and warnings stay longer; loading toasts stay until updated; hovering
// pauses the timer. Also built in: going offline / back online, and a catch-all
// for unexpected failures (e.g. the connection dropping mid-action).
const DURATION = { success: 4200, info: 5000, warning: 7000, error: 8000, loading: 0 };
const LOADING = { icon: Loader2, text: "text-ink-2", role: "status", label: "Working" };

export function ToastProvider({ children }) {
  const [toasts, setToastState] = useState([]);
  const list = useRef([]);
  // keep a synchronous copy so de-duplication can return the existing id
  const setToasts = useCallback((fn) => { list.current = typeof fn === "function" ? fn(list.current) : fn; setToastState(list.current); }, []);
  const timers = useRef(new Map());

  const clear = useCallback((id) => { clearTimeout(timers.current.get(id)); timers.current.delete(id); }, []);
  const dismiss = useCallback((id) => { clear(id); setToasts((t) => t.filter((x) => x.id !== id)); }, [clear, setToasts]);
  const arm = useCallback((id, intent, ms) => {
    clear(id);
    const time = ms ?? DURATION[intent];
    if (time) timers.current.set(id, setTimeout(() => dismiss(id), time));
  }, [clear, dismiss]);

  const api = useMemo(() => {
    const normalise = (input, intent, extra) => {
      const t = typeof input === "object" && input !== null && !isValidElement(input) ? { ...input } : { message: input };
      Object.assign(t, extra || {});
      t.intent = t.intent === "loading" || intent === "loading" ? "loading" : intentOf(t.intent || intent);
      return t;
    };
    const show = (input, intent = "success", extra) => {
      const t = normalise(input, intent, extra);
      if (!t.message && !t.title) return null;
      // the same text already on screen: refresh it instead of stacking a copy
      const same = list.current.find((x) => x.intent === t.intent && x.message === t.message && x.title === t.title);
      if (same) { arm(same.id, t.intent, t.duration); return same.id; }
      const id = t.id || Math.random().toString(36).slice(2);
      setToasts((l) => [...l.filter((x) => x.id !== id).slice(-3), { ...t, id }]);
      arm(id, t.intent, t.duration);
      return id;
    };
    const fn = (input, tone) => show(input, tone || "success");
    fn.success = (m, x) => show(m, "success", x);
    fn.error = (m, x) => show(m, "error", x);
    fn.warning = (m, x) => show(m, "warning", x);
    fn.info = (m, x) => show(m, "info", x);
    fn.loading = (m, x) => show(m, "loading", x);
    fn.dismiss = dismiss;
    fn.update = (id, patch) => {
      if (!id) return;
      setToasts((list) => list.map((x) => (x.id === id ? { ...x, ...patch, intent: patch.intent ? (patch.intent === "loading" ? "loading" : intentOf(patch.intent)) : x.intent } : x)));
      if (patch.intent) arm(id, patch.intent === "loading" ? "loading" : intentOf(patch.intent), patch.duration);
    };
    fn.promise = async (promise, { loading = "Working…", success = "Done", error = "Something went wrong. Try again." } = {}) => {
      const id = show(loading, "loading");
      try {
        const r = await promise;
        // server actions report failure as { error }
        if (r && r.error) fn.update(id, { intent: "error", title: undefined, message: typeof error === "function" ? error(r) : r.error });
        else fn.update(id, { intent: "success", message: typeof success === "function" ? success(r) : (r && r.message) || success });
        return r;
      } catch (e) {
        fn.update(id, { intent: "error", message: typeof error === "function" ? error(e) : error });
        throw e;
      }
    };
    return fn;
  }, [arm, dismiss, setToasts]);

  // connection state and unexpected failures
  useEffect(() => {
    let offlineId = null;
    const offline = () => { offlineId = api.warning({ title: "You're offline", message: "Changes won't save until you're back online." }, { duration: 0 }); };
    const online = () => { if (offlineId) api.dismiss(offlineId); offlineId = null; api.success("Back online"); };
    let lastCrash = 0;
    const crash = (e) => {
      const reason = e?.reason || e?.error;
      if (reason?.name === "AbortError" || /NEXT_REDIRECT|NEXT_NOT_FOUND/.test(String(reason?.digest || reason?.message || ""))) return;
      if (Date.now() - lastCrash < 4000) return;
      lastCrash = Date.now();
      api.error(navigator.onLine === false
        ? { title: "You're offline", message: "That didn't go through. Try again when you're connected." }
        : { title: "Something went wrong", message: "That didn't go through. Please try again." });
    };
    if (navigator.onLine === false) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("unhandledrejection", crash);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); window.removeEventListener("unhandledrejection", crash); };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* phones: top of the screen, newest first; larger screens: bottom */}
      <div className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[60] flex flex-col-reverse items-center gap-2 px-3 sm:top-auto sm:bottom-6 sm:flex-col sm:px-4">
        {toasts.map((t) => {
          const it = t.intent === "loading" ? LOADING : INTENTS[t.intent];
          return (
            <div key={t.id} role={it.role} aria-live={it.role === "alert" ? "assertive" : "polite"}
              onMouseEnter={() => clear(t.id)} onMouseLeave={() => arm(t.id, t.intent, t.duration)}
              className="pointer-events-auto flex w-full max-w-[440px] animate-[toast-drop_.28s_cubic-bezier(.2,.9,.3,1)] items-start sm:animate-rise gap-3 rounded-2xl border border-notice-line bg-notice px-4 py-3 shadow-[var(--shadow-pop)]">
              <it.icon className={cx("mt-0.5 size-[18px] shrink-0", it.text, t.intent === "loading" && "animate-spin")} aria-hidden="true" />
              <div className="min-w-0 flex-1 leading-snug">
                <span className="sr-only">{it.label}: </span>
                {t.title && <p className={cx("text-sm font-medium", t.intent === "loading" ? "text-ink" : it.text)}>{t.title}</p>}
                {t.message && <p className={cx("text-[13.5px]", t.title ? "mt-0.5 text-notice-body" : "text-ink")}>{t.message}</p>}
                {t.action && (
                  <button type="button" onClick={() => { dismiss(t.id); t.action.onClick?.(); }}
                    className="mt-2 rounded-md text-[13px] font-semibold text-brand-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{t.action.label}</button>
                )}
              </div>
              {t.intent !== "loading" && (
                <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-1 rounded-md p-1 text-notice-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  <X className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// shows a server action's result as a toast: { error } / { warning } / { info } / { message }
// The same result object is never toasted twice, so forms can use this and
// <FormMessage> together safely.
const toasted = new WeakSet();
export function useActionToast(state, { success = true } = {}) {
  const toast = useToast();
  useEffect(() => {
    if (!state || typeof state !== "object" || toasted.has(state)) return;
    toasted.add(state);
    if (state.error) toast.error(state.errorTitle ? { title: state.errorTitle, message: state.error } : state.error);
    else if (state.warning) toast.warning(state.warning);
    else if (state.info) toast.info(state.info);
    else if (success && state.message) toast.success(state.messageTitle ? { title: state.messageTitle, message: state.message } : state.message);
  }, [state, toast, success]);
}

// A form's result. By default it's shown as a toast; pass `inline` to also
// keep it on the page (useful for long explanations).
export function FormMessage({ state, success = true, inline = false }) {
  useActionToast(state, { success });
  if (!inline) return null;
  if (state?.error) return <Alert intent="error" size="sm" title={state.errorTitle}>{state.error}</Alert>;
  if (success && state?.message) return <Alert intent="success" size="sm" title={state.messageTitle}>{state.message}</Alert>;
  return null;
}
