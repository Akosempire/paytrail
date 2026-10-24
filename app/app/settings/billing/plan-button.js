"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { choosePlan } from "./actions";

export function PlanButton({ planId, label, primary }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [manual, setManual] = useState(null);
  return (
    <>
      <Button className="mt-5" block variant={primary ? "primary" : "secondary"} icon={pending ? Loader2 : undefined} loading={pending}
        onClick={() => start(async () => {
          const r = await choosePlan(planId);
          if (r.error) return toast(r.error, "error");
          if (r.url) { window.location.href = r.url; return; }
          if (r.manual) return setManual(r.email || "support");
          toast(r.message); router.refresh();
        })}>{label}</Button>
      <Modal open={Boolean(manual)} onClose={() => setManual(null)} title="Subscribe by transfer" footer={<Button onClick={() => setManual(null)}>Close</Button>}>
        <p className="text-sm text-ink-2">Online card payment for subscriptions isn't switched on yet. Email <strong className="text-ink">{manual}</strong> with your business name and the plan you want. Your plan is activated as soon as payment is confirmed.</p>
      </Modal>
    </>
  );
}
