"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";

// One reliable "Download PDF" for every page. A plain link gives no sign of
// life while the PDF is being made (a few seconds on a cold server), and
// installed home-screen apps, iPhones especially, often ignore a download link.
// So: fetch the file with a spinner, save it with a real file name, use the
// share sheet ("Save to Files") where a download can't happen, and fall back
// to opening the PDF if anything goes wrong. Still a normal link for
// right-click, "open in new tab" and no-JavaScript.
export function filenameFrom(disposition, fallback = "document.pdf") {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition || "");
  const name = m ? decodeURIComponent(m[1]) : fallback;
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

const standalone = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
const appleTouch = () => /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export async function downloadPdf(href, fallbackName) {
  const res = await fetch(href, { credentials: "same-origin" });
  if (!res.ok || !(res.headers.get("content-type") || "").includes("pdf")) throw new Error(res.status === 401 || res.redirected ? "signin" : `status ${res.status}`);
  const blob = await res.blob();
  const name = filenameFrom(res.headers.get("content-disposition"), fallbackName);
  const file = typeof File === "function" ? new File([blob], name, { type: "application/pdf" }) : null;
  // installed app on iPhone/iPad: downloads go nowhere, the share sheet works
  if (file && standalone() && appleTouch() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return "shared"; } catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name, rel: "noopener" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}

export function PdfLink({ href, filename, className, children, onDone, label = "Preparing…", ...rest }) {
  const [busy, setBusy] = useState(false);
  const click = async (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let "open in new tab" work
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await downloadPdf(href, filename);
      if (r !== "cancelled") onDone?.();
    } catch {
      // couldn't fetch it here: open it the ordinary way so it's never stuck
      window.location.assign(href);
    } finally {
      setBusy(false);
    }
  };
  return (
    <a href={href} onClick={click} aria-busy={busy || undefined} className={className} {...rest}>
      {busy ? <><Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />{label}</> : children}
    </a>
  );
}
