"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Link2, QrCode, FileDown, X, Send, CalendarClock, Repeat, Loader2, Download, Share2, Check, Copy, ChevronDown } from "lucide-react";
import { Button, buttonClass, Checkbox, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { DEFAULT_MESSAGE, VARIABLES, defaultSubject, fillTemplate, looksLikeEmail, messageParagraphs, nextRecurrence, parseEmails, qrPayload, sendVars, upcoming, whatsappText, whatsappUrl } from "@/lib/send-core";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { reminderText, todayIso } from "@/lib/collect-core";
import { cancelScheduled, scheduleSend, sendNow, setRecurrence, shareDocument, undoSend } from "@/app/app/documents/send-actions";

const TABS = [
  { key: "email", label: "Email", icon: Mail },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "link", label: "Link", icon: Link2 },
  { key: "qr", label: "QR", icon: QrCode },
  { key: "pdf", label: "PDF", icon: FileDown },
];

// Send sheet: from the right on larger screens, full screen on phones.
// props.mode: "send" (first send), "share" (already sent), "reminder"
export function SendSheet({ open, onClose, doc, business, link, pdfHref, emailReady, savedMessage, canSaveDefault, canRepeat, scheduled = [], initialTab = "email", mode = "send" }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState(initialTab);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const panel = useRef(null);
  const draft = ["draft", "pending_approval"].includes(doc.status);
  const quote = doc.kind === "quote";
  const vars = useMemo(() => sendVars(doc, business.name, link), [doc, business.name, link]);
  const reminder = mode === "reminder";

  const startMessage = reminder
    ? `Hello {client},\n\nA friendly reminder that invoice {number} for {amount} was due {due_date}.\n\nYou can view and pay it here: {link}\n\nThank you,\n{business}`
    : savedMessage || DEFAULT_MESSAGE[quote ? "quote" : "invoice"];
  const [form, setForm] = useState({
    to: doc.customer_email || "", cc: "", subject: reminder ? `Reminder: ${defaultSubject(doc, business.name)}` : defaultSubject(doc, business.name),
    message: startMessage, includePdf: true, saveDefault: false,
  });
  const [touched, setTouched] = useState({});
  const [later, setLater] = useState(null); // null | "schedule" | "repeat"
  const [at, setAt] = useState(() => defaultLater());
  const [repeat, setRepeat] = useState({ interval: doc.recur_interval || "monthly", startOn: doc.recur_next_on || nextMonth(doc.issue_date), autoSend: doc.recur_auto_send ?? Boolean(doc.customer_email) });

  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  // Escape closes, Ctrl/Cmd + Enter sends; focus moves into the sheet and back afterwards
  const keys = useRef({});
  keys.current = { onClose, submitNow: () => submitNow(), tab };
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") keys.current.onClose();
      else if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && keys.current.tab === "email") { e.preventDefault(); keys.current.submitNow(); }
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => panel.current?.querySelector("[data-autofocus]")?.focus(), 30);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open]);
  useEffect(() => { if (open) setTimeout(() => panel.current?.querySelector(`#panel-${tab} [data-autofocus]`)?.focus(), 30); }, [tab, open]);

  if (!open) return null;

  const toError = touched.to && !looksLikeEmail(form.to) ? (form.to ? "That email doesn't look right. Check for a typo." : "Add your client's email.") : null;
  const ccCheck = parseEmails(form.cc, { not: [form.to] });
  const ccError = touched.cc && ccCheck.bad.length ? `${ccCheck.bad[0]} doesn't look right. Check for a typo.` : null;
  const subject = fillTemplate(form.subject, vars);
  const paragraphs = messageParagraphs(fillTemplate(form.message, vars), link);

  function submitNow() {
    setTouched({ to: true, cc: true });
    if (!looksLikeEmail(form.to) || ccCheck.bad.length) return;
    setBusy("now");
    start(async () => {
      const r = await sendNow(doc.id, { ...form, expected: doc.status === "pending_approval" ? doc.updated_at : undefined });
      setBusy(null);
      if (r?.error) return toast.error({ title: "We couldn't send this email", message: r.error });
      if (r?.warning) { toast.warning(r.warning); onClose(); router.refresh(); return; }
      onClose();
      router.refresh();
      toast.success({ message: `Sent to ${r.to}`, duration: 10000, action: { label: "Undo", onClick: () => undo(r.sendId) } });
    });
  }
  async function undo(sendId) {
    const r = await undoSend(sendId);
    if (r?.error) toast.error(r.error); else toast.info(r.message);
    router.refresh();
  }
  function submitSchedule() {
    setTouched({ to: true, cc: true });
    if (!looksLikeEmail(form.to) || ccCheck.bad.length) return;
    setBusy("schedule");
    start(async () => {
      const r = await scheduleSend(doc.id, { ...form, at: new Date(at).toISOString() });
      setBusy(null);
      if (r?.error) return toast.error(r.error);
      onClose();
      router.refresh();
      toast.success(`Scheduled for ${new Date(r.scheduled).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} to ${r.to}.`);
    });
  }
  function saveRepeat(stop = false) {
    setBusy(stop ? "stop" : "repeat");
    start(async () => {
      const r = await setRecurrence(doc.id, stop ? { interval: null } : repeat);
      setBusy(null);
      if (r?.error) return toast.error(r.error);
      toast.success(r.message);
      setLater(null);
      router.refresh();
    });
  }
  // marks a draft sent (so the link opens) and logs the channel
  async function shared(channel) {
    const r = await shareDocument(doc.id, channel);
    if (r?.error) { toast.error(r.error); return false; }
    if (r?.marked) { toast.success(`${quote ? "Quote" : "Invoice"} marked as sent. Your client can open the link now.`); router.refresh(); }
    return true;
  }

  const title = reminder ? "Send a reminder" : draft ? `Send ${doc.number}` : `Share ${doc.number}`;
  const amount = formatMoney(quote ? doc.total_minor : doc.total_minor - (doc.amount_paid_minor || 0), doc.currency);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-[#101828]/45 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title}
        className={cx("relative flex h-full w-full animate-rise flex-col bg-surface shadow-[var(--shadow-dialog)] ring-1 ring-line sm:animate-none",
          tab === "email" ? "sm:max-w-[960px]" : "sm:max-w-[560px]")}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))] sm:pt-4">
          <div className="min-w-0">
            <h2 className="text-title-2 text-ink">{title}</h2>
            <p className="mt-0.5 truncate text-[13px] text-ink-3">{doc.customer_company || doc.customer_name} · {amount}{!quote && doc.due_date ? ` · due ${formatDate(doc.due_date)}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 ring-1 ring-line hover:bg-hover hover:text-ink sm:size-8">
            <X className="size-4" />
          </button>
        </header>

        <div role="tablist" aria-label="How to send" className="flex border-b border-line px-1 sm:gap-1 sm:px-4">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`panel-${t.key}`} onClick={() => setTab(t.key)}
              className={cx("-mb-px inline-flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 border-b-2 px-1 text-[12px] font-medium transition-colors sm:min-h-11 sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3 sm:text-[13.5px]",
                tab === t.key ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
              <t.icon className="size-4" aria-hidden />{t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "email" && (
            <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-4 p-5">
                {!emailReady && <p className="rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn-ink">{draft ? "Email isn't set up on this Usetally yet. Mark as sent, then share the link or use WhatsApp." : "Email isn't set up on this Usetally yet, so this can't be emailed. Share it on WhatsApp or by link instead."}</p>}
                <Field label="To" htmlFor="ss-to" error={toError}>
                  <Input id="ss-to" data-autofocus={!form.to || undefined} type="email" inputMode="email" autoComplete="email" value={form.to} aria-invalid={Boolean(toError)} aria-describedby={toError ? "ss-to-error" : undefined}
                    onChange={(e) => setForm({ ...form, to: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, to: true }))} placeholder="client@example.com" />
                </Field>
                <Field label="CC" htmlFor="ss-cc" optional error={ccError} hint={ccError ? undefined : "Separate addresses with commas. Each gets their own copy."}>
                  <Input id="ss-cc" type="text" inputMode="email" value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, cc: true }))} placeholder="accounts@example.com" />
                </Field>
                <Field label="Subject" htmlFor="ss-subject">
                  <Input id="ss-subject" data-autofocus={form.to ? true : undefined} value={form.subject} maxLength={200} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                </Field>
                <Field label="Message" htmlFor="ss-message" hint="Words in {braces} are filled in for each client.">
                  <Textarea id="ss-message" rows={8} value={form.message} maxLength={4000} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                </Field>
                <div className="-mt-2 flex flex-wrap gap-1.5" aria-label="Add a detail">
                  {VARIABLES.map((v) => (
                    <button key={v.key} type="button" title={v.label} onClick={() => setForm((f) => ({ ...f, message: `${f.message}${/\s$/.test(f.message) || !f.message ? "" : " "}{${v.key}}` }))}
                      className="min-h-8 rounded-full bg-subtle px-2.5 font-mono text-[12px] text-ink-2 ring-1 ring-inset ring-line hover:bg-hover hover:text-ink">{`{${v.key}}`}</button>
                  ))}
                </div>
                <Checkbox label="Include the PDF" description="Adds a Download PDF link under your message." checked={form.includePdf} onChange={(e) => setForm({ ...form, includePdf: e.target.checked })} />
                {canSaveDefault && !reminder && form.message !== (savedMessage || DEFAULT_MESSAGE[quote ? "quote" : "invoice"]) && (
                  <Checkbox label="Use this message next time" checked={form.saveDefault} onChange={(e) => setForm({ ...form, saveDefault: e.target.checked })} />
                )}
                {scheduled.length > 0 && (
                  <div className="rounded-lg bg-subtle px-3 py-2.5 text-[13px] ring-1 ring-inset ring-line">
                    {scheduled.map((s) => (
                      <p key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-ink-2">
                        <span><CalendarClock className="mr-1.5 inline size-4 align-[-3px] text-ink-3" />Scheduled for {s.label} to {s.to_email}</span>
                        <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => start(async () => { const r = await cancelScheduled(s.id, doc.id); r.error ? toast.error(r.error) : toast.info(r.message); router.refresh(); })}>Cancel</button>
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <EmailPreview business={business} doc={doc} subject={subject} paragraphs={paragraphs} to={form.to} includePdf={form.includePdf} amount={amount} />
            </div>
          )}

          {tab === "whatsapp" && <WhatsAppTab doc={doc} business={business} link={link} draft={draft} onShared={shared} reminder={reminder} />}
          {tab === "link" && <LinkTab link={link} draft={draft} onShared={shared} quote={quote} />}
          {tab === "qr" && <QrTab link={link} number={doc.number} draft={draft} onShared={shared} />}
          {tab === "pdf" && <PdfTab pdfHref={pdfHref} number={doc.number} onShared={() => shared("pdf")} draft={draft} />}
        </div>

        {tab === "email" && (
          <footer className="border-t border-line bg-subtle px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3.5">
            {later === "schedule" && (
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <Field label="Send on" htmlFor="ss-at" className="min-w-[220px] flex-1">
                  <Input id="ss-at" type="datetime-local" value={at} min={defaultLater(5)} onChange={(e) => setAt(e.target.value)} />
                </Field>
                <Button variant="primary" icon={busy === "schedule" ? Loader2 : CalendarClock} loading={pending && busy === "schedule"} onClick={submitSchedule}>Schedule</Button>
              </div>
            )}
            {later === "repeat" && (
              <RepeatForm doc={doc} repeat={repeat} setRepeat={setRepeat} pending={pending} busy={busy} onSave={() => saveRepeat()} onStop={() => saveRepeat(true)} />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!quote && canRepeat && (
                <Button variant="ghost" icon={Repeat} aria-expanded={later === "repeat"} onClick={() => setLater(later === "repeat" ? null : "repeat")}>
                  {doc.recur_interval ? `Repeats ${doc.recur_interval}` : "Make recurring"}
                </Button>
              )}
              <div className="ml-auto flex flex-1 gap-2 sm:flex-none [&>*]:flex-1 sm:[&>*]:flex-none">
                {emailReady && !reminder && <Button icon={CalendarClock} iconRight={ChevronDown} aria-expanded={later === "schedule"} onClick={() => setLater(later === "schedule" ? null : "schedule")}>Schedule…</Button>}
                {(emailReady || draft) && <Button variant="primary" icon={busy === "now" && pending ? Loader2 : Send} disabled={pending && busy === "now"} onClick={submitNow}>
                  {busy === "now" && pending ? "Sending…" : !emailReady ? "Mark as sent" : reminder ? "Send reminder" : "Send now"}
                </Button>}
                {!emailReady && !draft && <Button variant="primary" icon={MessageCircle} onClick={() => setTab("whatsapp")}>Use WhatsApp</Button>}
              </div>
            </div>
            {emailReady && <p className="mt-2 hidden text-[12px] text-ink-3 sm:block">You can undo for 10 seconds after sending. <span className="font-mono">Ctrl + Enter</span> sends.</p>}
          </footer>
        )}
      </div>
    </div>
  );
}

function RepeatForm({ doc, repeat, setRepeat, pending, busy, onSave, onStop }) {
  const dates = repeat.startOn ? upcoming(repeat.startOn, repeat.interval, 3) : [];
  return (
    <div className="mb-3 rounded-xl bg-surface p-4 ring-1 ring-line">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Repeat" htmlFor="ss-every">
          <Select id="ss-every" value={repeat.interval} onChange={(e) => setRepeat({ ...repeat, interval: e.target.value })}>
            <option value="weekly">Every week</option><option value="monthly">Every month</option>
          </Select>
        </Field>
        <Field label="Next one on" htmlFor="ss-start">
          <Input id="ss-start" type="date" value={repeat.startOn} min={tomorrow()} onChange={(e) => setRepeat({ ...repeat, startOn: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox label="Send each one to the client automatically" description={doc.customer_email ? `Emailed to ${doc.customer_email} on the day. Off: we make a draft for you to check and send.` : "Add an email for this client to send automatically. Until then you get a draft to send."}
            disabled={!doc.customer_email} checked={repeat.autoSend && Boolean(doc.customer_email)} onChange={(e) => setRepeat({ ...repeat, autoSend: e.target.checked })} />
        </div>
      </div>
      {dates.length > 0 && <p className="mt-3 text-[12.5px] text-ink-3">Next: {dates.map((d) => formatDate(d, { day: "numeric", month: "short" })).join(", ")}…</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {doc.recur_interval && <Button variant="ghost" loading={pending && busy === "stop"} onClick={onStop}>Stop repeating</Button>}
        <Button variant="primary" icon={busy === "repeat" && pending ? Loader2 : Repeat} loading={pending && busy === "repeat"} onClick={onSave}>{doc.recur_interval ? "Save changes" : "Start repeating"}</Button>
      </div>
    </div>
  );
}

// the email as the client will see it (same words, layout simplified)
function EmailPreview({ business, doc, subject, paragraphs, to, includePdf, amount }) {
  const quote = doc.kind === "quote";
  return (
    <div className="border-t border-line bg-canvas p-5 lg:border-l lg:border-t-0">
      <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">Preview</p>
      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line" aria-label="Email preview">
        <div className="border-b border-line px-4 py-3 text-[12.5px]">
          <p className="truncate text-ink-3">From <span className="text-ink">{business.name}</span></p>
          <p className="truncate text-ink-3">To <span className="text-ink">{to || "—"}</span></p>
          <p className="mt-1 truncate font-semibold text-ink">{subject || "(no subject)"}</p>
        </div>
        <div className="space-y-3 px-5 py-5 text-[13.5px] leading-relaxed text-ink-2">
          {business.logoUrl ? <img src={business.logoUrl} alt="" className="h-8 w-auto" /> : <p className="text-[15px] font-bold text-ink">{business.name}</p>}
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{quote ? "Quotation" : "Invoice"}</p>
          <p className="text-[17px] font-semibold leading-snug text-ink">{quote ? `Your quotation from ${business.name}` : `Invoice ${doc.number} from ${business.name}`}</p>
          {paragraphs.length ? paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>) : <p className="text-ink-3">Your message appears here.</p>}
          {includePdf && <p>Prefer a file? <span className="underline">Download the PDF</span>.</p>}
          <dl className="divide-y divide-line border-y border-line text-[13px]">
            <div className="flex justify-between py-2"><dt className="text-ink-3">{quote ? "Quotation" : "Invoice"}</dt><dd className="font-semibold text-ink">{doc.number}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-ink-3">{quote ? "Total" : "Amount due"}</dt><dd className="font-semibold text-ink tabular">{amount}</dd></div>
            {!quote && doc.due_date && <div className="flex justify-between py-2"><dt className="text-ink-3">Due date</dt><dd className="font-semibold text-ink">{formatDate(doc.due_date)}</dd></div>}
          </dl>
          <span className="inline-flex rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white" style={{ background: business.brand_color || "var(--color-brand)" }}>{quote ? "View quotation" : "View & pay invoice"} →</span>
        </div>
      </div>
    </div>
  );
}

function DraftNote({ draft, quote }) {
  if (!draft) return null;
  return <p className="rounded-lg bg-subtle px-3 py-2.5 text-[13px] text-ink-2 ring-1 ring-inset ring-line">Sharing marks it as sent, so your client can open the link.</p>;
}

function WhatsAppTab({ doc, business, link, draft, onShared, reminder = false }) {
  const [text, setText] = useState(() => (reminder ? reminderText(doc, business.name, link, todayIso()) : whatsappText(doc, business.name, link)));
  const [phone, setPhone] = useState(doc.customer_phone || "");
  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);
  async function open() {
    if (!(await onShared("whatsapp"))) return;
    window.open(whatsappUrl(phone, text), "_blank", "noopener");
  }
  async function nativeShare() {
    if (!(await onShared("share"))) return;
    try { await navigator.share({ title: `${doc.kind === "quote" ? "Quotation" : "Invoice"} ${doc.number}`, text }); } catch { /* closed */ }
  }
  return (
    <div className="flex flex-col gap-4 p-5">
      <DraftNote draft={draft} />
      <Field label="Client's WhatsApp number" htmlFor="wa-phone" optional hint="Leave empty to choose the chat in WhatsApp.">
        <Input id="wa-phone" data-autofocus type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0000" />
      </Field>
      <Field label="Message" htmlFor="wa-text">
        <Textarea id="wa-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
        <Button variant="primary" icon={MessageCircle} onClick={open}>Open WhatsApp</Button>
        {canShare && <Button icon={Share2} onClick={nativeShare}>More apps…</Button>}
      </div>
    </div>
  );
}

function LinkTab({ link, draft, onShared, quote }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!(await onShared("link"))) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked: the field is selectable */ }
  }
  return (
    <div className="flex flex-col gap-4 p-5">
      <DraftNote draft={draft} />
      <p className="text-[13.5px] text-ink-2">Anyone with this link can view the {quote ? "quotation" : "invoice"} and pay. No account needed.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly value={link} aria-label="Link" onFocus={(e) => e.target.select()} className="min-h-11 min-w-0 flex-1 rounded-lg bg-subtle px-3 font-mono text-[12.5px] text-ink-2 ring-1 ring-inset ring-line" />
        <Button data-autofocus variant="primary" icon={copied ? Check : Copy} onClick={copy} aria-live="polite">{copied ? "Copied" : "Copy link"}</Button>
      </div>
    </div>
  );
}

function QrTab({ link, number, draft, onShared }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const payload = qrPayload(link);
  useEffect(() => {
    let live = true;
    if (!payload) { setFailed(true); return; }
    import("qrcode").then((QR) => QR.toDataURL(payload, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#101828", light: "#ffffff" } }))
      .then((url) => live && setSrc(url), () => live && setFailed(true));
    return () => { live = false; };
  }, [payload]);
  async function download() {
    if (!src || !(await onShared("qr"))) return;
    const a = document.createElement("a");
    a.href = src; a.download = `${number}-qr.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  return (
    <div className="flex flex-col items-center gap-4 p-5 text-center">
      <DraftNote draft={draft} />
      <p className="text-[13.5px] text-ink-2">Your client points their phone camera at this to open the invoice. Print it or show it on screen.</p>
      <div className="grid size-64 place-items-center rounded-2xl bg-white p-3 ring-1 ring-line">
        {src ? <img src={src} alt={`QR code for ${number}`} className="size-full" /> : failed ? <p className="text-[13px] text-ink-3">Couldn't make the QR code. Copy the link instead.</p> : <Loader2 className="size-5 animate-spin text-ink-3" aria-label="Making the QR code" />}
      </div>
      <Button data-autofocus variant="primary" icon={Download} disabled={!src} onClick={download}>Download PNG</Button>
    </div>
  );
}

function PdfTab({ pdfHref, number, onShared, draft }) {
  return (
    <div className="flex flex-col gap-4 p-5">
      <p className="text-[13.5px] text-ink-2">The same layout your client sees, ready to attach or print.</p>
      <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
        <a data-autofocus href={pdfHref} onClick={() => { if (!draft) onShared(); }} className={buttonClass({ variant: "primary" })}>
          <Download className="size-4" aria-hidden />Download {number}.pdf
        </a>
      </div>
      {draft && <p className="text-[12.5px] text-ink-3">It's still a draft, so the PDF says so. Send it first to share a final copy.</p>}
    </div>
  );
}

function pad(n) { return String(n).padStart(2, "0"); }
function localInput(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
// tomorrow at 9:00, or a few minutes from now for the input's minimum
function defaultLater(minutes) {
  const d = new Date();
  if (minutes) { d.setMinutes(d.getMinutes() + minutes); return localInput(d); }
  d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
  return localInput(d);
}
function tomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
// a month after the issue date (same day, or the month's last day), never before tomorrow
function nextMonth(issue) {
  const t = tomorrow();
  let d = /^\d{4}-\d{2}-\d{2}$/.test(String(issue || "")) ? nextRecurrence(issue, "monthly") : t;
  while (d < t) d = nextRecurrence(d, "monthly", Number(String(issue).slice(8, 10)));
  return d;
}
