"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui-client";

// One-off messages passed in the address after a redirect (?password=updated,
// ?denied=1 …) shown as toasts, then removed from the address so a reload
// or a shared link doesn't show them again.
const MESSAGES = {
  "password=updated": ["success", { title: "Password updated", message: "You're signed in with your new password." }],
  "denied=1": ["warning", { title: "No access", message: "Your role doesn't have access to that page." }],
  "account=deleted": ["success", { title: "Account deleted", message: "Your data has been removed. Thanks for using Usetally." }],
  "switched=1": ["success", "Switched business."],
  "signed_out=1": ["info", "You've signed out."],
  "oauth=cancelled": ["info", "Google sign-in was cancelled."],
  "oauth=failed": ["error", { title: "Google sign-in didn't work", message: "Try again, or use your email and password." }],
  "link=expired": ["warning", { title: "Link expired", message: "That link has expired or was already used. Ask for a new one." }],
};

export function UrlToasts() {
  const params = useSearchParams();
  const pathname = usePathname();
  const toast = useToast();
  useEffect(() => {
    const hits = Object.keys(MESSAGES).filter((k) => { const [key, value] = k.split("="); return params.get(key) === value; });
    if (!hits.length) return;
    for (const k of hits) { const [intent, msg] = MESSAGES[k]; toast[intent](msg); }
    const next = new URLSearchParams(params);
    for (const k of hits) next.delete(k.split("=")[0]);
    const q = next.toString();
    window.history.replaceState(window.history.state, "", `${pathname}${q ? `?${q}` : ""}${window.location.hash}`);
  }, [params, pathname, toast]);
  return null;
}
