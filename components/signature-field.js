"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type, Upload } from "lucide-react";
import { Button, Checkbox, Field, Input, cx } from "@/components/ui";
import { LogoInput, prepareLogo } from "@/components/logo-input";

// Authorised signature for quotes, invoices and receipts: draw it, type it,
// or upload a photo/scan (white paper is removed). Whatever is chosen becomes
// a trimmed transparent PNG in a hidden file input called "signature", so the
// settings form saves it like the logo.
const INK = "#1d2939";

function setFile(input, file) {
  const dt = new DataTransfer();
  if (file) dt.items.add(file);
  input.files = dt.files;
}

// canvas -> trimmed PNG File (reuses the logo pipeline: trim, resize)
async function canvasFile(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const { file } = await prepareLogo(new File([blob], "signature.png", { type: "image/png" }));
  return new File([file], "signature.png", { type: file.type });
}

function DrawPad({ onFile }) {
  const canvas = useRef(null);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = canvas.current;
    const fit = () => {
      const r = c.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = INK;
      setEmpty(true);
    };
    fit();
  }, []);
  const point = (e) => { const r = canvas.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; };
  const down = (e) => { e.preventDefault(); canvas.current.setPointerCapture(e.pointerId); last.current = point(e); dot(last.current); };
  const dot = (pt) => { const ctx = canvas.current.getContext("2d"); ctx.beginPath(); ctx.fillStyle = INK; ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2); ctx.fill(); };
  const move = (e) => {
    if (!last.current) return;
    const ctx = canvas.current.getContext("2d");
    const pt = point(e), prev = last.current;
    const speed = Math.hypot(pt.x - prev.x, pt.y - prev.y);
    ctx.lineWidth = Math.max(1.4, Math.min(3.2, 3.4 - speed * 0.06)) * (e.pointerType === "pen" ? 0.6 + pt.p : 1);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pt.x) / 2, (prev.y + pt.y) / 2);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    last.current = pt;
    setEmpty(false);
  };
  const up = async () => {
    if (!last.current) return;
    last.current = null;
    try { onFile(await canvasFile(canvas.current)); } catch (e) { console.warn("signature.draw", e?.message); }
  };
  const clear = () => {
    const c = canvas.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onFile(null);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas ref={canvas} aria-label="Signature pad. Sign with your finger, stylus or mouse." role="img"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
          className="block h-40 w-full touch-none cursor-crosshair rounded-xl bg-white ring-1 ring-line-strong" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-[#98a2b3]" />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-3">Sign here</span>}
      </div>
      <Button size="sm" icon={Eraser} className="self-start" onClick={clear}>Clear</Button>
    </div>
  );
}

function TypePad({ defaultName, onFile }) {
  const [name, setName] = useState(defaultName || "");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const f = new FontFace("UsetallySignature", "url(/fonts/signature-script.woff2)");
    f.load().then((loaded) => { document.fonts.add(loaded); setReady(true); }).catch(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready) return;
    const value = name.trim();
    if (!value) { onFile(null); return; }
    const t = setTimeout(async () => {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      const size = 120;
      ctx.font = `${size}px UsetallySignature, cursive`;
      const w = Math.ceil(ctx.measureText(value).width) + size;
      c.width = Math.min(4000, w); c.height = Math.round(size * 1.8);
      ctx.font = `${size}px UsetallySignature, cursive`;
      ctx.fillStyle = INK; ctx.textBaseline = "middle";
      ctx.fillText(value, size / 2, c.height / 2);
      try { onFile(await canvasFile(c)); } catch { onFile(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [name, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your name" aria-label="Name to write as a signature" maxLength={60} />
      <div className="flex h-28 items-center justify-center overflow-hidden rounded-xl bg-white px-4 ring-1 ring-line-strong">
        <span className="truncate text-[44px] leading-none text-[#1d2939]" style={{ fontFamily: "UsetallySignature, cursive" }}>{name || <span className="text-[20px] text-ink-3" style={{ fontFamily: "inherit" }}>Your signature</span>}</span>
      </div>
    </div>
  );
}

export function SignatureField({ business, signatureUrl }) {
  const hidden = useRef(null);
  const [mode, setMode] = useState(null); // null = keep current
  const [preview, setPreview] = useState(signatureUrl);
  const [removed, setRemoved] = useState(false);
  const take = (file) => {
    setFile(hidden.current, file);
    setPreview(file ? URL.createObjectURL(file) : mode ? null : signatureUrl);
  };
  const MODES = [["draw", "Draw", PenLine], ["type", "Type", Type], ["upload", "Upload", Upload]];
  return (
    <div className="flex flex-col gap-4">
      <input ref={hidden} type="file" name="signature" className="hidden" tabIndex={-1} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-48 items-center justify-center rounded-xl bg-white p-2 ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && !removed ? <img src={preview} alt="Your signature" className="max-h-full max-w-full object-contain" /> : <span className="text-[13px] text-ink-3">No signature yet</span>}
        </div>
        {signatureUrl && <Checkbox name="remove_signature" label="Remove signature" checked={removed} onChange={(e) => setRemoved(e.target.checked)} />}
      </div>
      {!removed && (
        <>
          <div role="tablist" aria-label="How to add your signature" className="grid grid-cols-3 gap-1 rounded-xl bg-tray p-1 sm:inline-grid sm:w-auto">
            {MODES.map(([key, label, Icon]) => (
              <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => { setMode(key); take(null); }}
                className={cx("flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium", mode === key ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-ink-2 hover:text-ink")}>
                <Icon className="size-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          {mode === "draw" && <DrawPad onFile={take} />}
          {mode === "type" && <TypePad defaultName={business.signatory_name} onFile={take} />}
          {mode === "upload" && (
            <LogoInput name={null} label="Signature" whiteToTransparent onChange={(_url, file) => take(file)}>
              {({ busy, input, icon }) => (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong bg-subtle p-3 pr-5 hover:border-brand">
                  <span className="inline-flex size-12 items-center justify-center rounded-lg bg-surface ring-1 ring-line">{icon}</span>
                  <span className="text-sm"><span className="font-medium text-brand-ink">{busy ? "Preparing…" : "Upload a photo or scan"}</span><span className="block text-[13px] text-ink-3">Sign on white paper. We remove the background.</span></span>
                  {input}
                </label>
              )}
            </LogoInput>
          )}
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Signed by" htmlFor="signatory_name" optional><Input id="signatory_name" name="signatory_name" defaultValue={business.signatory_name || ""} placeholder="Tolu Adeyemi" maxLength={120} /></Field>
        <Field label="Title" htmlFor="signatory_title" optional><Input id="signatory_title" name="signatory_title" defaultValue={business.signatory_title || ""} placeholder="Managing Director" maxLength={120} /></Field>
      </div>
    </div>
  );
}
