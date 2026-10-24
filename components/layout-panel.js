"use client";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";
import { PAPERS, SECTIONS, SIGNATURE_GREEN, TEMPLATES, papersFor, templatesFor } from "@/lib/doc-templates";

// Abstract thumbnail of a template's structure (no real or fake data).
export function TemplateThumb({ id, accent = SIGNATURE_GREEN }) {
  const bar = (w, c = "#d6d6d1", h = 3) => <span className="block rounded-[1px]" style={{ width: w, height: h, background: c }} />;
  if (id === "pos") {
    return (
      <span className="mx-auto flex h-full w-[46%] flex-col items-center gap-[3px] bg-white px-1.5 py-2 shadow-sm ring-1 ring-black/5">
        {bar("60%", "#222", 4)}{bar("80%")}{bar("70%")}
        <span className="my-[2px] block w-full border-t border-dashed border-[#333]" />
        {bar("50%", "#222")}
        <span className="my-[2px] block w-full border-t border-dashed border-[#333]" />
        {[1, 2, 3].map((i) => <span key={i} className="flex w-full justify-between">{bar("45%")}{bar("22%", "#555")}</span>)}
        <span className="mt-[2px] flex w-full justify-between">{bar("35%", "#222", 4)}{bar("30%", "#222", 4)}</span>
      </span>
    );
  }
  const exec = id === "executive";
  const ink = id === "essential" ? "#222" : accent;
  return (
    <span className={cx("flex h-full w-full flex-col gap-[4px] bg-white p-2 shadow-sm ring-1 ring-black/5", id === "signature" && "border-t-[3px]")} style={id === "signature" ? { borderColor: accent } : undefined}>
      {exec ? (
        <span className="flex flex-col items-center gap-[3px] border-b pb-1.5" style={{ borderColor: accent }}>{bar("55%", "#222", 5)}{bar("28%", accent)}</span>
      ) : (
        <span className="flex justify-between">{bar("34%", "#222", 5)}<span className="flex flex-col items-end gap-[2px]">{bar(26, ink, 4)}{bar(18)}</span></span>
      )}
      <span className={cx("mt-1 grid grid-cols-2 gap-1.5 rounded-[2px]", id === "signature" && "bg-[#f3f3f0] p-1")}>
        <span className="flex flex-col gap-[2px]">{bar("70%", "#555")}{bar("85%")}</span>
        <span className="flex flex-col gap-[2px]">{bar("60%", "#555")}{bar("80%")}</span>
      </span>
      <span className="mt-1 block rounded-[1px]" style={{ height: 4, background: id === "signature" ? `${accent}26` : "transparent", borderBottom: id === "signature" ? "none" : `1.5px solid ${exec ? accent : "#222"}` }} />
      {[1, 2, 3].map((i) => <span key={i} className="flex justify-between">{bar("48%")}{bar("16%", "#888")}</span>)}
      <span className="mt-auto flex justify-end"><span className="flex w-[48%] justify-between rounded-[1px] px-0.5 py-[2px]" style={{ background: id === "signature" ? `${accent}22` : "transparent", borderTop: id === "signature" ? "none" : `1.5px solid ${exec ? accent : "#222"}` }}>{bar("40%", ink, 4)}{bar("36%", ink, 4)}</span></span>
    </span>
  );
}

// template, paper, accent, sections and payment instructions
export function LayoutPanel({ kind, value, onChange, brandColor, showInstructions = true, idPrefix = "lp" }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setLayout = (patch) => set({ layout: { ...value.layout, ...patch } });
  const setSection = (k, v) => setLayout({ sections: { ...(value.layout?.sections || {}), [k]: v } });
  const tpl = TEMPLATES[value.template];
  const pickTemplate = (id) => {
    const papers = papersFor(kind, id);
    set({ template: id, paper: papers.includes(value.paper) ? value.paper : papers[0] });
  };
  const sections = Object.entries(SECTIONS).filter(([k]) => kind !== "receipt" || !["notes", "terms", "payment_instructions", "bank_details", "item_details"].includes(k));
  const accents = [["Signature green", SIGNATURE_GREEN], ["Your brand colour", brandColor], ["Ink navy", "#1f2a44"]].filter(([, c]) => /^#[0-9a-f]{6}$/i.test(c || ""));
  const currentAccent = value.layout?.accent || (value.template === "signature" ? SIGNATURE_GREEN : brandColor);

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink">Template</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {templatesFor(kind).map((t) => {
            const on = value.template === t.id;
            return (
              <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => pickTemplate(t.id)}
                className={cx("group relative flex flex-col gap-2 rounded-xl p-2 text-left ring-1 transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]", on ? "bg-brand-soft ring-2 ring-brand" : "bg-surface ring-line hover:ring-line-strong")}>
                <span className="block aspect-[4/5] overflow-hidden rounded-lg bg-tray p-2"><TemplateThumb id={t.id} accent={t.id === value.template ? currentAccent : t.id === "executive" ? brandColor : SIGNATURE_GREEN} /></span>
                <span className="flex items-center justify-between gap-1 px-0.5">
                  <span className="text-[13px] font-semibold text-ink">{t.name}</span>
                  {on ? <Check className="size-4 text-brand" aria-hidden="true" /> : t.recommended && <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-success-ink">Default</span>}
                </span>
                <span className="px-0.5 text-[11.5px] leading-snug text-ink-3">{t.description}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink">Paper size</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup">
          {papersFor(kind, value.template).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={value.paper === p} onClick={() => set({ paper: p })}
              className={cx("rounded-lg px-3 py-1.5 text-left ring-1 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]", value.paper === p ? "bg-brand-soft text-brand-ink ring-2 ring-brand" : "bg-surface text-ink ring-line hover:ring-line-strong")}>
              <span className="block text-[13px] font-medium">{PAPERS[p].label}</span>
              <span className="block text-[11px] text-ink-3">{PAPERS[p].detail}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {tpl?.accent && (
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink">Accent colour</legend>
          <div className="flex flex-wrap items-center gap-2">
            {accents.map(([name, c]) => (
              <button key={name} type="button" onClick={() => setLayout({ accent: c })} aria-label={name} title={name} aria-pressed={currentAccent?.toLowerCase() === c.toLowerCase()}
                className={cx("size-8 rounded-full ring-offset-2 ring-offset-surface focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]", currentAccent?.toLowerCase() === c.toLowerCase() ? "ring-2 ring-ink" : "ring-1 ring-line-strong")} style={{ background: c }} />
            ))}
            <label className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-full ring-1 ring-line-strong" title="Custom colour"
              style={{ background: "conic-gradient(#e11d48,#f59e0b,#22c55e,#06b6d4,#6366f1,#e11d48)" }}>
              <span className="sr-only">Custom accent colour</span>
              <input type="color" value={currentAccent || "#1d7a4c"} onChange={(e) => setLayout({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink">Show on the document</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {sections.map(([k, s]) => {
            const on = value.layout?.sections?.[k] ?? s.default;
            return (
              <label key={k} htmlFor={`${idPrefix}-${k}`} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-[13px] text-ink-2 hover:bg-hover">
                <input id={`${idPrefix}-${k}`} type="checkbox" checked={on} onChange={(e) => setSection(k, e.target.checked)} className="size-4 accent-[var(--color-brand)]" />{s.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {showInstructions && (
        <div>
          <label htmlFor={`${idPrefix}-instructions`} className="mb-1.5 block text-[13px] font-medium text-ink">Payment instructions <span className="font-normal text-ink-3">(optional)</span></label>
          <textarea id={`${idPrefix}-instructions`} rows={3} value={value.payment_instructions || ""} maxLength={2000} onChange={(e) => set({ payment_instructions: e.target.value })}
            placeholder="e.g. 50% deposit before work starts. Pay online with the link, or by bank transfer."
            className="w-full rounded-md bg-surface px-3 py-2 text-sm text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-3 focus:ring-2 focus:ring-brand focus:outline-none" />
          <p className="mt-1 text-[12px] text-ink-3">Bank details come from Settings → Business. The online payment link is added automatically when online payments are set up.</p>
        </div>
      )}
    </div>
  );
}
