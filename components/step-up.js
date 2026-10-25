"use client";
import { useCallback, useRef, useState } from "react";
import { Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { OtpInput, ResendCode } from "@/components/otp-input";
import { Modal, useToast } from "@/components/ui-client";
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
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const resolver = useRef(null);

  const send = useCallback(async (purpose) => {
    setStatus({ sending: true });
    const r = await requestSecurityCode(purpose, scope);
    if (r.granted) { resolver.current?.(true); resolver.current = null; setOpen(null); return; }
    if (r.error) toast.error({ title: "Code not sent", message: r.error });
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
  const verify = async (value = code) => {
    if (busy) return;
    setBusy(true);
    const r = await confirmSecurityCode(open, value, scope);
    setBusy(false);
    if (r.verified) close(true);
    else { toast.error({ title: "Code not accepted", message: r.error }); setStatus((s) => ({ ...s, error: r.error, errorAt: Date.now() })); }
  };

  const dialog = (
    <Modal open={Boolean(open)} onClose={() => close(false)} size="sm" title="Confirm it's you"
      description={`For your security, enter the code we emailed you to ${WHAT[open] || "continue"}.`}
      footer={<><Button onClick={() => close(false)}>Cancel</Button><Button variant="primary" icon={busy ? Loader2 : ShieldCheck} loading={busy} disabled={code.replace(/\D/g, "").length !== 6} onClick={() => verify()}>Verify</Button></>}>
      <div className="flex flex-col gap-3" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (code.replace(/\D/g, "").length === 6) verify(); } }}>
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          <MailCheck className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
          {status.sending ? "Sending your code…" : status.sent ? <>Sent to <strong className="text-ink">{status.sent}</strong>. It expires in 10 minutes.</> : "We'll email you a code."}
        </p>
        {open && <OtpInput key={open} name="stepup-code" label="6-digit security code" errorKey={status.errorAt} onChange={setCode} onComplete={(c) => verify(c)} disabled={busy} />}
        <p className="text-[13px]">{open && <ResendCode key={open} onResend={() => send(open)} />}</p>
      </div>
    </Modal>
  );
  return { ask, guarded, dialog };
}
