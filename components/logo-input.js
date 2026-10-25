"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui-client";

// Logo picker that takes almost any image, at any size or resolution
// (PNG, JPG, WebP, SVG, GIF, and HEIC where the browser can read it), and
// prepares it in the browser before upload:
//   - trims empty transparent edges, so small and padded logos show at a
//     useful size on documents
//   - scales to at most 1200 px on the long side (SVGs are drawn crisp at that size)
//   - saves as PNG (keeps transparency) or JPEG for photos without
//     transparency, both of which PDFs can embed
// The prepared file replaces the chosen one in the form, so the server
// action receives it as `name` like before.
const MAX_SIDE = 1200;
const MAX_INPUT = 25 * 1024 * 1024;

async function decode(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    let w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) { w = MAX_SIDE; h = MAX_SIDE / 2; } // SVG without width/height
    return { img, w, h };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// bounding box of pixels that aren't fully transparent
function opaqueBox(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let top = h, left = w, right = -1, bottom = -1, anyClear = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 8) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
      else anyClear = true;
    }
  }
  if (right < 0) return null; // fully transparent
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1, anyClear };
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function prepareLogo(file) {
  if (file.size > MAX_INPUT) throw new Error("That image is over 25 MB. Choose a smaller file.");
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  const { img, w, h } = await decode(file).catch(() => { throw new Error("We couldn't read that image. Try PNG, JPG, WebP or SVG."); });

  // SVGs are vector: treat them as MAX_SIDE wide/tall so they come out sharp
  const vw = isSvg ? w * (MAX_SIDE / Math.max(w, h)) : w, vh = isSvg ? h * (MAX_SIDE / Math.max(w, h)) : h;

  // find the non-transparent area on a small copy (fast, light on memory)…
  const probe = Math.min(1, 800 / Math.max(vw, vh));
  const pw = Math.max(1, Math.round(vw * probe)), ph = Math.max(1, Math.round(vh * probe));
  const small = document.createElement("canvas");
  small.width = pw; small.height = ph;
  const sctx0 = small.getContext("2d", { willReadFrequently: true });
  sctx0.drawImage(img, 0, 0, pw, ph);
  const box = opaqueBox(sctx0, pw, ph);
  if (!box) throw new Error("That image is empty (fully transparent).");

  // …then crop from the full-resolution original, with a little breathing room
  const k = 1 / probe, pad = Math.max(box.w, box.h) * 0.02;
  const sx = Math.max(0, (box.x - pad - 1) * k), sy = Math.max(0, (box.y - pad - 1) * k);
  const sw = Math.min(vw - sx, (box.w + pad * 2 + 2) * k), sh = Math.min(vh - sy, (box.h + pad * 2 + 2) * k);
  const f = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * f)); out.height = Math.max(1, Math.round(sh * f));
  const octx = out.getContext("2d");
  octx.imageSmoothingQuality = "high";
  // source rect is in the image's own pixels (for SVG, scale back from the vector size)
  const r = isSvg ? w / vw : 1;
  octx.drawImage(img, sx * r, sy * r, sw * r, sh * r, 0, 0, out.width, out.height);

  // PNG keeps transparency; a photo with no transparency is smaller as JPEG.
  // Busy images are stepped down until they're under ~1.5 MB.
  let canvas = out, blob = null;
  for (let i = 0; i < 5; i++) {
    blob = await toBlob(canvas, "image/png");
    if (blob && !box.anyClear && blob.size > 600 * 1024) blob = (await toBlob(canvas, "image/jpeg", 0.88)) || blob;
    if (!blob || blob.size <= 1.5 * 1024 * 1024) break;
    const smaller = document.createElement("canvas");
    smaller.width = Math.max(1, Math.round(canvas.width * 0.75)); smaller.height = Math.max(1, Math.round(canvas.height * 0.75));
    const sctx = smaller.getContext("2d"); sctx.imageSmoothingQuality = "high";
    sctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    canvas = smaller;
  }
  if (!blob) throw new Error("We couldn't prepare that image. Try another file.");
  const type = blob.type || "image/png";
  return { file: new File([blob], `logo.${type === "image/jpeg" ? "jpg" : "png"}`, { type }), width: canvas.width, height: canvas.height };
}

export function LogoInput({ name = "logo", initial = null, onChange, children }) {
  const toast = useToast();
  const input = useRef(null);
  const [preview, setPreview] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    setBusy(true);
    try {
      const { file } = await prepareLogo(chosen);
      const dt = new DataTransfer();
      dt.items.add(file);
      input.current.files = dt.files; // the form now submits the prepared logo
      const url = URL.createObjectURL(file);
      setPreview(url);
      onChange?.(url);
    } catch (err) {
      input.current.value = "";
      toast.error({ title: "Logo not added", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return children({
    preview, busy,
    input: <input ref={input} type="file" name={name} accept="image/*,.svg,.heic,.heif" className="sr-only" onChange={pick} />,
    icon: busy ? <Loader2 className="size-5 animate-spin text-ink-3" /> : <ImagePlus className="size-5 text-ink-3" />,
  });
}
