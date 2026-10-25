"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const cx = (...c) => c.filter(Boolean).join(" ");

// One box per digit for emailed codes.
// - typing moves forward, Backspace moves back, arrows move between boxes
// - pasting (or phone autofill, which drops the whole code into one box)
//   fills every box; longer codes (some projects use 8 digits) add boxes
// - onComplete fires when the last digit is in (used to submit the form)
// - when `errorKey` changes (a wrong code came back), the boxes shake and clear
// The joined value is posted under `name`, so it works inside plain <form>s.
export function OtpInput({ name = "code", length = 6, onComplete, onChange, errorKey, autoFocus = true, disabled, label = "Code" }) {
  const [digits, setDigits] = useState(() => Array(length).fill(""));
  const [shake, setShake] = useState(false);
  const boxes = useRef([]);
  const value = digits.join("");

  const focus = (i) => boxes.current[Math.max(0, Math.min(i, digits.length - 1))]?.focus();

  const set = useCallback((next) => {
    setDigits(next);
    onChange?.(next.join(""));
  }, [onChange]);

  // submit once every box is filled, after the hidden field holds the code
  const submitted = useRef("");
  useEffect(() => {
    const full = digits.every((d) => d !== "") && value.length >= Math.min(length, 6);
    if (!full) { submitted.current = ""; return; }
    if (submitted.current === value) return;
    submitted.current = value;
    onComplete?.(value);
  }, [digits, value, onComplete]);

  // a wrong code: shake, clear, start again
  useEffect(() => {
    if (!errorKey) return;
    setShake(true);
    const t = setTimeout(() => { setShake(false); setDigits((d) => d.map(() => "")); onChange?.(""); boxes.current[0]?.focus(); }, 420);
    return () => clearTimeout(t);
  }, [errorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function fill(from, text) {
    const nums = String(text).replace(/\D/g, "").slice(0, 10);
    if (!nums) return;
    const size = Math.max(digits.length, Math.min(10, from + nums.length));
    const next = [...digits, ...Array(size - digits.length).fill("")];
    [...nums].forEach((n, k) => { if (from + k < size) next[from + k] = n; });
    set(next);
    focus(Math.min(from + nums.length, size - 1));
  }

  return (
    <div role="group" aria-label={label} className={cx("flex justify-center gap-2 sm:gap-2.5", shake && "animate-[otp-shake_.4s_ease-in-out]")}>
      <input type="hidden" name={name} value={value} />
      {digits.map((d, i) => (
        <input key={i} ref={(el) => (boxes.current[i] = el)}
          aria-label={`Digit ${i + 1} of ${digits.length}`}
          data-keep-size=""
          inputMode="numeric" pattern="[0-9]*" maxLength={i === 0 ? 10 : 1}
          autoComplete={i === 0 ? "one-time-code" : "off"} autoFocus={autoFocus && i === 0} disabled={disabled}
          value={d}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (v.length > 1) return fill(i, v); // autofill / fast typing
            const next = [...digits]; next[i] = v; set(next);
            if (v) focus(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) { e.preventDefault(); const next = [...digits]; next[i - 1] = ""; set(next); focus(i - 1); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); focus(i - 1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); focus(i + 1); }
          }}
          onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData("text")); }}
          onFocus={(e) => e.target.select()}
          className={cx(
            "h-14 w-full max-w-[52px] min-w-0 rounded-xl bg-surface text-center font-mono text-[24px] font-semibold text-ink tabular-nums",
            "ring-1 ring-line-strong ring-inset transition-[box-shadow,transform] duration-150 caret-transparent",
            "focus:shadow-[var(--shadow-focus)] focus:ring-2 focus:ring-brand focus:outline-none",
            d && "ring-ink/40",
            shake && "ring-2 ring-intent-error",
          )} />
      ))}
    </div>
  );
}

// "Send a new code" with a countdown that matches the server's 45-second limit.
// The timer starts immediately, because a code was just sent.
export function ResendCode({ onResend, seconds = 45, label = "Send a new code" }) {
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const wait = left > 0;
  return (
    <button type="button" disabled={wait || busy}
      onClick={async () => { setBusy(true); try { const r = await onResend(); if (!r?.error) setLeft(seconds); } finally { setBusy(false); } }}
      className="font-medium text-brand-ink tabular-nums hover:underline disabled:cursor-default disabled:text-ink-3 disabled:no-underline">
      {busy ? "Sending…" : wait ? `${label} in 0:${String(left).padStart(2, "0")}` : label}
    </button>
  );
}
