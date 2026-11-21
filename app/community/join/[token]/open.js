"use client";
import { useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { markJoined } from "../../link-actions";

export function OpenGroup({ token, link, name }) {
  useEffect(() => {
    let gone = false;
    markJoined(token).finally(() => { if (!gone) window.location.href = link; });
    const t = setTimeout(() => { window.location.href = link; }, 2500); // go anyway if saving is slow
    return () => { gone = true; clearTimeout(t); };
  }, [token, link]);
  return (
    <div className="flex max-w-sm flex-col items-center gap-4">
      <h1 className="text-[22px] font-semibold text-ink">Opening WhatsApp, {name}…</h1>
      <p className="text-[15px] text-ink-2">If WhatsApp doesn't open, tap the button.</p>
      <a href={link} className="inline-flex h-12 items-center gap-2 rounded-lg bg-success px-5 text-[15px] font-semibold text-white hover:opacity-90"><MessageCircle className="size-5" aria-hidden="true" />Join the WhatsApp group</a>
    </div>
  );
}
