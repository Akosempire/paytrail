"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Mail, Save, Send } from "lucide-react";
import { Alert, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { useStepUp } from "@/components/step-up";
import { saveEmailSettings, sendTestEmail } from "../actions";

// Brevo for all of Usetally's email: sign-up and reset codes, security codes,
// invoices, receipts and admin alerts. Set up once here with an API key.
export function EmailStatus({ status }) {
  const router = useRouter();
  const toast = useToast();
  const { guarded, dialog } = useStepUp("platform");
  const [form, setForm] = useState({ apiKey: "", smtpLogin: "", fromName: status.fromName, fromAddress: status.fromAddress || "hello@usetally.cc" });
  const [show, setShow] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = () => startSave(async () => {
    const r = await guarded(() => saveEmailSettings(form));
    setResult(r);
    if (r.error) return toast.error({ title: "Not saved", message: r.error });
    if (r.warning) toast.warning({ title: r.messageTitle, message: r.message });
    else toast.success({ title: "Email connected", message: r.message });
    setForm((f) => ({ ...f, apiKey: "" }));
    router.refresh();
  });
  const test = () => startTest(async () => {
    const r = await sendTestEmail();
    setResult(r);
    if (r.error) toast.error({ title: "Test failed", message: r.error });
    else toast.success({ title: "Test sent", message: r.message });
  });

  const saved = status.saved;
  return (
    <Card>
      {dialog}
      <CardHeader icon={Mail} title="Email delivery" description="Sign-up codes, password resets, security codes, invoices and receipts all go out through your Brevo account." />
      <div className="flex flex-col gap-4 px-5 pb-5">
        {status.source === "dashboard" && (
          <Alert intent="success" title="Connected to Brevo" live={false}>
            Sending as <strong>{saved.email_from_name} &lt;{saved.email_from_address}&gt;</strong>
            {saved.email_account ? <> through Brevo (<strong>{saved.email_account}</strong>)</> : null}. Key ending {saved.email_key_hint}.
          </Alert>
        )}
        {status.source === "vercel" && (
          <Alert intent="warning" title="Using the SMTP settings in Vercel" live={false}>
            Paste a Brevo API key below to switch to the simpler setup. Once it's saved, the SMTP_* settings in Vercel are no longer used.
          </Alert>
        )}
        {!status.source && (
          <Alert intent="error" title="Not set up yet" live={false}>
            Until it is, Supabase sends plain sign-up emails and invoices can't be emailed.
          </Alert>
        )}

        <ol className="list-decimal space-y-1 rounded-xl bg-tray px-5 py-3.5 pl-9 text-[13px] leading-relaxed text-ink-2">
          <li>In Brevo: your name (top right) → <strong>Settings → Security → Authorized IPs</strong> → <strong>Deactivate blocking</strong>. Vercel's servers change address, so Brevo must not block new ones.</li>
          <li>Go to <strong>SMTP &amp; API</strong>. Paste either an <strong>API key</strong> (starts <code className="font-mono text-ink">xkeysib-</code>), or an <strong>SMTP key</strong> (starts <code className="font-mono text-ink">xsmtpsib-</code>) together with the <strong>Login</strong> shown on the SMTP tab.</li>
          <li>Use an address on a domain you've authenticated in Brevo, like <code className="font-mono text-ink">hello@usetally.cc</code>.</li>
        </ol>

        <Field label="Brevo key" htmlFor="brevo-key" hint={saved ? `Saved key ends ${saved.email_key_hint}. Leave empty to keep it.` : "Stored encrypted. Only the last 4 characters are ever shown again."}>
          <div className="relative">
            <Input id="brevo-key" icon={KeyRound} type={show ? "text" : "password"} autoComplete="off" spellCheck={false}
              placeholder={saved ? "•••••••• (saved)" : "xkeysib-… or xsmtpsib-…"} value={form.apiKey} onChange={set("apiKey")} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide key" : "Show key"}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-ink-3 hover:text-ink">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        {/^\s*xsmtpsib-/.test(form.apiKey) && (
          <Field label="SMTP login" htmlFor="smtp-login" hint="On Brevo → SMTP & API → SMTP tab, next to “Login”. It ends @smtp-brevo.com and isn't your account email.">
            <Input id="smtp-login" type="email" autoComplete="off" spellCheck={false} value={form.smtpLogin} onChange={set("smtpLogin")} placeholder="9a1b2c001@smtp-brevo.com" />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sender name" htmlFor="from-name" hint="Invoices use the business's own name instead.">
            <Input id="from-name" value={form.fromName} onChange={set("fromName")} placeholder="Usetally" />
          </Field>
          <Field label="Sender address" htmlFor="from-address">
            <Input id="from-address" type="email" value={form.fromAddress} onChange={set("fromAddress")} placeholder="hello@usetally.cc" />
          </Field>
        </div>

        {result?.error && (
          <Alert intent="error" size="sm" title={result.stepUp ? "Security code needed" : "Not working yet"}>
            {result.error}
            {result.hints?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4">{result.hints.map((h) => <li key={h}>{h}</li>)}</ul>}
          </Alert>
        )}
        {result?.warning && <Alert intent="warning" size="sm" title={result.messageTitle}>{result.message}</Alert>}
        {result?.message && !result.warning && !result.error && <Alert intent="success" size="sm">{result.message}</Alert>}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={Save} loading={saving} disabled={saving || testing} onClick={save}>{saved ? "Save and check" : "Connect Brevo"}</Button>
          <Button icon={Send} loading={testing} disabled={saving || testing || !status.ready} onClick={test}>Send test email to me</Button>
        </div>
      </div>
    </Card>
  );
}
