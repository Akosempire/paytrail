"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Mail, Megaphone, Plus, Send } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { AnnouncementBanner } from "@/components/dashboard/announcement";
import { emailOwners, saveAnnouncement, sendTest } from "./actions";
import { DRAFT } from "@/lib/announcements-core";

export function AnnouncementEditor({ initial, ownerCount }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [id, setId] = useState(initial.id);
  const [f, setF] = useState({ title: initial.title, body: initial.body, link_href: initial.link_href, link_label: initial.link_label });
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const run = (fn) => start(async () => { const r = await fn(); if (r?.error) return toast.error(r.error); if (r?.id) setId(r.id); toast.success(r.message); router.refresh(); });
  const emailed = Boolean(initial.emailed_at) && id === initial.id;
  return (
    <>
      <Card>
        <CardHeader title={id ? "Current announcement" : "New announcement"} icon={Megaphone}
          actions={<>{initial.active && id === initial.id && <Badge tone="success" solid>On dashboards</Badge>}{emailed && <Badge tone="brand">Emailed to {initial.email_sent || "…"} owners</Badge>}
            {id && <Button size="sm" icon={Plus} onClick={() => { setId(null); setF({ title: "", body: "", link_href: "", link_label: "" }); }}>Start a new one</Button>}</>} />
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            {!emailed && (f.title !== DRAFT.title || f.body !== DRAFT.body) && (
              <button type="button" onClick={() => setF({ title: DRAFT.title, body: DRAFT.body, link_href: DRAFT.link_href, link_label: DRAFT.link_label })}
                className="self-start text-[12.5px] font-medium text-brand-ink hover:underline">Use suggested text (ChatGPT launch)</button>
            )}
            <Field label="Title" htmlFor="an-title"><Input id="an-title" value={f.title} onChange={set("title")} /></Field>
            <Field label="Message" htmlFor="an-body" hint="Blank lines start new paragraphs. Lines starting with • become numbered points in the email (write “• Title: details”). The dashboard shows only the title."><Textarea id="an-body" rows={9} value={f.body} onChange={set("body")} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Button link" htmlFor="an-href" optional hint="A Usetally page like /app/settings/ai, or https://…"><Input id="an-href" value={f.link_href} onChange={set("link_href")} /></Field>
              <Field label="Button label" htmlFor="an-label" optional><Input id="an-label" value={f.link_label} onChange={set("link_label")} /></Field>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3"><Eye className="size-3.5" />How it looks on the dashboard</p>
            <AnnouncementBanner a={{ id: "preview", ...f }} preview />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
          <Button onClick={() => run(() => saveAnnouncement(id, f))} loading={pending}>Save</Button>
          {initial.active && id === initial.id
            ? <Button onClick={() => run(() => saveAnnouncement(id, f, { publish: false }))} loading={pending}>Take down</Button>
            : <Button variant="primary" icon={Megaphone} onClick={() => run(() => saveAnnouncement(id, f, { publish: true }))} loading={pending}>Publish on dashboards</Button>}
          <span className="mx-1 h-6 w-px bg-line max-sm:hidden" />
          <Button icon={Send} onClick={() => run(() => sendTest(f))} loading={pending}>Send me a test</Button>
          <Button icon={Mail} disabled={!id || emailed} onClick={() => setConfirm(true)}>{emailed ? "Already emailed" : `Email all owners (${ownerCount})`}</Button>
          {!id && <span className="text-[12.5px] text-ink-3">Save or publish first to email it.</span>}
        </div>
      </Card>
      <Modal open={confirm} onClose={() => setConfirm(false)} size="sm" title={`Email ${ownerCount} business owners?`}
        description="Each owner gets this once. It can't be unsent."
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" icon={Mail} loading={pending}
          onClick={() => { setConfirm(false); run(async () => { const s = await saveAnnouncement(id, f); if (s.error) return s; return emailOwners(id); }); }}>Send to everyone</Button></>}>
        <p className="text-[13px] text-ink-2">Subject: <strong className="text-ink">{f.title}</strong>. Send yourself a test first if you haven't.</p>
      </Modal>
    </>
  );
}
