"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, RotateCw, Save, Settings2 } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { CopyButton, Switch, useToast } from "@/components/ui-client";
import { resendCommunityLink, saveCommunitySettings } from "./actions";

export function CommunitySettings({ saved, formUrl }) {
  const [f, setF] = useState(saved);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const save = () => start(async () => {
    const r = await saveCommunitySettings(f);
    if (r?.error) toast.error(r.error); else { toast.success(r.message); router.refresh(); }
  });
  return (
    <Card>
      <CardHeader icon={Settings2} title="Form settings" description="Changes apply to the form straight away." />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <Switch checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="Open for sign-ups" description="Off: the form says sign-ups are closed. Reminders also pause." />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-tray px-3 py-2 font-mono text-[13px] text-ink ring-1 ring-line">{formUrl}</code>
          <CopyButton value={formUrl} label="Copy form link" />
        </div>
        <Field label="WhatsApp group link" htmlFor="cm-link" hint="WhatsApp → the group → Invite via link → Copy. If you reset it in WhatsApp, paste the new one here."><Input id="cm-link" icon={Link2} placeholder="https://chat.whatsapp.com/…" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batches" htmlFor="cm-batches" hint="One per line. People pick from these. Leave empty to let them type it."><Textarea id="cm-batches" rows={4} placeholder={"Batch 1\nBatch 2"} value={f.batches} onChange={(e) => setF({ ...f, batches: e.target.value })} /></Field>
          <Field label="Community rules" htmlFor="cm-rules" optional hint="Shown above the Yes/No question, and in the email."><Textarea id="cm-rules" rows={4} placeholder="Be respectful. No spam or unsolicited adverts. Keep posts about business." value={f.rules} onChange={(e) => setF({ ...f, rules: e.target.value })} /></Field>
        </div>
        <div><Button variant="primary" icon={Save} loading={pending} onClick={save}>Save</Button></div>
      </div>
    </Card>
  );
}

export function ResendButton({ id }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return <Button size="sm" icon={RotateCw} loading={pending} onClick={() => start(async () => { const r = await resendCommunityLink(id); r?.error ? toast.error(r.error) : toast.success(r.message); })}>Resend</Button>;
}
