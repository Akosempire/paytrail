"use client";
import { useStepUp } from "@/components/step-up";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Select, cx, Badge } from "@/components/ui";
import { CopyButton, useToast } from "@/components/ui-client";
import { saveBilling, saveTrial } from "../actions";

const PROVIDER_INFO = {
  stripe: { name: "Stripe", key: "sk_live_…", hook: "Webhook signing secret (whsec_…)" },
  paystack: { name: "Paystack", key: "sk_live_…", hook: null },
  flutterwave: { name: "Flutterwave", key: "FLWSECK-…", hook: "Secret hash" },
  bachs: { name: "Bachs", key: "sk_live_…", hook: "Webhook signing secret" },
};

export function PlatformSettings({ settings, webhooks, billingMode }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [trial, setTrial] = useState({ trial_mode: settings.trial_mode, trial_documents: settings.trial_documents, trial_days: settings.trial_days, support_email: settings.support_email });
  const [billing, setBilling] = useState({ provider: settings.billing_provider, secretKey: "", webhookSecret: "" });
  const { guarded, dialog: stepUpDialog } = useStepUp("platform");
  const run = (fn) => start(async () => { const r = await fn(); if (r.error) return toast(r.error, "error"); toast(r.message); router.refresh(); });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {stepUpDialog}
      <Card>
        <CardHeader title="Free trial" description="What every new business gets before choosing a plan." />
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-1.5 rounded-xl bg-tray p-1.5 sm:grid-cols-3">
            {[["documents", "Free documents", "e.g. first 2 sent"], ["days", "Free days", "e.g. 14 days"], ["none", "No trial", "Plan needed to send"]].map(([k, l, h]) => (
              <button key={k} type="button" onClick={() => setTrial({ ...trial, trial_mode: k })}
                className={cx("rounded-lg p-3 text-left", trial.trial_mode === k ? "bg-surface shadow-[var(--shadow-card)] ring-2 ring-brand" : "hover:bg-surface/60")}>
                <span className="block text-sm font-semibold text-ink">{l}</span><span className="text-xs text-ink-3">{h}</span>
              </button>
            ))}
          </div>
          {trial.trial_mode === "documents" && <Field label="Free quotes/invoices per business" htmlFor="td" hint="Counted when a document is sent. Converting a quote into an invoice doesn't count twice."><Input id="td" inputMode="numeric" value={trial.trial_documents} onChange={(e) => setTrial({ ...trial, trial_documents: e.target.value })} /></Field>}
          {trial.trial_mode === "days" && <Field label="Trial length (days)" htmlFor="tdy" hint="Applies to businesses that sign up from now on."><Input id="tdy" inputMode="numeric" value={trial.trial_days} onChange={(e) => setTrial({ ...trial, trial_days: e.target.value })} /></Field>}
          <Field label="Support email" htmlFor="se" hint="Shown to businesses who need help, or want to pay by transfer."><Input id="se" type="email" value={trial.support_email} onChange={(e) => setTrial({ ...trial, support_email: e.target.value })} /></Field>
          <Button variant="primary" icon={pending ? Loader2 : Save} className="self-start" onClick={() => run(() => saveTrial(trial))}>Save trial settings</Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Collecting subscriptions" description="Usetally's own payment account, separate from the businesses' accounts."
          actions={settings.billing_provider === "manual" ? <Badge tone="neutral" size="sm">Bank transfer</Badge> : billingMode === "live" ? <Badge tone="success" size="sm">Live key</Badge> : billingMode === "test" ? <Badge tone="warn" size="sm">Test key · no real payments</Badge> : null} />
        {settings.billing_provider !== "manual" && billingMode === "test" && (
          <p className="mx-5 mt-4 rounded-lg bg-warn-soft px-3.5 py-3 text-[13px] leading-relaxed text-warn-ink">
            The saved key is a test (sandbox) key. Test checkouts don't take real money, so businesses can't subscribe with it: they'll be told online payment isn't available yet, and no plan is ever activated by a test payment. Paste your live secret key to start collecting.
          </p>
        )}
        <div className="flex flex-col gap-4 p-5">
          <Field label="How businesses pay Usetally" htmlFor="bp">
            <Select id="bp" value={billing.provider} onChange={(e) => setBilling({ ...billing, provider: e.target.value })}>
              <option value="manual">Bank transfer (you activate plans here)</option>
              <option value="stripe">Stripe (automatic, worldwide cards)</option>
              <option value="paystack">Paystack (automatic, Africa)</option>
              <option value="flutterwave">Flutterwave (automatic, Africa)</option>
              <option value="bachs">Bachs (automatic)</option>
            </Select>
          </Field>
          {billing.provider !== "manual" && (
            <>
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink-2">Webhook URL for Usetally's {PROVIDER_INFO[billing.provider].name} account</p>
                <div className="flex items-center gap-2 rounded-md bg-subtle p-1.5 pl-3 ring-1 ring-line"><code className="min-w-0 flex-1 truncate font-mono text-[12px]">{webhooks[billing.provider]}</code><CopyButton value={webhooks[billing.provider]} /></div>
              </div>
              <Field label="Secret key" htmlFor="bk" hint={settings.billing_key_hint && settings.billing_provider === billing.provider ? `Saved key ends in …${settings.billing_key_hint}. Leave blank to keep it.` : undefined}>
                <Input id="bk" type="password" autoComplete="off" value={billing.secretKey} onChange={(e) => setBilling({ ...billing, secretKey: e.target.value })} placeholder={PROVIDER_INFO[billing.provider].key} />
              </Field>
              {PROVIDER_INFO[billing.provider].hook
                ? <Field label={PROVIDER_INFO[billing.provider].hook} htmlFor="bw"><Input id="bw" type="password" autoComplete="off" value={billing.webhookSecret} onChange={(e) => setBilling({ ...billing, webhookSecret: e.target.value })} /></Field>
                : <p className="text-[13px] text-ink-3">Paystack signs its webhooks with your secret key, so there's no separate webhook secret.</p>}
            </>
          )}
          <Button variant="primary" icon={pending ? Loader2 : Save} className="self-start" onClick={() => run(() => guarded(() => saveBilling(billing)))}>Save billing settings</Button>
        </div>
      </Card>
    </div>
  );
}
