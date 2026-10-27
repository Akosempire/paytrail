"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Field, Input, Select } from "@/components/ui";
import { Switch } from "@/components/ui-client";
import { REGION_LABEL, presetText, regionsFor, taxPreset } from "@/lib/tax-presets";

// Province (Canada) or other region that decides the tax. Only shows for
// countries that need one.
export function RegionSelect({ countryCode, value, onChange, name = "region", className }) {
  const regions = regionsFor(countryCode);
  if (!regions) return <input type="hidden" name={name} value="" />;
  return (
    <Field label={REGION_LABEL[countryCode] || "Region"} htmlFor="region" hint="Decides which sales taxes you charge." className={className}>
      <Select id="region" name={name} value={value || ""} required onChange={(e) => onChange?.(e.target.value)}>
        <option value="" disabled>Choose…</option>
        {regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </Select>
    </Field>
  );
}

// "Do you charge tax?" then the tax name(s) and rate(s), suggested for the
// country (and province). Off = rates 0 (not registered). Submits tax_label,
// tax_rate, tax2_label and tax2_rate.
export function TaxFields({ countryCode, regionCode, defaults = {} }) {
  const preset = taxPreset(countryCode, regionCode);
  const has2 = Boolean(defaults.tax2_label) || Number(defaults.tax2_rate) > 0;
  const [charge, setCharge] = useState(Number(defaults.tax_rate) > 0 || Number(defaults.tax2_rate) > 0);
  const [rows, setRows] = useState(() => [
    { label: defaults.tax_label || preset?.[0]?.[0] || "VAT", rate: String(Number(defaults.tax_rate) || "") },
    ...(has2 ? [{ label: defaults.tax2_label || "", rate: String(Number(defaults.tax2_rate) || "") }] : []),
  ]);
  const fromPreset = () => setRows((preset || [["VAT", 0]]).map(([label, rate]) => ({ label, rate: rate ? String(rate) : "" })));
  const turn = (on) => {
    setCharge(on);
    // switching on with no rates yet: fill in the country's (or province's) taxes
    if (on && !rows.some((r) => Number(r.rate) > 0)) fromPreset();
  };
  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const names = (preset || [[rows[0]?.label || "tax"]]).map(([n]) => n).join(" + ");
  const current = rows.map((r) => `${r.label} ${Number(r.rate) || 0}%`).join(" + ");
  const suggestion = preset && presetText(preset) !== current ? presetText(preset) : null;
  const r1 = rows[0] || { label: "VAT", rate: "" }, r2 = rows[1];

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="tax_label" value={r1.label} />
      <input type="hidden" name="tax_rate" value={charge ? Number(r1.rate) || 0 : 0} />
      <input type="hidden" name="tax2_label" value={charge && r2 ? r2.label : ""} />
      <input type="hidden" name="tax2_rate" value={charge && r2 ? Number(r2.rate) || 0 : 0} />
      <Switch checked={charge} onChange={turn} label={`I charge ${names}`}
        description={charge ? "Added to every invoice. You can change it on any document." : "Only if you're registered for it. Leave off and invoices carry no tax."} />
      {charge && (
        <div className="flex flex-col gap-2.5 rounded-xl bg-tray p-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem_2.5rem] items-end gap-2 sm:max-w-md">
              <Field label={i === 0 ? "Tax name" : "Second tax name"} htmlFor={`tax-name-${i}`}>
                <Input id={`tax-name-${i}`} value={r.label} onChange={(e) => set(i, { label: e.target.value.slice(0, 30) })} placeholder={i === 0 ? "VAT" : "PST"} />
              </Field>
              <Field label="Rate (%)" htmlFor={`tax-rate-${i}`}>
                <Input id={`tax-rate-${i}`} inputMode="decimal" value={r.rate} onChange={(e) => set(i, { rate: e.target.value.replace(/[^\d.]/g, "").slice(0, 7) })} placeholder="0" className="text-right tabular" />
              </Field>
              {i === 1
                ? <button type="button" aria-label="Remove second tax" onClick={() => setRows((rs) => rs.slice(0, 1))} className="mb-1 grid size-10 place-items-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink"><X className="size-4" /></button>
                : <span />}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            {rows.length === 1 && <button type="button" onClick={() => setRows((rs) => [...rs, { label: "", rate: "" }])} className="font-medium text-brand-ink hover:underline">+ Add another tax</button>}
            {suggestion && <button type="button" onClick={fromPreset} className="font-medium text-brand-ink hover:underline">Use {suggestion}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
