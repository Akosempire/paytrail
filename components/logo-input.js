"use client";
import { useCallback, useRef, useState } from "react";
import { Crop, ImagePlus, Loader2, Maximize2, Scan } from "lucide-react";
import { Button } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";

// Image picker for logos (and uploaded signatures). Takes almost any image at
// any size or resolution (PNG, JPG, WebP, SVG, GIF, HEIC where the browser can
// read it), then:
//   1. guesses a tight crop (empty transparent edges removed)
//   2. lets the person adjust the crop: drag the frame, drag its edges and corners
//   3. prepares the result in the browser: optional white-background removal
//      (for photos of signatures), trimmed, at most 1200 px on the long side,
//      saved as PNG (keeps transparency) or JPEG, both of which PDFs can embed
// The prepared file replaces the chosen one in the form, so the server action
// receives it under `name` like any file input.
const MAX_SIDE = 1200;
const MAX_INPUT = 25 * 1024 * 1024;

async function decode(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error("We couldn't read that image. Try PNG, JPG, WebP or SVG."); }
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) { w = MAX_SIDE; h = MAX_SIDE / 2; } // SVG without width/height
  // SVGs are vector: work at MAX_SIDE so they come out sharp
  const k = isSvg ? MAX_SIDE / Math.max(w, h) : 1;
  return { img, url, isSvg, w: w * k, h: h * k, sourceScale: 1 / k };
}

// bounding box of pixels that aren't (nearly) transparent
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
  if (right < 0) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1, anyClear };
}

// white/very light paper becomes transparent, ink stays (photos of signatures)
function dropWhite(ctx, w, h) {
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const keep = Math.max(0, Math.min(1, (225 - lum) / 70)); // ≥225 gone, ≤155 solid
    d[i + 3] = Math.round(d[i + 3] * keep);
  }
  ctx.putImageData(im, 0, 0);
}

// a first guess at the crop, as fractions of the image (empty edges removed)
function autoCrop({ img, w, h }, { whiteToTransparent } = {}) {
  const probe = Math.min(1, 800 / Math.max(w, h));
  const pw = Math.max(1, Math.round(w * probe)), ph = Math.max(1, Math.round(h * probe));
  const c = document.createElement("canvas");
  c.width = pw; c.height = ph;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, pw, ph);
  if (whiteToTransparent) dropWhite(ctx, pw, ph);
  const box = opaqueBox(ctx, pw, ph);
  if (!box) return { x: 0, y: 0, w: 1, h: 1 };
  const pad = Math.max(box.w, box.h) * 0.03;
  const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
  return { x: x / pw, y: y / ph, w: Math.min(pw - x, box.w + pad * 2) / pw, h: Math.min(ph - y, box.h + pad * 2) / ph };
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// crop (fractions of the image) -> prepared PNG/JPEG File
async function render(decoded, crop, { whiteToTransparent = false, name = "logo" } = {}) {
  const { img, w, h, sourceScale } = decoded;
  const sx = crop.x * w, sy = crop.y * h, sw = Math.max(1, crop.w * w), sh = Math.max(1, crop.h * h);
  // draw the crop at up to 2× the final size, so trimming keeps detail
  const f = Math.min(1, (MAX_SIDE * 2) / Math.max(sw, sh));
  const work = document.createElement("canvas");
  work.width = Math.max(1, Math.round(sw * f)); work.height = Math.max(1, Math.round(sh * f));
  const wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.imageSmoothingQuality = "high";
  wctx.drawImage(img, sx * sourceScale, sy * sourceScale, sw * sourceScale, sh * sourceScale, 0, 0, work.width, work.height);
  if (whiteToTransparent) dropWhite(wctx, work.width, work.height);

  // trim leftover transparent margins (found on the working copy)…
  const box = opaqueBox(wctx, work.width, work.height);
  if (!box) throw new Error("That area is empty. Move the frame over your image.");
  const pad = Math.round(Math.max(box.w, box.h) * 0.02);
  const tx = Math.max(0, box.x - pad), ty = Math.max(0, box.y - pad);
  const tw = Math.min(work.width - tx, box.w + pad * 2), th = Math.min(work.height - ty, box.h + pad * 2);
  // …then draw that area again from the full-resolution original, so a big
  // frame around a small mark still comes out sharp
  const fx = sx + tx / f, fy = sy + ty / f, fw = tw / f, fh = th / f;
  const g = Math.min(1, MAX_SIDE / Math.max(fw, fh));
  let canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(fw * g)); canvas.height = Math.max(1, Math.round(fh * g));
  const octx = canvas.getContext("2d", { willReadFrequently: whiteToTransparent });
  octx.imageSmoothingQuality = "high";
  octx.drawImage(img, fx * sourceScale, fy * sourceScale, fw * sourceScale, fh * sourceScale, 0, 0, canvas.width, canvas.height);
  if (whiteToTransparent) dropWhite(octx, canvas.width, canvas.height);

  // PNG keeps transparency; a photo with no transparency is smaller as JPEG.
  // Busy images are stepped down until they're under ~1.5 MB.
  let blob = null;
  for (let i = 0; i < 5; i++) {
    blob = await toBlob(canvas, "image/png");
    if (blob && !box.anyClear && !whiteToTransparent && blob.size > 600 * 1024) blob = (await toBlob(canvas, "image/jpeg", 0.88)) || blob;
    if (!blob || blob.size <= 1.5 * 1024 * 1024) break;
    const smaller = document.createElement("canvas");
    smaller.width = Math.max(1, Math.round(canvas.width * 0.75)); smaller.height = Math.max(1, Math.round(canvas.height * 0.75));
    const sctx = smaller.getContext("2d"); sctx.imageSmoothingQuality = "high";
    sctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    canvas = smaller;
  }
  if (!blob) throw new Error("We couldn't prepare that image. Try another file.");
  const type = blob.type || "image/png";
  return new File([blob], `${name}.${type === "image/jpeg" ? "jpg" : "png"}`, { type });
}

// kept for callers that don't need the crop window
export async function prepareLogo(file, opts = {}) {
  if (file.size > MAX_INPUT) throw new Error("That image is over 25 MB. Choose a smaller file.");
  const d = await decode(file);
  try { return { file: await render(d, opts.crop || autoCrop(d, opts), opts) }; }
  finally { URL.revokeObjectURL(d.url); }
}

// ------------------------------------------------------------ crop window
const MIN = 0.04; // smallest crop, as a fraction of the image
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function CropWindow({ open, decoded, initial, title, onCancel, onDone, busy }) {
  const [crop, setCrop] = useState(initial);
  const stage = useRef(null);
  const drag = useRef(null);

  const start = (mode) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = stage.current.getBoundingClientRect();
    drag.current = { mode, x: e.clientX, y: e.clientY, r, from: crop };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / d.r.width, dy = (e.clientY - d.y) / d.r.height;
    let { x, y, w, h } = d.from;
    if (d.mode === "move") { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - h); }
    else {
      if (d.mode.includes("w")) { const nx = clamp(x + dx, 0, x + w - MIN); w += x - nx; x = nx; }
      if (d.mode.includes("e")) w = clamp(w + dx, MIN, 1 - x);
      if (d.mode.includes("n")) { const ny = clamp(y + dy, 0, y + h - MIN); h += y - ny; y = ny; }
      if (d.mode.includes("s")) h = clamp(h + dy, MIN, 1 - y);
    }
    setCrop({ x, y, w, h });
  }, []);
  const end = () => { drag.current = null; };

  // keyboard: arrows move the frame, shift+arrows resize it
  const onKey = (e) => {
    const step = e.altKey ? 0.002 : 0.01;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!map[e.key]) return;
    e.preventDefault();
    const [dx, dy] = map[e.key];
    setCrop((c) => e.shiftKey
      ? { ...c, w: clamp(c.w + dx, MIN, 1 - c.x), h: clamp(c.h + dy, MIN, 1 - c.y) }
      : { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) });
  };

  if (!decoded) return null;
  const ratio = decoded.w / decoded.h;
  const pct = (v) => `${v * 100}%`;
  const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const pos = { n: ["50%", "0%"], s: ["50%", "100%"], e: ["100%", "50%"], w: ["0%", "50%"], nw: ["0%", "0%"], ne: ["100%", "0%"], se: ["100%", "100%"], sw: ["0%", "100%"] };
  const cursor = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" };

  return (
    <Modal open={open} onClose={onCancel} title={title} size="lg"
      description="Drag the frame or its edges to choose the part to use. Empty edges are trimmed for you."
      footer={<>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" icon={busy ? Loader2 : Crop} loading={busy} onClick={() => onDone(crop)}>Use this</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="flex justify-center rounded-xl bg-[repeating-conic-gradient(#e9ebef_0%_25%,#f8f9fb_0%_50%)] bg-[length:16px_16px] p-3">
          <div ref={stage} className="relative touch-none select-none" onPointerMove={move} onPointerUp={end} onPointerCancel={end}
            style={{ width: `min(100%, ${Math.round(320 * ratio)}px)`, aspectRatio: `${ratio}`, maxHeight: 320 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={decoded.url} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-fill" />
            {/* shade outside the frame */}
            <div className="pointer-events-none absolute inset-0" style={{ background: "rgb(16 24 40 / .45)", clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${pct(crop.x)} ${pct(crop.y)},${pct(crop.x)} ${pct(crop.y + crop.h)},${pct(crop.x + crop.w)} ${pct(crop.y + crop.h)},${pct(crop.x + crop.w)} ${pct(crop.y)},${pct(crop.x)} ${pct(crop.y)})` }} />
            <div role="slider" tabIndex={0} aria-label="Crop frame. Arrow keys move it, Shift plus arrows resize it."
              aria-valuetext={`${Math.round(crop.w * 100)}% wide, ${Math.round(crop.h * 100)}% tall`}
              onKeyDown={onKey} onPointerDown={start("move")}
              className="absolute cursor-move outline-none ring-2 ring-white ring-offset-0 shadow-[0_0_0_1px_rgb(16_24_40/.5)] focus-visible:ring-[#5a9dff]"
              style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}>
              {HANDLES.map((hd) => (
                <span key={hd} onPointerDown={start(hd)}
                  className="absolute size-5 -translate-x-1/2 -translate-y-1/2 sm:size-4"
                  style={{ left: pos[hd][0], top: pos[hd][1], cursor: cursor[hd] }}>
                  <span className="absolute inset-[3px] rounded-[3px] border border-[#101828]/40 bg-white shadow" />
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={Scan} onClick={() => setCrop(initial)}>Auto-trim</Button>
          <Button size="sm" icon={Maximize2} onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}>Whole image</Button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ picker
export function LogoInput({ name = "logo", initial = null, onChange, children, whiteToTransparent = false, label = "Logo" }) {
  const toast = useToast();
  const input = useRef(null);
  const [preview, setPreview] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { decoded, initial }
  const kept = useRef(null); // the last prepared file, restored if a new crop is cancelled

  async function pick(e) {
    const chosen = e.target.files?.[0];
    restore(); // until the crop is confirmed, the form keeps the previous image
    if (!chosen) return;
    if (chosen.size > MAX_INPUT) return toast.error({ title: `${label} not added`, message: "That image is over 25 MB. Choose a smaller file." });
    setBusy(true);
    try {
      const decoded = await decode(chosen);
      setEditing({ decoded, initial: autoCrop(decoded, { whiteToTransparent }) });
    } catch (err) {
      toast.error({ title: `${label} not added`, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  function restore() {
    const dt = new DataTransfer();
    if (kept.current) dt.items.add(kept.current);
    input.current.files = dt.files;
  }
  const close = () => { if (editing) URL.revokeObjectURL(editing.decoded.url); setEditing(null); };

  async function done(crop) {
    setBusy(true);
    try {
      const file = await render(editing.decoded, crop, { whiteToTransparent, name });
      kept.current = file;
      restore(); // the form now submits the prepared image
      const url = URL.createObjectURL(file);
      setPreview(url);
      onChange?.(url, file);
      close();
    } catch (err) {
      toast.error({ title: `${label} not added`, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {children({
        preview, busy: busy && !editing,
        // name={null}: the caller takes the file from onChange and submits it itself
        input: <input ref={input} type="file" name={name || undefined} accept="image/*,.svg,.heic,.heif" className="sr-only" onChange={pick} />,
        icon: busy && !editing ? <Loader2 className="size-5 animate-spin text-ink-3" /> : <ImagePlus className="size-5 text-ink-3" />,
      })}
      {editing && <CropWindow key={editing.decoded.url} open decoded={editing.decoded} initial={editing.initial} busy={busy}
        title={`Crop your ${label.toLowerCase()}`} onCancel={close} onDone={done} />}
    </>
  );
}
