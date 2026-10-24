"use client";
import { useCallback, useRef, useState } from "react";
import { Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { confirmSecurityCode, requestSecurityCode } from "@/app/app/security/actions";

const WHAT = { payment_keys: "change payment keys", bank_details: "change bank details" };

// Asks for the 6-digit code we email before a sensitive change.
//   const { ask, guarded, dialog } = useStepUp();
//   act(() => guarded(() => saveConnection(...)))   // retries after the code
//   if (state.stepUp) ask(state.stepUp).then((ok) => ok && form.requestSubmit())
export function useStepUp(scope = "business") {
  const [open, setOpen] = useState(null); // purpose
  const [code, setCode] = useState("");
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState(false);
  const resolver = useRef(null);

  const send = useCallback(async (purpose) => {
    setStatus({ sending: true });
    const r = await requestSecurityCode(purpose, scope);
    if (r.granted) { resolver.current?.(true); resolver.current = null; setOpen(null); return; }
    setStatus(r.error ? { error: r.error } : { sent: r.email });
  }, [scope]);

  const ask = useCallback((purpose) => new Promise((resolve) => {
    resolver.current = resolve;
    setCode("");
    setOpen(purpose);
    send(purpose);
  }), [send]);

  const guarded = useCallback(async (fn) => {
    const first = await fn();
    if (!first?.stepUp) return first;
    const ok = await ask(first.stepUp);
    return ok ? fn() : { error: "Not saved. Enter the security code from your email to continue." };
  }, [ask]);

  const close = (ok) => { resolver.current?.(ok); resolver.current = null; setOpen(null); setStatus({}); };
  const verify = async () => {
    setBusy(true);
    const r = await confirmSecurityCode(open, code, scope);
    setBusy(false);
    if (r.verified) close(true); else setStatus((s) => ({ ...s, error: r.error }));
  };

  const dialog = (
    <Modal open={Boolean(open)} onClose={() => close(false)} size="sm" title="Confirm it's you"
      description={`For your security, enter the code we emailed you to ${WHAT[open] || "continue"}.`}
      footer={<><Button onClick={() => close(false)}>Cancel</Button><Button variant="primary" icon={busy ? Loader2 : ShieldCheck} loading={busy} disabled={code.replace(/\D/g, "").length !== 6} onClick={verify}>Verify</Button></>}>
      <div className="flex flex-col gap-3" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (code.replace(/\D/g, "").length === 6) verify(); } }}>
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          <MailCheck className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
          {status.sending ? "Sending your code…" : status.sent ? <>Sent to <strong className="text-ink">{status.sent}</strong>. It expires in 10 minutes.</> : "We'll email you a code."}
        </p>
        <label htmlFor="stepup-code" className="sr-only">6-digit code</label>
        <input id="stepup-code" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" autoFocus
          className="h-14 w-full rounded-lg bg-surface text-center font-mono text-[26px] tracking-[0.3em] text-ink ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-brand focus:outline-none" />
        {status.error && <Alert intent="error" size="sm">{status.error}</Alert>}
        <button type="button" onClick={() => send(open)} disabled={status.sending} className="self-start text-[13px] font-medium text-brand-ink hover:underline disabled:opacity-50">Send a new code</button>
      </div>
    </Modal>
  );
  return { ask, guarded, dialog };
}
