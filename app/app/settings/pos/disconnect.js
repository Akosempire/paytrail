"use client";
import { useState, useTransition } from "react";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { disconnectPos } from "./actions";

export function DisconnectButton({ id, store }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const go = () => start(async () => {
    const r = await disconnectPos(id);
    setOpen(false);
    if (r?.error) toast.error(r.error); else toast.success(r.message);
  });
  return (
    <>
      <Button variant="danger" size="sm" icon={Unplug} onClick={() => setOpen(true)}>Disconnect</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Disconnect TrackOja?"
        description={`Sales from ${store} stop coming in, and you can't add its products to invoices. Sales already recorded stay.`}
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" icon={Unplug} loading={pending} onClick={go}>Disconnect</Button></>}>
        <p className="text-[13px] text-ink-2">To connect again, start from TrackOja: Settings → Connected apps → Connect Usetally.</p>
      </Modal>
    </>
  );
}
