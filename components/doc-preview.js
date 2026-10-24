"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { DocView } from "@/components/doc-view";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Fits a real-size document into its container. The sheet is laid out at its
// true size and scaled down, so line breaks match print. "Actual size" lets
// people read small text on a phone by scrolling instead of squinting.
export function DocPreview({ model, className = "", maxScale = 1, label = "Document preview" }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [box, setBox] = useState({ scale: 1, height: 0, width: 0 });
  const [actual, setActual] = useState(false);

  useIso(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const natural = i.firstElementChild?.offsetWidth || 1;
      const avail = o.clientWidth || natural;
      const scale = actual ? 1 : Math.min(maxScale, avail / natural);
      setBox({ scale, height: i.firstElementChild.offsetHeight * scale, width: natural * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [actual, maxScale, model.paper, model.template]);

  const small = box.scale < 0.62;
  return (
    <div className={className}>
      <div ref={outer} className={`pt-frame ${actual ? "overflow-x-auto" : ""}`} style={{ height: box.height || undefined }} role="region" aria-label={label}>
        <div ref={inner} className="pt-frame-inner" style={{ transform: `scale(${box.scale})`, width: "max-content", marginInline: !actual && box.width ? `max(0px, calc((100% - ${box.width}px) / 2))` : undefined }}>
          <DocView model={model} />
        </div>
      </div>
      {(small || actual) && (
        <button type="button" onClick={() => setActual((v) => !v)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">
          {actual ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{actual ? "Fit to screen" : "View actual size"}
        </button>
      )}
    </div>
  );
}
