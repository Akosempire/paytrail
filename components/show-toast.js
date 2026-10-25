"use client";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui-client";

// Shows one toast when a page opens (e.g. after a redirect: "Invoice sent",
// "Payment received"), then removes the listed query params so a reload or a
// shared link doesn't repeat it. Server pages decide the message; this only
// displays it.
export function ShowToast({ intent = "success", title, message, clear = [], duration }) {
  const toast = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast[intent]({ title, message }, duration ? { duration } : undefined);
    if (clear.length) {
      const url = new URL(window.location.href);
      clear.forEach((k) => url.searchParams.delete(k));
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
