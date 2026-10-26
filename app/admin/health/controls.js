"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, RefreshCw, Save, Send } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { CopyButton, useToast } from "@/components/ui-client";
import { runHealthChecks, saveAlertWebhook, sendTestAlert } from "../actions";

const show = (toast, r) => r.error ? toast.error(r.error) : r.warning ? toast.warning(r.message) : toast.success(r.message);

export function RunChecksButton() {
  const router = useRouter(); const toast = useToast();
  const [pending, start] = useTransition();
  return <Button variant="primary" icon={RefreshCw} loading={pending} onClick={() => start(async () => { show(toast, await runHealthChecks()); router.refresh(); })}>Run checks now</Button>;
}

export function AlertSettings({ webhook, emails, monitorUrl, cronReady }) {
  const router = useRouter(); const toast = useToast();
  const [url, setUrl] = useState("");
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  return (
    <Card>
      <CardHeader icon={BellRing} title="Instant alerts" description="You're told the moment a real user hits a failure, and when a check breaks or recovers."
        actions={webhook ? <Badge tone="success" size="sm">{webhook}</Badge> : <Badge tone="warn" size="sm">Email only</Badge>} />
      <div className="flex flex-col gap-5 p-5">
        <div className="text-[13.5px] text-ink-2">
          <p><strong className="text-ink">By email</strong> to {emails?.length ? emails.join(", ") : "every platform admin"} (change it in <a href="/admin/settings" className="font-medium text-brand-ink underline">Settings → Alerts</a>).</p>
          <p className="mt-1">Email can't warn you when email itself is broken, so also add <strong className="text-ink">Telegram, Slack or Discord</strong>:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
            <li><strong>Telegram:</strong> message @BotFather → /newbot, copy the token; message your bot once; then use <code className="font-mono text-ink">https://api.telegram.org/bot&lt;TOKEN&gt;/sendMessage?chat_id=&lt;YOUR_ID&gt;</code> (get your ID from @userinfobot).</li>
            <li><strong>Slack:</strong> Apps → Incoming Webhooks → add to a channel → copy the URL.</li>
            <li><strong>Discord:</strong> channel settings → Integrations → Webhooks → New → Copy URL.</li>
          </ul>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Webhook address" htmlFor="alert-url" className="flex-1" hint={webhook ? `Saved (${webhook}). Paste a new one to replace it, or save empty to remove.` : "Stored encrypted. A test message is sent when you save."}>
            <Input id="alert-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/… or https://api.telegram.org/bot…" autoComplete="off" spellCheck={false} />
          </Field>
          <div className="flex gap-2">
            <Button variant="primary" icon={Save} loading={saving} onClick={() => startSave(async () => { const r = await saveAlertWebhook(url); show(toast, r); if (!r.error) { setUrl(""); router.refresh(); } })}>Save</Button>
            <Button icon={Send} loading={testing} onClick={() => startTest(async () => show(toast, await sendTestAlert()))}>Send test alert</Button>
          </div>
        </div>
        <div className="rounded-xl bg-tray p-4 text-[13px] text-ink-2">
          <p className="font-medium text-ink">Check every 5 minutes (free)</p>
          <p className="mt-1">Vercel's free plan only runs scheduled jobs once a day. Create a free job at <a href="https://cron-job.org" target="_blank" rel="noopener" className="font-medium text-brand-ink underline">cron-job.org</a> (or UptimeRobot) that opens this address every 5 minutes:</p>
          <div className="mt-2 flex flex-wrap items-center gap-2"><code className="rounded-md bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-ink ring-1 ring-line">{monitorUrl}</code><CopyButton value={monitorUrl} label="Copy" /></div>
          <p className="mt-2">Add the header <code className="font-mono text-ink">Authorization: Bearer &lt;your CRON_SECRET&gt;</code>, or add <code className="font-mono text-ink">?key=&lt;your CRON_SECRET&gt;</code> to the address. It answers 503 when something is broken.</p>
          {!cronReady && <p className="mt-2 font-medium text-warn-ink">CRON_SECRET isn't set in Vercel yet: add it (any long random text) under Settings → Environment Variables, then redeploy.</p>}
        </div>
      </div>
    </Card>
  );
}
