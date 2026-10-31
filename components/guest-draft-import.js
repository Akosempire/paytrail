"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui-client";
import { saveDocument } from "@/app/app/documents/actions";
import { CURRENCIES } from "@/lib/money";
import { GUEST_KEY, readGuestDraft } from "@/lib/guest-draft";

// An invoice started on /try (before they had an account) is saved to this
// business as a draft the first time they reach the app, then removed from
// the browser. They land on it to check and send.
export function GuestDraftImport({ canCreate }) {
  const router = useRouter();
  const toast = useToast();
  const once = useRef(false);
  useEffect(() => {
    if (once.current || !canCreate) return;
    once.current = true;
    let raw = null;
    try { raw = localStorage.getItem(GUEST_KEY); } catch { return; }
    if (!raw) return;
    const draft = readGuestDraft(raw, Date.now(), CURRENCIES);
    // claim it first so a second tab can't import it too
    try { localStorage.removeItem(GUEST_KEY); localStorage.removeItem("usetally:try:builder:invoice"); } catch { /* storage blocked */ }
    if (!draft) return;
    (async () => {
      const res = await saveDocument(null, draft.input, "draft").catch(() => ({ error: "Couldn't reach Usetally." }));
      if (res?.error || !res?.id) {
        try { localStorage.setItem(GUEST_KEY, raw); } catch { /* storage blocked */ }
        toast.error(`We couldn't bring in the invoice you started: ${res?.error || "please try again."}`);
        return;
      }
      toast.success("The invoice you started is saved here as a draft. Check it, then send.");
      router.push(`/app/documents/${res.id}`);
    })();
  }, [canCreate, router, toast]);
  return null;
}
