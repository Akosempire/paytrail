"use client";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, CircleAlert, Loader2, MapPin } from "lucide-react";
import { Field, Input, cx } from "@/components/ui";
import { formatPostcodeInput, normalizePostcode, postcodeProblem } from "@/lib/postcode";

// Nigeria's digital postcode, checked live with NIPOST as you type.
// onChange(code, { area, verified }) gets the formatted code ("" when cleared).
export function PostcodeField({ id, label = "Postcode", value, onChange, area: initialArea = "", verified: initialVerified = false, hint, className, name }) {
  const [text, setText] = useState(value || "");
  const [state, setState] = useState(value ? (initialVerified ? { status: "verified", area: initialArea } : { status: "idle" }) : { status: "idle" });
  const last = useRef(value || "");
  useEffect(() => { if ((value || "") !== last.current) { setText(value || ""); last.current = value || ""; } }, [value]);

  useEffect(() => {
    const code = normalizePostcode(text);
    if (!code) { setState(text && text.replace(/[^A-Za-z0-9]/g, "").length >= 11 ? { status: "format" } : { status: "idle" }); return; }
    if (state.code === code && state.status !== "idle") return;
    setState({ status: "checking", code });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/postcode?code=${encodeURIComponent(code)}`, { signal: ctrl.signal, cache: "no-store" }).then((x) => x.json());
        setState({ ...r, code });
        onChange?.(code, { area: r.area || "", verified: r.status === "verified" });
      } catch (e) { if (e?.name !== "AbortError") setState({ status: "unchecked", code }); }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = state.status === "format" ? postcodeProblem(text) : null;
  const status = {
    checking: <span className="inline-flex items-center gap-1.5 text-ink-3"><Loader2 className="size-3.5 animate-spin" />Checking with NIPOST…</span>,
    verified: <span className="inline-flex items-center gap-1.5 font-medium text-success-ink"><BadgeCheck className="size-3.5" />Verified by NIPOST{state.area ? ` · ${state.area}` : ""}</span>,
    invalid: <span className="inline-flex items-center gap-1.5 font-medium text-danger-ink"><CircleAlert className="size-3.5" />NIPOST doesn't recognise this postcode</span>,
    unchecked: <span className="inline-flex items-center gap-1.5 text-ink-3"><MapPin className="size-3.5" />Format looks right. NIPOST check unavailable right now.</span>,
    format: <span className="inline-flex items-center gap-1.5 text-danger-ink"><CircleAlert className="size-3.5" />{problem}</span>,
  }[state.status];

  return (
    <Field label={label} htmlFor={id} optional className={className} hint={status ? undefined : hint || "Nigeria's 11-character postcode, e.g. EK-01-A03-FK-01."}>
      <Input id={id} name={name} value={text} inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="EK-01-A03-FK-01"
        className={cx("font-mono tracking-[0.06em] uppercase", state.status === "verified" && "ring-success/50", (state.status === "invalid" || state.status === "format") && "ring-danger/50")}
        onChange={(e) => {
          const v = formatPostcodeInput(e.target.value);
          setText(v); last.current = v;
          if (!v) onChange?.("", { area: "", verified: false });
          else if (!normalizePostcode(v)) onChange?.(v, { area: "", verified: false });
        }} />
      {status && <p className="text-[12.5px]" aria-live="polite">{status}</p>}
    </Field>
  );
}
