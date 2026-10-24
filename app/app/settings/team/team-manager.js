"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Eye, Loader2, MailPlus, Trash2, X } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, Field, Input, Select } from "@/components/ui";
import { CopyButton, Modal, useToast } from "@/components/ui-client";
import { ROLES } from "@/lib/permissions";
import { invite, removeMember, revokeInvite, updateMember } from "./actions";

export function TeamManager({ members, invites, me, myRole, manage }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ email: "", role: "finance", canViewCosts: true });
  const [link, setLink] = useState(null);
  const [editing, setEditing] = useState(null);
  const run = (fn, after) => start(async () => { const r = await fn(); if (r?.error) toast(r.error, "error"); else { if (r?.message) toast(r.message); after?.(r); } router.refresh(); });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader title="Members" description={`${members.length} ${members.length === 1 ? "person" : "people"}`} />
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const seesCosts = m.role === "owner" || m.role === "manager" || m.can_view_costs;
            const editable = manage && m.user_id !== me && m.role !== "owner" && !(m.role === "manager" && myRole !== "owner");
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Avatar name={m.full_name || m.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{m.full_name || m.email}{m.user_id === me && <span className="text-ink-3"> (you)</span>}</p>
                  <p className="truncate text-xs text-ink-3">{m.email}</p>
                </div>
                <span title={seesCosts ? "Can see hidden costs" : "Hidden costs are hidden from them"}>{seesCosts ? <Eye className="size-4 text-violet" /> : <EyeOff className="size-4 text-ink-3" />}</span>
                <Badge tone={m.role === "owner" ? "brand" : m.role === "junior_finance" ? "neutral" : "info"} size="sm">{ROLES[m.role].label}</Badge>
                {editable && <Button size="sm" variant="ghost" onClick={() => setEditing({ ...m })}>Change</Button>}
              </li>
            );
          })}
        </ul>
        {invites.length > 0 && (
          <>
            <div className="border-y border-line bg-subtle px-5 py-2 text-xs font-medium text-ink-3">Pending invitations</div>
            <ul className="divide-y divide-line">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                  <MailPlus className="size-4 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{i.email}</span>
                  <Badge size="sm">{ROLES[i.role].label}</Badge>
                  {manage && <Button size="sm" variant="ghost" icon={X} aria-label="Cancel invitation" onClick={() => run(() => revokeInvite(i.id))} className="!px-2" />}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {manage && (
        <Card className="self-start">
          <CardHeader title="Invite someone" icon={MailPlus} />
          <div className="flex flex-col gap-4 p-5">
            <Field label="Email" htmlFor="inv-email"><Input id="inv-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" /></Field>
            <Field label="Role" htmlFor="inv-role">
              <Select id="inv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, canViewCosts: e.target.value !== "junior_finance" })}>
                {myRole === "owner" && <option value="manager">Manager</option>}
                <option value="finance">Finance officer</option>
                <option value="junior_finance">Junior finance</option>
              </Select>
            </Field>
            <p className="-mt-2 text-xs text-ink-3">{ROLES[form.role].summary}</p>
            {form.role !== "manager" && <Checkbox label="Can see hidden costs & profit" description="Data, electricity and other costs you add to quotes." checked={form.canViewCosts} onChange={(e) => setForm({ ...form, canViewCosts: e.target.checked })} />}
            <Button variant="primary" icon={pending ? Loader2 : MailPlus} loading={pending} onClick={() => run(() => invite(form), (r) => { setLink(r.link); setForm({ ...form, email: "" }); })}>Send invitation</Button>
            {link && (
              <div className="rounded-lg bg-tray p-3">
                <p className="text-xs text-ink-2">Invite link (valid for 7 days):</p>
                <p className="mt-1 truncate font-mono text-[11.5px] text-ink">{link}</p>
                <CopyButton value={link} label="Copy invite link" className="mt-2" />
              </div>
            )}
          </div>
        </Card>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? `Change access for ${editing.full_name || editing.email}` : ""}
        footer={editing && <>
          <Button variant="danger" icon={Trash2} className="mr-auto" onClick={() => run(() => removeMember(editing.user_id), () => setEditing(null))}>Remove</Button>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => run(() => updateMember(editing.user_id, { role: editing.role, canViewCosts: editing.can_view_costs }), () => setEditing(null))}>Save</Button>
        </>}>
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Role" htmlFor="edit-role">
              <Select id="edit-role" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                {myRole === "owner" && <option value="manager">Manager</option>}
                <option value="finance">Finance officer</option>
                <option value="junior_finance">Junior finance</option>
              </Select>
            </Field>
            {editing.role !== "manager" && <Checkbox label="Can see hidden costs & profit" checked={editing.can_view_costs} onChange={(e) => setEditing({ ...editing, can_view_costs: e.target.checked })} />}
          </div>
        )}
      </Modal>
    </div>
  );
}
