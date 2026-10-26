"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Mail, Save, Send } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
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
  // which service's steps to show: the connected one, else Sendhiiv
  const [service, setService] = useState(status.provider || "sendbyte");
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = () => startSave(async () => {
    const r = await guarded(() => saveEmailSettings(form));
    if (r.error) return toast.error({ title: "Not saved", message: r.error}, { duration: 15000 });
    if (r.warning) toast.warning({ title: r.messageTitle, message: r.message });
    else toast.success({ title: "Email connected", message: r.message });
    setForm((f) => ({ ...f, apiKey: "" }));
    router.refresh();
  });
  const test = () => startTest(async () => {
    const r = await sendTestEmail();
    // hints (what to change) go in the same toast, after Brevo's answer
    if (r.error) toast.error({ title: "Test failed", message: [r.error, ...(r.hints || [])].join(" ")}, { duration: 15000 });
    else toast.success({ title: "Test sent", message: r.message });
  });

  const saved = status.saved;
  return (
    <Card>
      {dialog}
      <CardHeader icon={Mail} title="Email delivery" description="Sign-up codes, password resets, security codes, invoices and receipts all go out through your Sendbyte, Sendhiiv or Brevo account."
        actions={status.source === "dashboard" ? <Badge tone="success" size="sm">Connected · {{ sendhiiv: "Sendhiiv", sendbyte: "Sendbyte" }[status.provider] || "Brevo"}</Badge> : /^vercel-/.test(status.source || "") ? <Badge tone="success" size="sm">Connected · {{ sendhiiv: "Sendhiiv", sendbyte: "Sendbyte" }[status.provider]} (Vercel)</Badge> : status.source === "vercel" ? <Badge tone="warn" size="sm">Using Vercel SMTP</Badge> : <Badge tone="neutral" size="sm">Not set up</Badge>} />
      <div className="flex flex-col gap-4 p-5">
        <div role="tablist" aria-label="Email service" className="grid grid-cols-3 gap-1 rounded-xl bg-tray p-1 sm:inline-grid sm:w-96">
          {[["sendbyte", "Sendbyte"], ["sendhiiv", "Sendhiiv"], ["brevo", "Brevo"]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={service === key} onClick={() => setService(key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${service === key ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-ink-2 hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        {service === "sendbyte" ? (
          <ol className="list-decimal space-y-1 rounded-xl bg-tray px-5 py-3.5 pl-9 text-[13px] leading-relaxed text-ink-2">
            <li>In your Sendbyte dashboard, verify your sending domain (e.g. <code className="font-mono text-ink">usetally.cc</code>). Live keys only send from verified domains.</li>
            <li>Create an <strong>API key</strong> with the <strong>send_only</strong> (or full_access) scope. Use the live key: it starts <code className="font-mono text-ink">sk_live_</code>. Test keys (<code className="font-mono text-ink">sk_test_</code>) don't deliver.</li>
            <li>Paste it below with a sender address on that domain, like <code className="font-mono text-ink">hello@usetally.cc</code>.</li>
          </ol>
        ) : service === "sendhiiv" ? (
          <ol className="list-decimal space-y-1 rounded-xl bg-tray px-5 py-3.5 pl-9 text-[13px] leading-relaxed text-ink-2">
            <li>In your Sendhiiv dashboard, create an <strong>API key</strong> (it starts <code className="font-mono text-ink">sh_live_</code>) and paste it below.</li>
            <li>Verify your sending domain in Sendhiiv (e.g. <code className="font-mono text-ink">usetally.cc</code>) so emails come from your own address. Leave the sender address empty to use Sendhiiv's shared sender while you set that up.</li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-1 rounded-xl bg-tray px-5 py-3.5 pl-9 text-[13px] leading-relaxed text-ink-2">
            <li>In Brevo: your name (top right) → <strong>Settings → Security → Authorized IPs</strong> → <strong>Deactivate blocking</strong>. Vercel's servers change address, so Brevo must not block new ones.</li>
            <li>Go to <strong>SMTP &amp; API</strong>. Paste either an <strong>API key</strong> (starts <code className="font-mono text-ink">xkeysib-</code>), or an <strong>SMTP key</strong> (starts <code className="font-mono text-ink">xsmtpsib-</code>) together with the <strong>Login</strong> shown on the SMTP tab.</li>
            <li>Use an address on a domain you've authenticated in Brevo, like <code className="font-mono text-ink">hello@usetally.cc</code>.</li>
          </ol>
        )}

        <Field label={service === "sendbyte" ? "Sendbyte API key" : service === "sendhiiv" ? "Sendhiiv API key" : "Brevo key"} htmlFor="brevo-key" hint={saved ? `Saved key ends ${saved.email_key_hint}${saved.email_account ? ` (${saved.email_account})` : ""}. Leave empty to keep it.` : "Stored encrypted. Only the last 4 characters are ever shown again."}>
          <div className="relative">
            <Input id="brevo-key" icon={KeyRound} type={show ? "text" : "password"} autoComplete="off" spellCheck={false}
              placeholder={saved ? "•••••••• (saved)" : service === "sendbyte" ? "sk_live_…" : service === "sendhiiv" ? "sh_live_…" : "xkeysib-… or xsmtpsib-…"} value={form.apiKey} onChange={set("apiKey")} />
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

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={Save} loading={saving} disabled={saving || testing} onClick={save}>{saved ? "Save and check" : service === "sendbyte" ? "Connect Sendbyte" : service === "sendhiiv" ? "Connect Sendhiiv" : "Connect Brevo"}</Button>
          <Button icon={Send} loading={testing} disabled={saving || testing || !status.ready} onClick={test}>Send test email to me</Button>
        </div>
      </div>
    </Card>
  );
}
