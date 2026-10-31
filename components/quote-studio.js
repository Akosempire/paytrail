"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Expand, EyeOff, PencilLine, Eye, Minimize2 } from "lucide-react";
import { Card, cx } from "@/components/ui";
import { DocView } from "@/components/doc-view";
import { DocPreview } from "@/components/doc-preview";
import { announceBuilder } from "@/components/app-shell";
import { DEFAULT_SHARE as DEFAULT_PCT, HANDLE, MIN_INPUTS, MIN_PREVIEW, SNAPS, clampShare, previewWidth, snapShare as snapPct } from "@/lib/split-core";

// The quote builder: three columns.
//   1 · Costs & profit  (internal; a slim profit strip under 1280px)
//   2 · Quote           (customer, items, totals, folded details)
//   3 · Preview         (the live quotation; width set by a drag handle)
// Phones and tablets: tabs Costs · Quote · Preview over the sticky footer.
// The pieces come from components/document-editor.js, which owns all the state.

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
const clickable = "[&_.pt-parties]:cursor-pointer [&_.pt-items]:cursor-pointer [&_.pt-lines]:cursor-pointer [&_.pt-totals]:cursor-pointer [&_.pt-blocks]:cursor-pointer [&_.pt-meta]:cursor-pointer";


export function FoldRow({ id, title, value, open, onToggle, children }) {
  return (
    <Card>
      <button type="button" id={`fold-${id}`} aria-expanded={open} aria-controls={`fold-${id}-body`} onClick={() => onToggle(!open)}
        className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left hover:bg-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">
        <span className="shrink-0 text-[15px] font-semibold text-ink">{title}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[13px] text-ink-3">{open ? "" : value}</span>
        <ChevronDown className={cx("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div id={`fold-${id}-body`} className="border-t border-line">{children}</div>}
    </Card>
  );
}

// label: "Quote" or "Invoice" (the middle column and its phone tab); both builders use this layout
export function QuoteStudio({ userId, costsVisible, profit, pct: margin, revenue, money, previewModel, onPreviewClick, view, setView, costs, quote, footer, label = "Quote" }) {
  const area = useRef(null);
  const [areaW, setAreaW] = useState(0);
  const [lg, setLg] = useState(false);
  const [xl, setXl] = useState(false);
  const [share, setShare] = useState(DEFAULT_PCT);
  const [dragging, setDragging] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false); // the slim strip, opened
  const [full, setFull] = useState(false);
  const key = `usetally:quote-preview:${userId || "me"}`;

  // the sidebar shrinks to icons while the builder is open
  useEffect(() => { announceBuilder(true); return () => announceBuilder(false); }, []);

  useEffect(() => {
    try { const v = Number(localStorage.getItem(key)); if (v >= 0.15 && v <= 0.8) setShare(v); } catch { /* storage blocked */ }
  }, [key]);
  const remember = useCallback((v) => { try { localStorage.setItem(key, String(v)); } catch { /* storage blocked */ } }, [key]);

  useIso(() => {
    const el = area.current;
    if (!el) return;
    const mqL = window.matchMedia("(min-width: 1024px)"), mqX = window.matchMedia("(min-width: 1280px)");
    const measure = () => { setAreaW(el.clientWidth); setLg(mqL.matches); setXl(mqX.matches); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    mqL.addEventListener("change", measure); mqX.addEventListener("change", measure);
    return () => { ro.disconnect(); mqL.removeEventListener("change", measure); mqX.removeEventListener("change", measure); };
  }, []);

  const costsW = !costsVisible ? 0 : xl ? 300 + 20 : 48 + 16;
  const pw = previewWidth(share, areaW || 1200, costsW);

  // drag the handle; snaps to 33 / 40 / 50 % when let go nearby
  function onPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    if (e.detail >= 2) return reset(); // the second click of a double-click
    const rect = area.current.getBoundingClientRect();
    const startX = e.clientX;
    // measured from where the handle was grabbed, so a click doesn't nudge it
    const grab = rect.right - e.clientX - pw;
    let moved = false;
    const at = (x) => clampShare(((rect.right - x - grab) / rect.width));
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      if (!moved) { moved = true; setDragging(true); }
      setShare(at(ev.clientX));
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      if (!moved) return;
      const next = snapPct(at(ev.clientX));
      setShare(next);
      remember(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function onKey(e) {
    let next = null;
    if (e.key === "ArrowLeft") next = share + 0.02;
    else if (e.key === "ArrowRight") next = share - 0.02;
    else if (e.key === "Home") next = SNAPS[SNAPS.length - 1];
    else if (e.key === "End") next = SNAPS[0];
    if (next == null) return;
    e.preventDefault();
    next = clampShare((Math.round(next * 100) / 100));
    setShare(next);
    remember(next);
  }
  const reset = () => { setShare(DEFAULT_PCT); remember(DEFAULT_PCT); };

  const tabs = [...(costsVisible ? [["costs", "Costs", EyeOff]] : []), ["edit", label, PencilLine], ["preview", "Preview", Eye]];
  const costsCard = <Card className="ring-violet/30">{costs}</Card>;

  return (
    <div className={cx("pb-40 sm:pb-28", dragging && "cursor-col-resize select-none")}>
      <div className="sticky top-16 z-10 -mx-4 -mt-2 mb-4 bg-canvas/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden" role="tablist" aria-label="Builder view">
        <div className={cx("grid gap-0.5 rounded-lg bg-tray p-1", tabs.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {tabs.map(([v, l, Icon]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cx("inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]", view === v ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3")}>
              <Icon className="size-4" />{l}
            </button>
          ))}
        </div>
      </div>

      <div ref={area} className="relative lg:flex lg:items-start">
        {/* 1 · costs: full column from 1280px, a profit strip below that, a tab on phones */}
        {costsVisible && (
          <>
            {lg && xl && <aside className="sticky top-24 mr-5 max-h-[calc(100dvh-8rem)] w-[300px] shrink-0 overflow-y-auto p-px pb-2 scroll-thin" aria-label="Costs and profit">{costsCard}</aside>}
            {lg && !xl && (
              <div className="sticky top-24 z-30 mr-4 shrink-0">
                <button type="button" onClick={() => setCostsOpen(!costsOpen)} aria-expanded={costsOpen} aria-label={`Costs and profit: ${money(profit)} profit. ${costsOpen ? "Hide" : "Show"} details`}
                  className="flex w-12 flex-col items-center gap-3 rounded-xl bg-violet-soft/60 py-4 text-violet-ink ring-1 ring-violet/30 hover:bg-violet-soft">
                  <EyeOff className="size-4" aria-hidden />
                  <span className="text-[12.5px] font-semibold tabular [writing-mode:vertical-rl] rotate-180">
                    <span className={profit < 0 ? "text-danger-ink" : "text-success-ink"}>{money(profit)}</span> profit{revenue > 0 ? ` · ${margin.toFixed(0)}%` : ""}
                  </span>
                </button>
                {costsOpen && (
                  <div className="absolute top-0 left-14 z-30 max-h-[calc(100dvh-8rem)] w-[320px] overflow-y-auto rounded-2xl p-px shadow-[var(--shadow-pop)] scroll-thin">
                    {costsCard}
                  </div>
                )}
              </div>
            )}
            {!lg && view === "costs" && <div className="flex flex-col gap-4">{costsCard}</div>}
          </>
        )}

        {/* 2 · the quote */}
        <section aria-label={label} className={cx("flex min-w-0 flex-1 flex-col gap-4", !lg && view !== "edit" && "hidden")} style={lg ? { minWidth: Math.min(MIN_INPUTS, (areaW || 1200) - costsW - HANDLE - MIN_PREVIEW) } : undefined}>
          {quote}
        </section>

        {/* drag handle */}
        {lg && (
          <div role="separator" aria-orientation="vertical" aria-label="Resize the preview" tabIndex={0}
            aria-valuemin={15} aria-valuemax={80} aria-valuenow={Math.round(share * 100)} aria-valuetext={`Preview ${Math.round(share * 100)}% wide`}
            title="Drag to resize · double-click to reset"
            onPointerDown={onPointerDown} onKeyDown={onKey} onDoubleClick={reset}
            className="group sticky top-24 flex h-[calc(100dvh-8rem)] w-4 shrink-0 cursor-col-resize items-center justify-center focus-visible:outline-none">
            <span className={cx("h-16 w-1 rounded-full transition-colors", dragging ? "bg-brand" : "bg-line-strong group-hover:bg-ink-3 group-focus-visible:bg-brand")} />
          </div>
        )}

        {/* 3 · preview */}
        <section aria-label="Preview" className={cx("min-w-0 lg:sticky lg:top-24 lg:shrink-0", !lg && view !== "preview" && "hidden")} style={lg ? { width: pw } : undefined}>
          <ZoomPreview model={previewModel} onPreviewClick={onPreviewClick} onFull={() => setFull(true)} lg={lg} />
        </section>
      </div>

      {full && <FullPreview model={previewModel} onClose={() => setFull(false)} />}
      {footer}
    </div>
  );
}

// the live quotation, scaled to its column; Ctrl/⌘ + scroll zooms
function ZoomPreview({ model, onPreviewClick, onFull, lg }) {
  const box = useRef(null), inner = useRef(null);
  const [zoom, setZoom] = useState(null); // null = fit width
  const [fit, setFit] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  useIso(() => {
    const b = box.current, i = inner.current;
    if (!b || !i) return;
    const measure = () => {
      const w = i.firstElementChild?.offsetWidth || 1, h = i.firstElementChild?.offsetHeight || 1;
      setNatural({ w, h });
      setFit(Math.max(0.2, (b.clientWidth - 2) / w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b); ro.observe(i);
    return () => ro.disconnect();
  }, [model.paper, model.template]);
  const scale = zoom ?? fit;
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    const wheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.max(0.25, Math.min(2.5, (z ?? fit) * (1 - e.deltaY * 0.0025))));
    };
    b.addEventListener("wheel", wheel, { passive: false });
    return () => b.removeEventListener("wheel", wheel);
  }, [fit]);
  const tool = "inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[12.5px] font-medium focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]";
  return (
    <Card className="flex flex-col lg:max-h-[calc(100dvh-8rem)]">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <p className="mr-auto text-[13px] font-semibold text-ink">Preview</p>
        <button type="button" onClick={() => setZoom(null)} aria-pressed={zoom == null} className={cx(tool, zoom == null ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-hover")}>Fit width</button>
        <button type="button" onClick={() => setZoom(1)} aria-pressed={zoom === 1} className={cx(tool, zoom === 1 ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-hover")}>100%</button>
        {zoom != null && zoom !== 1 && <span className="px-1 text-[12px] text-ink-3 tabular">{Math.round(zoom * 100)}%</span>}
        <button type="button" onClick={onFull} aria-label="Open the preview full screen" title="Full screen" className={cx(tool, "text-ink-2 hover:bg-hover")}><Expand className="size-4" /></button>
      </div>
      <div ref={box} className={cx("min-h-0 flex-1 bg-tray p-0", zoom != null && zoom > fit ? "overflow-auto" : "overflow-y-auto overflow-x-hidden", lg && "scroll-thin")}>
        <div className={cx("relative", clickable)} style={{ width: natural.w * scale || undefined, height: natural.h * scale || undefined }} onClickCapture={onPreviewClick} title="Click any part to edit it">
          <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: "max-content", position: "absolute", top: 0, left: 0 }}>
            <DocView model={model} />
          </div>
        </div>
      </div>
      <p className="border-t border-line px-3 py-1.5 text-[11.5px] text-ink-3">Click any part to edit it · Ctrl/⌘ + scroll zooms</p>
    </Card>
  );
}

function FullPreview({ model, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Preview, full screen" className="fixed inset-0 z-50 flex flex-col bg-canvas outline-none">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <p className="flex-1 text-[14px] font-semibold text-ink">Preview · what your customer sees</p>
        <span className="text-[12.5px] text-ink-3 max-sm:hidden">Esc to close</span>
        <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-ink-2 ring-1 ring-line hover:bg-hover"><Minimize2 className="size-4" />Close</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="mx-auto w-full max-w-[920px]"><DocPreview model={model} maxScale={1.3} label="Preview, full screen" /></div>
      </div>
    </div>
  );
}
