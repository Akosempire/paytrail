"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Mail, Megaphone, Plus, Search, Send, Users, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Textarea, cx } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { AnnouncementBanner } from "@/components/dashboard/announcement";
import { emailOwners, saveAnnouncement, sendTest } from "./actions";
import { DRAFT } from "@/lib/announcements-core";

// who gets it: everyone, or the businesses picked here (search by business, owner or email)
function AudiencePicker({ audience, ids, businesses, onChange }) {
  const [q, setQ] = useState("");
  const picked = new Set(ids);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = t ? businesses.filter((b) => `${b.name} ${b.owner} ${b.email}`.toLowerCase().includes(t)) : businesses;
    return rows.slice(0, 60);
  }, [q, businesses]);
  const toggle = (id) => onChange({ audience: "selected", ids: picked.has(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  const byId = new Map(businesses.map((b) => [b.id, b]));
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex self-start rounded-lg bg-subtle p-1 ring-1 ring-line" role="radiogroup" aria-label="Audience">
        {[["all", "Everyone"], ["selected", "Selected businesses"]].map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={audience === k} onClick={() => onChange({ audience: k, ids })}
            className={cx("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium", audience === k ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-2 hover:text-ink")}>
            {k === "all" ? <Megaphone className="size-3.5" /> : <Users className="size-3.5" />}{l}
          </button>
        ))}
      </div>
      {audience === "selected" && (
        <div className="flex flex-col gap-2.5">
          {ids.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ids.map((id) => (
                <span key={id} className="inline-flex h-7 items-center gap-1 rounded-md bg-brand-soft pr-1 pl-2.5 text-[12.5px] font-medium text-brand-ink">
                  {byId.get(id)?.name || "Business"}
                  <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${byId.get(id)?.name || "business"}`} className="inline-flex size-5 items-center justify-center rounded hover:bg-brand/10"><X className="size-3" /></button>
                </span>
              ))}
              <button type="button" onClick={() => onChange({ audience: "selected", ids: [] })} className="h-7 px-1.5 text-[12.5px] font-medium text-ink-3 hover:text-ink">Clear</button>
            </div>
          )}
          <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a business, owner or email" aria-label="Search businesses" />
          <ul className="max-h-64 overflow-y-auto rounded-xl ring-1 ring-line divide-y divide-line">
            {list.length ? list.map((b) => {
              const on = picked.has(b.id);
              return (
                <li key={b.id}>
                  <button type="button" onClick={() => toggle(b.id)} aria-pressed={on}
                    className={cx("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-hover", on && "bg-brand-soft/50")}>
                    <span className={cx("inline-flex size-[18px] shrink-0 items-center justify-center rounded ring-1", on ? "bg-brand text-white ring-brand" : "ring-line-strong")}>{on && <Check className="size-3" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{b.name}</span>
                      <span className="block truncate text-[12px] text-ink-3">{[b.owner, b.email].filter(Boolean).join(" · ") || "No owner email"}</span>
                    </span>
                    {b.plan && <span className="shrink-0 text-[11.5px] text-ink-3">{b.plan}</span>}
                  </button>
                </li>
              );
            }) : <li className="px-3 py-6 text-center text-[13px] text-ink-3">No business matches “{q}”.</li>}
          </ul>
          <p className="text-[12px] text-ink-3">{ids.length ? `Only these ${ids.length} see the banner, and only their owners get the email.` : "Pick one or more businesses."}{businesses.length > 60 && !q ? " Search to find others." : ""}</p>
        </div>
      )}
    </div>
  );
}

export function AnnouncementEditor({ initial, ownerCount, businesses = [] }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [id, setId] = useState(initial.id);
  const [f, setF] = useState({ title: initial.title, body: initial.body, link_href: initial.link_href, link_label: initial.link_label, audience: initial.audience || "all", business_ids: initial.business_ids || [] });
  const selected = f.audience === "selected";
  // owners who'll get the email (one per business picked, unless the same person owns several)
  const recipients = selected ? new Set(f.business_ids.map((id) => businesses.find((b) => b.id === id)?.email).filter(Boolean)).size : ownerCount;
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const run = (fn) => start(async () => { const r = await fn(); if (r?.error) return toast.error(r.error); if (r?.id) setId(r.id); toast.success(r.message); router.refresh(); });
  const emailed = Boolean(initial.emailed_at) && id === initial.id;
  return (
    <>
      <Card>
        <CardHeader title={id ? "Current announcement" : "New announcement"} icon={Megaphone}
          actions={<>{initial.active && id === initial.id && <Badge tone="success" solid>On dashboards</Badge>}{emailed && <Badge tone="brand">Emailed to {initial.email_sent || "…"} owners</Badge>}
            {id && <Button size="sm" icon={Plus} onClick={() => { setId(null); setF({ title: "", body: "", link_href: "", link_label: "", audience: "all", business_ids: [] }); }}>Start a new one</Button>}</>} />
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            {!emailed && (f.title !== DRAFT.title || f.body !== DRAFT.body) && (
              <button type="button" onClick={() => setF((x) => ({ ...x, title: DRAFT.title, body: DRAFT.body, link_href: DRAFT.link_href, link_label: DRAFT.link_label }))}
                className="self-start text-[12.5px] font-medium text-brand-ink hover:underline">Use suggested text (ChatGPT launch)</button>
            )}
            <Field label="Send to"><AudiencePicker audience={f.audience} ids={f.business_ids} businesses={businesses} onChange={({ audience, ids }) => setF((x) => ({ ...x, audience, business_ids: ids }))} /></Field>
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
            : <Button variant="primary" icon={Megaphone} onClick={() => run(() => saveAnnouncement(id, f, { publish: true }))} loading={pending}>{selected ? "Publish to selected" : "Publish on dashboards"}</Button>}
          <span className="mx-1 h-6 w-px bg-line max-sm:hidden" />
          <Button icon={Send} onClick={() => run(() => sendTest(f))} loading={pending}>Send me a test</Button>
          <Button icon={Mail} disabled={!id || emailed || (selected && !recipients)} onClick={() => setConfirm(true)}>{emailed ? "Already emailed" : selected ? `Email selected owners (${recipients})` : `Email all owners (${ownerCount})`}</Button>
          {!id && <span className="text-[12.5px] text-ink-3">Save or publish first to email it.</span>}
        </div>
      </Card>
      <Modal open={confirm} onClose={() => setConfirm(false)} size="sm" title={`Email ${recipients} business owner${recipients === 1 ? "" : "s"}?`}
        description="Each owner gets this once. It can't be unsent."
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" icon={Mail} loading={pending}
          onClick={() => { setConfirm(false); run(async () => { const s = await saveAnnouncement(id, f); if (s.error) return s; return emailOwners(id); }); }}>{selected ? "Send to them" : "Send to everyone"}</Button></>}>
        <p className="text-[13px] text-ink-2">Subject: <strong className="text-ink">{f.title}</strong>. {selected ? <>Goes to the owners of: <strong className="text-ink">{f.business_ids.map((x) => businesses.find((b) => b.id === x)?.name).filter(Boolean).slice(0, 6).join(", ")}{f.business_ids.length > 6 ? ` and ${f.business_ids.length - 6} more` : ""}</strong>. </> : null}Send yourself a test first if you haven't.</p>
      </Modal>
    </>
  );
}
