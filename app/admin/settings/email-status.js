"use client";
import { useState, useTransition } from "react";
import { Mail, Send } from "lucide-react";
import { Alert, Button, Card, CardHeader } from "@/components/ui";
import { sendTestEmail } from "../actions";

// Shows whether sign-up codes, resets and all other emails go through Brevo,
// and lets the platform owner send a test to themselves.
export function EmailStatus({ status }) {
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader icon={Mail} title="Email delivery" description="Sign-up codes, password resets, security codes, invoices and receipts are sent through Brevo." />
      <div className="flex flex-col gap-3 px-5 pb-5">
        {status.ready
          ? <Alert intent="success" title="Brevo is set up" live={false}>Sending as <strong>{status.from}</strong> through {status.host}:{status.port}. Send a test to make sure Brevo accepts it.</Alert>
          : <Alert intent="error" title="Not connected: Supabase is sending sign-up emails instead" live={false}>
              Missing in Vercel → Settings → Environment Variables: <strong>{status.missing.join(", ")}</strong>. Add them, then redeploy.
            </Alert>}
        {result?.message && <Alert intent="success" size="sm" title="Test sent">{result.message}</Alert>}
        {result?.error && <Alert intent="error" size="sm" title="Test failed">{result.error}{result.hints?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4">{result.hints.map((h) => <li key={h}>{h}</li>)}</ul>}</Alert>}
        {!result?.error && status.ready && status.hints?.length > 0 && <Alert intent="warning" size="sm" title="Check these settings" live={false}><ul className="list-disc space-y-1 pl-4">{status.hints.map((h) => <li key={h}>{h}</li>)}</ul></Alert>}
        <div><Button icon={Send} loading={pending} disabled={pending} onClick={() => start(async () => setResult(await sendTestEmail()))}>Send test email to me</Button></div>
      </div>
    </Card>
  );
}
