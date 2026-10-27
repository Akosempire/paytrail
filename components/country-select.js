"use client";
import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { COUNTRIES, OTHER, countryByName, guessCountry } from "@/lib/countries";

const byCode = (code) => COUNTRIES.find((c) => c.code === String(code || "").toUpperCase()) || null;

// Required country: a list, with "Other" for anywhere not listed. Guesses from
// the visitor's location (ipCountry, from the server), else the device's time
// zone, when empty. onPick(country | null) lets the form
// suggest a currency.
export function CountrySelect({ id = "country", name = "country", defaultValue = "", onPick, guess = false, ipCountry, hint, className }) {
  const known = countryByName(defaultValue);
  const [choice, setChoice] = useState(known ? known.name : defaultValue ? OTHER : "");
  const [other, setOther] = useState(known ? "" : defaultValue || "");
  useEffect(() => {
    if (!guess || choice) return;
    let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
    const g = byCode(ipCountry) || guessCountry(tz);
    if (g) { setChoice(g.name); onPick?.(g); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const value = choice === OTHER ? other.trim() : choice;
  return (
    <Field label="Country" htmlFor={id} hint={hint || "Decides your tax features and the details on your invoices."} className={className}>
      <input type="hidden" name={name} value={value} />
      <Select id={id} value={choice} required onChange={(e) => { setChoice(e.target.value); onPick?.(countryByName(e.target.value)); }}>
        <option value="" disabled>Choose your country</option>
        {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
        <option value={OTHER}>Other…</option>
      </Select>
      {choice === OTHER && <Input aria-label="Your country" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Type your country" required className="mt-2" />}
    </Field>
  );
}
