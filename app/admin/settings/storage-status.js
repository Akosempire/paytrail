"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Eye, EyeOff, HardDrive, Save } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { useStepUp } from "@/components/step-up";
import { moveImagesToR2, saveStorageSettings } from "../actions";

// Where business files are kept: Cloudflare R2 once connected here (or in
// Vercel), Supabase Storage before that. Paste the R2 details once; they're
// checked with a test upload before they're saved.
export function StorageStatus({ status, saved, waiting }) {
  const router = useRouter();
  const toast = useToast();
  const { guarded, dialog } = useStepUp("platform");
  const [form, setForm] = useState({ accountId: saved?.accountId || "", bucket: saved?.bucket || "usetally-files", accessKeyId: "", secretAccessKey: "" });
  const [show, setShow] = useState(false);
  const [saving, startSave] = useTransition();
  const [moving, startMove] = useTransition();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = () => startSave(async () => {
    const r = await guarded(() => saveStorageSettings(form));
    if (r.error) return toast.error({ title: "Not connected", message: r.error }, { duration: 15000 });
    toast.success({ title: "Cloudflare connected", message: r.message });
    setForm((f) => ({ ...f, accessKeyId: "", secretAccessKey: "" }));
    router.refresh();
  });
  const move = () => startMove(async () => {
    const r = await moveImagesToR2();
    if (r.error) return toast.error({ title: "Nothing moved", message: r.error }, { duration: 12000 });
    if (r.failed) toast.warning({ title: `Moved ${r.moved}, ${r.failed} not moved`, message: "Those stay in Supabase and still show. Try again later." });
    else toast.success({ title: r.moved ? `Moved ${r.moved} image${r.moved === 1 ? "" : "s"}` : "Nothing left to move", message: "Logos and signatures are now served from Cloudflare." });
    router.refresh();
  });

  const connected = status.ready;
  return (
    <Card>
      {dialog}
      <CardHeader icon={HardDrive} title="File storage" description="Logos and signatures (up to 1 MB) and files attached to documents (up to 4 MB)."
        actions={connected ? <Badge tone="success" size="sm">Cloudflare R2{status.source === "vercel" ? " · Vercel" : ""}</Badge> : <Badge tone="warn" size="sm">Supabase Storage</Badge>} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <p className="text-[13px] leading-relaxed text-ink-2">
          {connected ? status.note : <>Not connected: {status.note}</>}
          {saved?.keyHint && <span className="text-ink-3"> · Saved key ends {saved.keyHint}</span>}
        </p>

        <ol className="list-decimal space-y-1 rounded-xl bg-tray px-5 py-3.5 pl-9 text-[13px] leading-relaxed text-ink-2">
          <li>In Cloudflare: <strong>R2</strong> → copy the <strong>Account ID</strong> (right side of the overview page).</li>
          <li><strong>Manage API tokens → Create API token</strong> → permission <strong>Object Read &amp; Write</strong>, applied to your bucket.</li>
          <li>Copy the <strong>Access Key ID</strong> and <strong>Secret Access Key</strong> (not the token value). The secret is shown only once.</li>
        </ol>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Account ID" htmlFor="r2-account">
            <Input id="r2-account" value={form.accountId} onChange={set("accountId")} placeholder="32 letters and numbers" autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Bucket name" htmlFor="r2-bucket">
            <Input id="r2-bucket" value={form.bucket} onChange={set("bucket")} placeholder="usetally-files" autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Access Key ID" htmlFor="r2-key-id" hint={saved?.keyHint ? "Leave empty to keep the saved key" : undefined}>
            <Input id="r2-key-id" value={form.accessKeyId} onChange={set("accessKeyId")} placeholder={saved?.keyHint ? `•••• ${saved.keyHint}` : "32 letters and numbers"} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Secret Access Key" htmlFor="r2-secret" hint={saved?.keyHint ? "Leave empty to keep the saved secret" : undefined}>
            <div className="relative">
              <Input id="r2-secret" type={show ? "text" : "password"} value={form.secretAccessKey} onChange={set("secretAccessKey")} placeholder={saved?.keyHint ? "••••••••" : "64 letters and numbers"} autoComplete="new-password" spellCheck={false} className="pr-11" />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide the secret" : "Show the secret"}
                className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-ink-3 hover:text-ink">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={Save} loading={saving} onClick={save}>{saved ? "Save and check" : "Connect Cloudflare"}</Button>
          {connected && (
            <>
              <Button icon={CloudUpload} loading={moving} onClick={move}>Move existing images to Cloudflare</Button>
              <span className="text-[13px] text-ink-3">{waiting == null ? "" : waiting ? `${waiting} still in Supabase` : "None left in Supabase"}</span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
