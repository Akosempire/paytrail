"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { stopReminders } from "../../link-actions";

export function StopButton({ token }) {
  const [done, setDone] = useState(null);
  const [pending, start] = useTransition();
  if (done) return <p className="text-[15px] font-medium text-ink">{done.ok ? "Done. No more reminders." : "That link isn't valid any more."}</p>;
  return <Button variant="primary" loading={pending} onClick={() => start(async () => setDone(await stopReminders(token)))}>Stop reminders</Button>;
}
