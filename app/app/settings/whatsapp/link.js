"use client";
import { useEffect, useState, useTransition } from "react";
import { MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyButton, Modal, useToast } from "@/components/ui-client";
import { createWhatsappLinkCode, removeWhatsappLink } from "./actions";

export function LinkWhatsapp({ disabled, bot, business }) {
  const [code, setCode] = useState(null);
  const [left, setLeft] = useState(0);
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => {
    if (!code) return;
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(code.expiresAt) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [code]);
  const make = () => start(async () => {
    const r = await createWhatsappLinkCode();
    if (r.error) toast.error(r.error); else setCode(r);
  });
  if (code && left > 0) {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-tray p-4">
        <p className="text-[13px] text-ink-2">From the WhatsApp you want to link, send this code to <strong className="font-medium text-ink">{bot}</strong>. It links you in <strong className="font-medium text-ink">{business}</strong>.</p>
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-surface px-4 py-2 font-mono text-[22px] font-semibold tracking-[0.2em] text-ink ring-1 ring-line">{code.code}</code>
          <CopyButton value={`LINK ${code.code}`} label="Copy" />
          <span className="text-xs text-ink-3 tabular">Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
        </div>
        <a href={code.open} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-md bg-success px-4 text-sm font-semibold text-white hover:opacity-90"><MessageCircle className="size-4" aria-hidden="true" />Open WhatsApp and send it</a>
        <p className="text-xs text-ink-3">On a computer? Copy the code and send it from WhatsApp on your phone. When the bot answers “Linked”, reload this page.</p>
      </div>
    );
  }
  return <div><Button variant="primary" icon={MessageCircle} loading={pending} disabled={disabled || pending} onClick={make}>{code ? "Get a new code" : "Link WhatsApp"}</Button></div>;
}

export function UnlinkWhatsapp({ id, phone }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const go = () => start(async () => {
    const r = await removeWhatsappLink(id);
    setOpen(false);
    if (r?.error) toast.error(r.error); else toast.success(r.message);
  });
  return (
    <>
      <Button size="sm" icon={Trash2} onClick={() => setOpen(true)}>Remove</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title={`Remove ${phone}?`} description="It stops working with Usetally straight away. Documents it made stay."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" icon={Trash2} loading={pending} onClick={go}>Remove</Button></>}>
        <p className="text-[13px] text-ink-2">To use it again, link it from this page.</p>
      </Modal>
    </>
  );
}
