"use client";
import { useStepUp } from "@/components/step-up";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDashed, ExternalLink, KeyRound, Loader2, PlugZap, RefreshCw, ShieldCheck, Webhook, CreditCard, Power, Trash2, TriangleAlert, Sparkles } from "lucide-react";
import { Badge, Button, Callout, Card, Field, Input, cx } from "@/components/ui";
import { CopyButton, Modal, useToast } from "@/components/ui-client";
import { disconnect, recheckConnection, runTestPayment, saveConnection, setEnabled } from "./actions";

const GUIDES = {
  stripe: {
    name: "Stripe",
    blurb: "Cards, Apple Pay and Google Pay in the US, UK, Europe, Canada, Australia and 40+ countries.",
    regions: "Best for businesses outside Africa",
    site: "https://dashboard.stripe.com",
    color: "#635BFF",
    keyLabel: "Secret key",
    keyPlaceholder: "sk_test_… or sk_live_…",
    hookLabel: "Webhook signing secret",
    hookPlaceholder: "whsec_…",
    steps: [
      { title: "Open your Stripe account", body: "Sign in at dashboard.stripe.com, or create an account. Test mode works straight away. To take real money, activate your account with your business and bank details." },
      { title: "Copy your secret key", body: "Go to Developers → API keys and reveal the Secret key. In test mode it starts with sk_test_. Keep it private." },
      { title: "Add your PayTrail webhook", body: "Go to Developers → Webhooks → Add endpoint and paste the URL below. Choose the events checkout.session.completed, checkout.session.async_payment_succeeded and checkout.session.expired. After saving, reveal the Signing secret (it starts with whsec_) and copy it.", webhook: true },
      { title: "Paste both into PayTrail", body: "PayTrail checks the key with Stripe before saving, and stores it encrypted.", form: true },
      { title: "Make a test payment", body: "Pay a small test amount with Stripe's test card 4242 4242 4242 4242, any future expiry date and any CVC. PayTrail waits for the payment and the webhook.", test: true, docs: "https://docs.stripe.com/testing", docsLabel: "Stripe test cards" },
      { title: "Go live", body: "Turn off test mode in Stripe. Repeat steps 2–4 with your live secret key (sk_live_…) and add the webhook again in live mode, then run one small test." },
    ],
  },
  paystack: {
    name: "Paystack",
    blurb: "Cards, bank transfer, USSD and mobile money in Nigeria, Ghana, Kenya, South Africa and Côte d'Ivoire.",
    regions: "Popular in Nigeria and Ghana",
    site: "https://dashboard.paystack.com",
    color: "#0BA4DB",
    keyLabel: "Secret key",
    keyPlaceholder: "sk_test_… or sk_live_…",
    noHook: true,
    steps: [
      { title: "Open your Paystack account", body: "Sign in at dashboard.paystack.com, or sign up. Test mode works straight away. To take real money, complete Paystack's business verification." },
      { title: "Copy your secret key", body: "Go to Settings → API Keys & Webhooks and copy the Test Secret Key (it starts with sk_test_)." },
      { title: "Add your PayTrail webhook", body: "On the same page, paste the URL below into Test Webhook URL and save. Paystack signs its messages with your secret key, so there's no extra secret to copy.", webhook: true },
      { title: "Paste your secret key into PayTrail", body: "PayTrail checks the key with Paystack before saving, and stores it encrypted.", form: true },
      { title: "Make a test payment", body: "Pay a small amount with one of Paystack's test cards. PayTrail waits for the payment and the webhook.", test: true, docs: "https://paystack.com/docs/payments/test-payments/", docsLabel: "Paystack test cards" },
      { title: "Go live", body: "Switch Paystack to Live mode. Paste your live secret key (sk_live_…) here, and put the same webhook URL in Live Webhook URL. Then run one small test." },
    ],
  },
  bachs: {
    name: "Bachs",
    color: "#101828",
    blurb: "Card, bank transfer and more, with fast settlement.",
    site: "https://bachs.io",
    keyLabel: "Secret key",
    keyPlaceholder: "sk_sandbox_… or sk_live_…",
    hookLabel: "Webhook signing secret",
    hookPlaceholder: "Paste the signing secret Bachs shows for your webhook",
    steps: [
      { title: "Open your Bachs account", body: "Sign in at bachs.io, or create an account. You can test straight away. To take real money, finish your business verification in Bachs first." },
      { title: "Copy your secret key", body: "In the Bachs dashboard, open the developer / API keys section and copy the secret key. Use the sandbox key (starts with sk_sandbox_) first. Keep it private." },
      { title: "Add your PayTrail webhook", body: "In the webhooks section, add a new endpoint and paste the URL below. Choose the collection.succeeded, collection.failed and checkout.expired events. Bachs then shows a signing secret: copy it.", webhook: true },
      { title: "Paste both into PayTrail", body: "PayTrail checks the key with Bachs before saving, and stores it encrypted.", form: true },
      { title: "Make a test payment", body: "Pay a small test amount to yourself. PayTrail waits until Bachs confirms the payment and the webhook arrives, so you know real payments will be recorded.", test: true },
      { title: "Go live", body: "When the test passes, repeat steps 2–4 with your live key (sk_live_…) and live webhook secret, then run one more small test." },
    ],
  },
  flutterwave: {
    name: "Flutterwave",
    color: "#F5A623",
    blurb: "Cards, bank transfer, USSD and mobile money across Africa.",
    site: "https://dashboard.flutterwave.com",
    keyLabel: "Secret key",
    keyPlaceholder: "FLWSECK_TEST-… or FLWSECK-…",
    hookLabel: "Secret hash",
    hookPlaceholder: "The secret hash you set in Flutterwave",
    steps: [
      { title: "Open your Flutterwave account", body: "Sign in at dashboard.flutterwave.com, or sign up. Switch to Test mode first. To take real money, complete Flutterwave's compliance checks." },
      { title: "Copy your secret key", body: "Go to Settings → API keys and copy the Secret key. In test mode it starts with FLWSECK_TEST-." },
      { title: "Add your PayTrail webhook", body: "Go to Settings → Webhooks. Paste the URL below, and set a Secret hash. You can use the one we generated. Turn on webhooks for successful and failed charges, then save.", webhook: true, hash: true },
      { title: "Paste both into PayTrail", body: "Paste the secret key and the same secret hash. PayTrail checks the key with Flutterwave before saving, and stores it encrypted.", form: true },
      { title: "Make a test payment", body: "Pay a small amount with one of Flutterwave's test cards (listed in their docs under Testing). PayTrail waits for the payment and the webhook.", test: true, docs: "https://developer.flutterwave.com/docs/integration-guides/testing-helpers", docsLabel: "Flutterwave test cards" },
      { title: "Go live", body: "Switch Flutterwave to Live mode. Repeat steps 2–4 with your live secret key (FLWSECK-…) and set the webhook again in live mode, then run one small test." },
    ],
  },
};

function statusOf(c) {
  if (!c) return { key: "none", label: "Not connected", tone: "neutral" };
  if (c.payment_confirmed_at && c.webhook_confirmed_at) return c.enabled ? { key: "connected", label: c.mode === "live" ? "Connected · Live" : "Connected · Test mode", tone: c.mode === "live" ? "success" : "info" } : { key: "off", label: "Turned off", tone: "neutral" };
  return { key: "partial", label: "Setup in progress", tone: "warn" };
}

// providers in the order that suits the business's currency
const AFRICAN = ["NGN", "GHS", "KES", "ZAR", "XOF"];
export function providerOrder(currency) {
  return AFRICAN.includes(currency) ? ["paystack", "flutterwave", "bachs", "stripe"] : ["stripe", "paystack", "flutterwave", "bachs"];
}

export function PaymentSetup({ connections, webhooks, testAmount, focus, testResult, currency }) {
  const order = providerOrder(currency);
  const toast = useToast();
  useEffect(() => {
    if (testResult === "succeeded") toast("Test payment received. Waiting for the webhook if it hasn't arrived yet.");
    if (testResult === "failed") toast("The test payment didn't complete. Try again.", "error");
  }, [testResult, toast]);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      {order.map((p, i) => <ProviderCard key={p} provider={p} guide={GUIDES[p]} connection={connections[p]} webhook={webhooks[p]} testAmount={testAmount}
        recommended={i === 0} defaultOpen={focus === p || (!focus && !Object.keys(connections).length && i === 0)} />)}
      <Card className="xl:col-span-2">
        <div className="grid gap-5 p-5 sm:grid-cols-3">
          <Explainer icon={ShieldCheck} title="Your money, your account" text="Payments land in your own Stripe, Paystack, Flutterwave or Bachs balance. PayTrail only reads the result so it can mark invoices paid." />
          <Explainer icon={KeyRound} title="Keys are encrypted" text="Secret keys are encrypted before they're stored and are never shown again, not even to your team." />
          <Explainer icon={RefreshCw} title="Nothing gets missed" text="If a customer closes the page early, PayTrail re-checks unconfirmed payments with the provider automatically." />
        </div>
      </Card>
    </div>
  );
}

function Explainer({ icon: Icon, title, text }) {
  return <div className="flex gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-brand" /><div><p className="text-sm font-semibold text-ink">{title}</p><p className="mt-0.5 text-[13px] text-ink-2">{text}</p></div></div>;
}

function ProviderCard({ provider, guide, connection, webhook, testAmount, defaultOpen, recommended }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(defaultOpen || statusOf(connection).key === "partial");
  const [key, setKey] = useState("");
  const [hook, setHook] = useState("");
  const [suggested] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? `pt_${crypto.randomUUID().replace(/-/g, "")}` : ""));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();
  const status = statusOf(connection);
  const { guarded, dialog: stepUpDialog } = useStepUp();

  const checks = [
    { label: "Keys saved and accepted", ok: Boolean(connection?.key_hint), hint: connection?.key_hint ? `…${connection.key_hint} · ${connection.mode === "live" ? "Live" : "Test"} key` : null },
    { label: "Test payment completed", ok: Boolean(connection?.payment_confirmed_at) },
    { label: "Webhook received by PayTrail", ok: Boolean(connection?.webhook_confirmed_at), hint: !connection?.webhook_confirmed_at && connection?.payment_confirmed_at ? "Check the webhook URL and secret in your provider dashboard" : null },
  ];

  function act(name, fn) {
    setError(null);
    setBusy(name);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (r?.error) { setError(r.error); return; }
      if (r?.url) { window.location.href = r.url; return; }
      if (r?.message) toast(r.message);
      if (name === "save") { setKey(""); setHook(""); }
      router.refresh();
    });
  }

  return (
    <Card>
      {stepUpDialog}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={cx("inline-flex size-10 items-center justify-center rounded-xl text-sm font-bold text-white", "")} style={{ background: guide.color }}>{guide.name[0]}</span>
          <div><h2 className="flex flex-wrap items-center gap-2 text-title-3 text-ink">{guide.name}{recommended && !connection && <Badge tone="brand" size="sm">Recommended for you</Badge>}</h2><p className="text-[13px] text-ink-3">{guide.blurb}</p></div>
        </div>
        <Badge tone={status.tone} icon={status.key === "connected" ? Check : undefined}>{status.label}</Badge>
      </div>

      <ul className="space-y-2.5 px-5 py-4">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2.5 text-sm">
            {c.ok ? <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-success text-white"><Check className="size-3" /></span> : <CircleDashed className="mt-0.5 size-5 text-ink-3" />}
            <span><span className={c.ok ? "text-ink" : "text-ink-2"}>{c.label}</span>{c.hint && <span className="block text-xs text-ink-3">{c.hint}</span>}</span>
          </li>
        ))}
      </ul>
      {status.key === "connected" && connection.mode === "test" && (
        <div className="px-5 pb-3"><Callout tone="info">Test mode works end to end, but customers only see the Pay button once you switch to <strong>live</strong> keys (step 6), so nobody can pay you with a test card.</Callout></div>
      )}
      {connection?.last_error && <div className="px-5 pb-3"><Callout tone="danger" icon={TriangleAlert}>{connection.last_error}</Callout></div>}

      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3.5">
        {status.key === "connected" || status.key === "off" ? (
          <>
            <Button size="sm" icon={busy === "toggle" ? Loader2 : Power} onClick={() => act("toggle", () => setEnabled(provider, !connection.enabled))}>{connection.enabled ? "Turn off" : "Turn on"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Hide setup" : "Update keys / go live"}</Button>
          </>
        ) : (
          <Button size="sm" variant={open ? "secondary" : "primary"} icon={PlugZap} onClick={() => setOpen(!open)}>{open ? "Hide guide" : connection ? "Continue setup" : `Connect ${guide.name}`}</Button>
        )}
        {connection && <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirmRemove(true)} className="ml-auto">Disconnect</Button>}
      </div>

      {open && (
        <ol className="border-t border-line bg-subtle px-5 py-5">
          {guide.steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
              {i < guide.steps.length - 1 && <span className="absolute top-8 bottom-0 left-[13px] w-px bg-line-strong" aria-hidden />}
              <span className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-brand-ink ring-1 ring-brand-line">{i + 1}</span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-semibold text-ink">{s.title}</p>
                <p className="mt-0.5 text-[13px] text-ink-2">{s.body}</p>
                {i === 0 && <Button size="sm" variant="link" href={guide.site} iconRight={ExternalLink} className="mt-1.5">Open {guide.name}</Button>}
                {s.docs && <Button size="sm" variant="link" href={s.docs} iconRight={ExternalLink} className="mt-1.5">{s.docsLabel}</Button>}
                {s.webhook && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2 rounded-md bg-surface p-1.5 pl-3 ring-1 ring-line">
                      <Webhook className="size-4 shrink-0 text-ink-3" />
                      <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{webhook}</code>
                      <CopyButton value={webhook} label="Copy URL" />
                    </div>
                    {s.hash && suggested && (
                      <div className="flex items-center gap-2 rounded-md bg-surface p-1.5 pl-3 ring-1 ring-line">
                        <Sparkles className="size-4 shrink-0 text-ink-3" />
                        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{suggested}</code>
                        <CopyButton value={suggested} label="Copy hash" />
                      </div>
                    )}
                  </div>
                )}
                {s.form && (
                  <div className="mt-3 flex flex-col gap-3 rounded-xl bg-surface p-4 ring-1 ring-line">
                    <Field label={guide.keyLabel} htmlFor={`${provider}-key`} hint={connection?.key_hint ? `Saved key ends in …${connection.key_hint}. Leave blank to keep it.` : undefined}>
                      <Input id={`${provider}-key`} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={guide.keyPlaceholder} />
                    </Field>
                    {!guide.noHook && (
                      <Field label={guide.hookLabel} htmlFor={`${provider}-hook`} hint={connection ? "Leave blank to keep the saved one." : undefined}>
                        <Input id={`${provider}-hook`} type="password" autoComplete="off" value={hook} onChange={(e) => setHook(e.target.value)} placeholder={guide.hookPlaceholder} />
                      </Field>
                    )}
                    {error && busy === null && <p role="alert" className="text-[13px] font-medium text-danger-ink">{error}</p>}
                    <Button variant="primary" icon={busy === "save" ? Loader2 : KeyRound} loading={busy === "save"} className="self-start"
                      onClick={() => act("save", () => guarded(() => saveConnection(provider, { secretKey: key, webhookSecret: hook })))}>Save & check key</Button>
                  </div>
                )}
                {s.test && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant={connection?.key_hint && !connection?.payment_confirmed_at ? "primary" : "secondary"} size="sm" icon={busy === "test" ? Loader2 : CreditCard} disabled={!connection?.key_hint}
                      onClick={() => act("test", () => runTestPayment(provider))}>Pay {testAmount} test payment</Button>
                    {connection?.last_test_reference && !(connection.payment_confirmed_at && connection.webhook_confirmed_at) && (
                      <Button size="sm" variant="ghost" icon={busy === "recheck" ? Loader2 : RefreshCw} onClick={() => act("recheck", () => recheckConnection(provider))}>Check again</Button>
                    )}
                    {connection?.mode === "live" && <p className="w-full text-xs text-warn-ink">Live key: this is a real {testAmount} charge to your own card. It goes into your balance, minus provider fees.</p>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <Modal open={confirmRemove} onClose={() => setConfirmRemove(false)} title={`Disconnect ${guide.name}?`} description="Its keys are deleted from PayTrail. Customers won't see this payment option."
        footer={<><Button onClick={() => setConfirmRemove(false)}>Cancel</Button><Button variant="destructive" icon={Trash2} onClick={() => { setConfirmRemove(false); act("remove", () => disconnect(provider)); }}>Disconnect</Button></>}>
        <p className="text-sm text-ink-2">Payments already recorded stay in PayTrail.</p>
      </Modal>
    </Card>
  );
}
