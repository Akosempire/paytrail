"use client";
import { useEffect, useRef } from "react";
import Script from "next/script";

// Hidden from people: a field only bots fill in, and the signed time the form
// was shown (see lib/guard.js). Plus Cloudflare Turnstile when its site key is
// set: usually invisible, it only asks for a tap when something looks off.
// resetKey: pass the form's state so a used Turnstile answer is replaced.
export function BotFields({ token, turnstile = false, resetKey }) {
  return (
    <>
      <input type="hidden" name="ft" value={token || ""} />
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
      {turnstile && <Turnstile resetKey={resetKey} />}
    </>
  );
}

function Turnstile({ resetKey }) {
  const site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const box = useRef(null), widget = useRef(null);
  useEffect(() => {
    if (!site) return;
    let timer;
    const mount = () => {
      if (window.turnstile && box.current && widget.current == null) {
        widget.current = window.turnstile.render(box.current, { sitekey: site, appearance: "interaction-only", "response-field-name": "cf-turnstile-response" });
      } else if (widget.current == null) timer = setTimeout(mount, 250);
    };
    mount();
    return () => { clearTimeout(timer); if (widget.current != null) { window.turnstile?.remove(widget.current); widget.current = null; } };
  }, [site]);
  // after a failed submit the old answer is spent: get a fresh one
  useEffect(() => { if (resetKey && widget.current != null) window.turnstile?.reset(widget.current); }, [resetKey]);
  if (!site) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={box} className="empty:hidden" />
    </>
  );
}
