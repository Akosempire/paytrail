"use client";
// Saves a document as a picture (PNG), for sending on WhatsApp and the like.
// Drawn in the browser from the same layout as the preview, at twice the
// size so it stays sharp. On phones it opens the share sheet straight away.
export const IMAGE_EVENT = "usetally:doc-image";

export function requestDocImage() { window.dispatchEvent(new Event(IMAGE_EVENT)); }

export async function exportDocImage(node, name) {
  const { toBlob } = await import("html-to-image");
  const opts = { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff", imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" };
  // the first pass loads fonts and images; the second is the one that's kept
  await toBlob(node, opts).catch(() => null);
  const blob = await toBlob(node, opts);
  if (!blob) throw new Error("Couldn't make the image.");
  const file = new File([blob], `${name}.png`, { type: "image/png" });
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return "shared"; } catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
