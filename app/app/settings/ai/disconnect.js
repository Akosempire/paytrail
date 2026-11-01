"use client";
import { useState, useTransition } from "react";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { disconnectAssistant } from "./actions";

export function DisconnectAssistant({ id, app }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const go = () => start(async () => {
    const r = await disconnectAssistant(id);
    setOpen(false);
    if (r?.error) toast.error(r.error); else toast.success(r.message);
  });
  return (
    <>
      <Button variant="secondary" size="sm" icon={Unplug} onClick={() => setOpen(true)}>Disconnect</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title={`Disconnect ${app}?`}
        description={`${app} stops working with this business straight away. Documents it made stay.`}
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" icon={Unplug} loading={pending} onClick={go}>Disconnect</Button></>}>
        <p className="text-[13px] text-ink-2">To use it again, connect it from {app} the same way as before.</p>
      </Modal>
    </>
  );
}
