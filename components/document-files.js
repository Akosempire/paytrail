"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { Badge, Button, Card, CardHeader, cx } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { ACCEPT, MAX_FILES, MAX_FILE_BYTES, fileTypeOf, formatSize } from "@/lib/file-types";
import { deleteDocumentFile, setFileShared, uploadDocumentFile } from "@/app/app/documents/file-actions";

const iconFor = (mime) => mime.startsWith("image/") ? ImageIcon : /sheet|excel|csv/.test(mime) ? FileSpreadsheet : FileText;

// Big phone photos (proof of payment, signed delivery notes) are shrunk in
// the browser so they fit under 4 MB and upload quickly on mobile data.
async function shrinkPhoto(file) {
  const type = fileTypeOf(file.name);
  if (!type?.image || file.size <= MAX_FILE_BYTES) return file;
  try {
    const img = await createImageBitmap(file);
    for (const edge of [2400, 1800, 1400]) {
      const s = Math.min(1, edge / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
      if (blob && blob.size <= MAX_FILE_BYTES) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  } catch {}
  return file;
}

export function DocumentFiles({ documentId, files, canAdd, canShare, userId, ready, problem }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef(null);
  const [uploading, setUploading] = useState([]); // names in flight
  const [busy, setBusy] = useState(null); // file id being changed
  const [confirm, setConfirm] = useState(null);
  const [drag, setDrag] = useState(false);
  const [, start] = useTransition();
  const full = files.length + uploading.length >= MAX_FILES;

  async function add(list) {
    const picked = [...list].slice(0, Math.max(0, MAX_FILES - files.length - uploading.length));
    if (list.length > picked.length) toast.warning({ title: "Some files skipped", message: `A document can have up to ${MAX_FILES} files.` });
    for (const original of picked) {
      if (!fileTypeOf(original.name)) { toast.error({ title: `${original.name} not added`, message: "Attach a PDF, photo, Word, Excel, CSV or text file." }); continue; }
      const file = await shrinkPhoto(original);
      if (file.size > MAX_FILE_BYTES) { toast.error({ title: `${original.name} not added`, message: `It's ${formatSize(file.size)}. Files can be up to 4 MB.` }); continue; }
      setUploading((u) => [...u, file.name]);
      const form = new FormData(); form.set("file", file);
      const r = await uploadDocumentFile(documentId, form);
      setUploading((u) => u.filter((n, i) => i !== u.indexOf(file.name)));
      if (r.error) toast.error({ title: `${original.name} not added`, message: r.error }, { duration: 10000 });
      else toast.success({ title: "File attached", message: r.message });
    }
    start(() => router.refresh());
  }
  const pick = (e) => { const l = e.target.files; if (l?.length) add(l); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (canAdd && ready && e.dataTransfer.files?.length) add(e.dataTransfer.files); };

  const share = (f) => { setBusy(f.id); start(async () => {
    const r = await setFileShared(f.id, !f.shared);
    setBusy(null);
    if (r.error) toast.error({ title: "Not changed", message: r.error }); else { toast.success({ title: f.shared ? "Hidden from customer" : "Shared with customer", message: r.message }); router.refresh(); }
  }); };
  const remove = (f) => { setConfirm(null); setBusy(f.id); start(async () => {
    const r = await deleteDocumentFile(f.id);
    setBusy(null);
    if (r.error) toast.error({ title: "Not removed", message: r.error }); else { toast.success({ title: "File removed", message: r.message }); router.refresh(); }
  }); };

  const addButton = canAdd && ready && (
    <Button size="sm" icon={Plus} disabled={full} onClick={() => input.current?.click()} aria-label="Attach a file">Attach</Button>
  );

  return (
    <Card onDragOver={(e) => { if (canAdd && ready) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
      className={cx(drag && "ring-2 ring-brand")}>
      <CardHeader title="Files" icon={Paperclip} description={files.length ? `${files.length} attached` : "Contracts, delivery notes, proof of payment"} actions={addButton} />
      <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={pick} />
      <div className="px-5 pb-5">
        {!ready ? (
          <p className="rounded-lg bg-tray px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">{problem}</p>
        ) : files.length === 0 && uploading.length === 0 ? (
          canAdd ? (
            <button type="button" onClick={() => input.current?.click()}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-ink-2 hover:border-brand hover:bg-hover">
              <Upload className="size-5 text-ink-3" aria-hidden="true" />
              <span className="font-medium text-ink">Attach a file</span>
              <span className="text-ink-3">PDF, photo, Word or Excel · up to 4 MB</span>
            </button>
          ) : <p className="text-[13px] text-ink-3">No files yet.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {files.map((f) => {
              const Icon = iconFor(f.content_type);
              const mine = f.uploaded_by === userId;
              return (
                <li key={f.id} className={cx("group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-hover", busy === f.id && "opacity-60")}>
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-tray text-ink-2"><Icon className="size-4" aria-hidden="true" /></span>
                  <a href={`/app/documents/${documentId}/files/${f.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink hover:underline">{f.name}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-3">
                      {formatSize(f.size_bytes)} · {f.uploaded_by_name || "Team"} · {f.when}
                      {f.shared && <Badge tone="success" size="sm" className="!px-1.5">Customer can see</Badge>}
                    </span>
                  </a>
                  {canShare && (
                    <button type="button" onClick={() => share(f)} disabled={busy === f.id}
                      aria-label={f.shared ? `Hide ${f.name} from the customer` : `Show ${f.name} to the customer`} title={f.shared ? "Hide from customer" : "Show to customer"}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface hover:text-ink">
                      {f.shared ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  )}
                  {(canShare || mine) && (
                    <button type="button" onClick={() => setConfirm(f)} disabled={busy === f.id} aria-label={`Remove ${f.name}`} title="Remove"
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface hover:text-danger-ink">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
            {uploading.map((n, i) => (
              <li key={`u${i}`} className="flex items-center gap-2.5 px-2 py-2" aria-live="polite">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-tray"><Loader2 className="size-4 animate-spin text-ink-3" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-ink">{n}</span><span className="text-xs text-ink-3">Uploading…</span></span>
              </li>
            ))}
          </ul>
        )}
        {ready && canShare && files.length > 0 && <p className="mt-2 text-xs text-ink-3">Files are private to your team until you tap <Eye className="inline size-3.5 align-[-2px]" aria-label="the eye" /> to show one on the customer's link.</p>}
      </div>
      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Remove this file?" description={confirm ? `${confirm.name} will be deleted for everyone${confirm.shared ? ", including your customer" : ""}.` : ""}
        footer={<><Button onClick={() => setConfirm(null)}>Keep it</Button><Button variant="destructive" icon={Trash2} onClick={() => remove(confirm)}>Remove</Button></>} />
    </Card>
  );
}
