"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CloudOff, FileText, Home, Plus, Printer, Receipt, RefreshCw, Send, Users, Wallet, X, Pencil, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge, Button, Callout, Card, EmptyState, Field, Input, Logo, Select, Textarea } from "@/components/ui";
import { Modal, useToast } from "@/components/ui-client";
import { StatusBadge } from "@/components/doc-bits";
import { DocPreview } from "@/components/doc-preview";
import { DocumentEditor } from "@/components/document-editor";
import { buildModel } from "@/lib/doc-model";
import { formatMoney } from "@/lib/money";
import { formatDate, PAYMENT_METHODS, statusOf } from "@/lib/format";
import { dismissProblem, isLocal, load, newId, queue, subscribe, sync } from "@/lib/offline/engine";

function useEngine() {
  const [s, setS] = useState(null);
  useEffect(() => { load(); return subscribe(setS); }, []);
  return s;
}

// "/app/quotes/new" (from the service worker) or "#/new/quote"
function readRoute() {
  if (typeof window === "undefined") return [""];
  let p = decodeURIComponent(window.location.hash.replace(/^#/, "")) || "/";
  p = p.replace(/^\/app(?=\/|$)/, "") || "/";
  const m = p.match(/^\/(quotes|invoices)\/new/);
  if (m) return ["new", m[1] === "quotes" ? "quote" : "invoice"];
  const e = p.match(/^\/documents\/([^/?]+)\/edit/);
  if (e) return ["edit", e[1]];
  return p.split("?")[0].split("/").filter(Boolean);
}
function useRoute() {
  const [r, setR] = useState([""]);
  useEffect(() => { const on = () => { setR(readRoute()); window.scrollTo(0, 0); }; on(); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  return r;
}
const go = (path) => { window.location.hash = path; };
const balance = (d) => Math.max(0, Number(d.total_minor || 0) - Number(d.amount_paid_minor || 0));

export function OfflineApp() {
  const s = useEngine();
  const route = useRoute();
  if (!s?.ready) return <div className="min-h-dvh" />;
  const data = s.data;
  return (
    <div className="min-h-dvh bg-canvas">
      <TopBar s={s} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-28 pt-5 sm:px-6">
        {!data ? <NotReady s={s} /> : (
          <>
            {s.signedOut && s.online && <Callout tone="warn" title="Sign in again to sync" className="print:hidden" action={<Button size="sm" variant="primary" href="/login?next=/offline-app">Sign in</Button>}>Your changes are kept on this device until you do.</Callout>}
            <Problems problems={s.problems} />
            <Screen route={route} data={data} />
          </>
        )}
      </main>
      {data && <BottomNav route={route} />}
    </div>
  );
}

function TopBar({ s }) {
  const waiting = s.outbox.length;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Logo className="size-7" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink">{s.data?.business?.name || "Usetally"}</p>
          <p className="truncate text-[12px] text-ink-3">
            {s.online ? "Online" : "Offline"} · {waiting ? `${waiting} change${waiting === 1 ? "" : "s"} waiting to sync` : "Everything synced"}
            {s.lastSync ? ` · Updated ${formatDate(s.lastSync, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}` : ""}
          </p>
        </div>
        {s.online ? (
          <>
            <Button size="sm" icon={RefreshCw} loading={s.syncing} onClick={() => sync()}>Sync</Button>
            <Button size="sm" variant="primary" href="/app" className="hidden sm:inline-flex">Full app</Button>
          </>
        ) : <Badge tone="warn" icon={CloudOff} size="sm">Offline</Badge>}
      </div>
    </header>
  );
}

function NotReady({ s }) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-6 text-center">
      <CloudOff className="mx-auto size-8 text-ink-3" />
      <h1 className="mt-3 text-title-2 text-ink">Offline mode isn't set up on this device yet</h1>
      <p className="mt-2 text-sm text-ink-2">
        {s.signedOut ? "Sign in once while you're online, and Usetally saves a copy of your business on this device." : s.online ? "Getting your business ready for offline use…" : "Open Usetally once while you're online and signed in. After that it works here without internet."}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        {s.signedOut ? <Button variant="primary" href="/login?next=/app">Sign in</Button> : s.online ? <Button icon={RefreshCw} loading={s.syncing} onClick={() => sync()}>Try now</Button> : <Button onClick={() => location.reload()}>Try again</Button>}
      </div>
    </Card>
  );
}

function Problems({ problems }) {
  if (!problems.length) return null;
  return (
    <div className="flex flex-col gap-2 print:hidden">
      {problems.slice(0, 5).map((p) => (
        <Callout key={p.id} tone={p.info ? "info" : "danger"} title={p.label}
          action={<button type="button" aria-label="Dismiss" onClick={() => dismissProblem(p.id)} className="text-ink-3 hover:text-ink"><X className="size-4" /></button>}>
          {p.error}
        </Callout>
      ))}
    </div>
  );
}

const NAV = [["/", "Home", Home], ["/quotes", "Quotes", FileText], ["/invoices", "Invoices", Receipt], ["/customers", "Customers", Users], ["/payments", "Payments", Wallet]];
function BottomNav({ route }) {
  const at = "/" + (route[0] || "");
  if (route[0] === "new" || route[0] === "edit") return null; // the editor has its own save bar there
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] print:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-5">
        {NAV.map(([href, label, Icon]) => (
          <a key={href} href={`#${href}`} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${at === href ? "text-primary" : "text-ink-3"}`}>
            <Icon className="size-5" />{label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function Screen({ route, data }) {
  const [a, b] = route;
  if (a === "quotes" || a === "invoices") return <DocList data={data} kind={a === "quotes" ? "quote" : "invoice"} />;
  if (a === "documents" && b) return <DocView data={data} id={b} />;
  if (a === "new") return <Editor data={data} kind={b === "quote" ? "quote" : "invoice"} />;
  if (a === "edit" && b) return <Editor data={data} id={b} />;
  if (a === "customers") return <Customers data={data} />;
  if (a === "payments") return <Payments data={data} />;
  return <Dashboard data={data} />;
}

function Back({ href, children }) {
  return <a href={`#${href}`} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-ink-2 hover:text-ink print:hidden"><ArrowLeft className="size-4" />{children}</a>;
}

function Dashboard({ data }) {
  const cur = data.business.currency;
  const invoices = data.documents.filter((d) => d.kind === "invoice" && !["draft", "void", "pending_approval"].includes(d.status));
  const owed = invoices.reduce((t, d) => t + balance(d), 0);
  const month = new Date().toISOString().slice(0, 7);
  const paid = data.payments.filter((p) => String(p.paid_at).slice(0, 7) === month).reduce((t, p) => t + Number(p.amount_minor || 0), 0);
  const overdue = invoices.filter((d) => statusOf(d) === "overdue").length;
  const drafts = data.documents.filter((d) => d.status === "draft").length;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-1 text-ink">Home</h1>
          <p className="text-sm text-ink-2">Works without internet. Changes sync when you're back online.</p>
        </div>
        <div className="flex gap-2">
          <Button icon={Plus} onClick={() => go("/new/quote")}>Quote</Button>
          <Button icon={Plus} variant="primary" onClick={() => go("/new/invoice")}>Invoice</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Owed to you" value={formatMoney(owed, cur)} />
        <Stat label="Received this month" value={formatMoney(paid, cur)} />
        <Stat label="Overdue invoices" value={overdue} />
        <Stat label="Drafts" value={drafts} />
      </div>
      <Rows title="Recent" docs={data.documents.slice(0, 12)} />
    </>
  );
}
function Stat({ label, value }) {
  return <Card className="min-w-0 p-4"><p className="text-[12px] text-ink-3">{label}</p><p className="mt-1 truncate text-[18px] font-semibold tabular-nums text-ink">{value}</p></Card>;
}

function Rows({ title, docs, empty }) {
  return (
    <Card className="overflow-hidden">
      {title && <h2 className="border-b border-line px-4 py-3 text-[14px] font-semibold text-ink">{title}</h2>}
      {docs.length ? (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id}>
              <a href={`#/documents/${encodeURIComponent(d.id)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{d.customer_name || "No customer"}</p>
                  <p className="truncate text-[12px] text-ink-3">{d.number}{d.title ? ` · ${d.title}` : ""} · {formatDate(d.issue_date || d.created_at)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[14px] font-semibold tabular-nums text-ink">{formatMoney(d.total_minor, d.currency)}</span>
                  {d._pending ? <Badge size="sm" tone="info">Waiting to sync</Badge> : <StatusBadge doc={d} size="sm" />}
                </div>
              </a>
            </li>
          ))}
        </ul>
      ) : <EmptyState compact icon={FileText} title={empty || "Nothing here yet"} />}
    </Card>
  );
}

function DocList({ data, kind }) {
  const [q, setQ] = useState("");
  const docs = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.documents.filter((d) => d.kind === kind && (!t || [d.number, d.customer_name, d.customer_company, d.title].some((v) => String(v || "").toLowerCase().includes(t))));
  }, [data, kind, q]);
  const label = kind === "quote" ? "Quotes" : "Invoices";
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title-1 text-ink">{label}</h1>
        <Button icon={Plus} variant="primary" onClick={() => go(`/new/${kind}`)}>New {kind}</Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label.toLowerCase()}`} />
      <Rows docs={docs.slice(0, 300)} empty={q ? "No matches" : `No ${label.toLowerCase()} yet`} />
    </>
  );
}

function DocView({ data, id }) {
  const toast = useToast();
  const [paying, setPaying] = useState(false);
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const doc = data.documents.find((d) => d.id === id);
  if (!doc) return <><Back href="/">Home</Back><EmptyState icon={FileText} title="This document isn't on this device" description="It may have been made on another device after the last sync." /></>;
  const items = data.items.filter((i) => i.document_id === id).sort((x, y) => x.sort_order - y.sort_order);
  const payments = data.payments.filter((p) => p.document_id === id);
  const receipts = data.receipts.filter((r) => r.document_id === id);
  const model = receipt
    ? buildModel({ doc, items, business: data.business, receipt, payment: payments.find((p) => p.id === receipt.payment_id || `${p.id}:r` === receipt.id) || null })
    : buildModel({ doc, items, business: data.business });
  const editable = ["draft", "pending_approval"].includes(doc.status);
  const canSend = doc.status === "draft";
  const canPay = data.perms.payments && doc.kind === "invoice" && ["sent", "partially_paid", "viewed", "overdue"].includes(doc.status) && balance(doc) > 0;
  const send = (email) => {
    queue(data.perms.approval ? { kind: "document.send", docId: id, submit: true } : { kind: "document.send", docId: id, email })
      .then(() => { setSending(false); toast.success(data.perms.approval ? "Will be sent for approval when you're online." : "Marked as sent. It goes out when you're back online."); });
  };
  return (
    <>
      <Back href={doc.kind === "quote" ? "/quotes" : "/invoices"}>{doc.kind === "quote" ? "Quotes" : "Invoices"}</Back>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <h1 className="truncate text-title-1 text-ink">{doc.number}</h1>
          <p className="text-sm text-ink-2">{doc.customer_name} · {formatMoney(doc.total_minor, doc.currency)}{doc.amount_paid_minor > 0 ? ` · ${formatMoney(balance(doc), doc.currency)} left` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc._pending ? <Badge tone="info">Waiting to sync</Badge> : <StatusBadge doc={doc} />}
        </div>
      </div>
      {isLocal(id) && <Callout tone="info" title="Made offline" className="print:hidden">It gets its real number when you're back online.</Callout>}
      <div className="flex flex-wrap gap-2 print:hidden">
        {editable && <Button icon={Pencil} onClick={() => go(`/edit/${encodeURIComponent(id)}`)}>Edit</Button>}
        {canSend && (data.perms.send || data.perms.approval || data.member.role === "junior_finance") && <Button variant="primary" icon={Send} onClick={() => setSending(true)}>{data.perms.approval ? "Send for approval" : "Send"}</Button>}
        {canPay && <Button variant="primary" icon={Wallet} onClick={() => setPaying(true)}>Record payment</Button>}
        <Button icon={Printer} onClick={() => window.print()}>Print</Button>
        {receipt && <Button onClick={() => setReceipt(null)}>Back to {doc.kind}</Button>}
      </div>
      <DocPreview model={model} label={`${doc.kind} ${doc.number}`} />
      {(payments.length > 0 || receipts.length > 0) && (
        <Card className="overflow-hidden print:hidden">
          <h2 className="border-b border-line px-4 py-3 text-[14px] font-semibold text-ink">Payments and receipts</h2>
          <ul className="divide-y divide-line">
            {receipts.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setReceipt(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
                  <CheckCircle2 className="size-4 text-success" />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{r.number} · {formatDate(r.issued_at)}</span>
                  <span className="text-[14px] font-semibold tabular-nums">{formatMoney(r.amount_minor, r.currency)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {paying && <PaymentModal doc={doc} onClose={() => setPaying(false)} onDone={() => { setPaying(false); toast.success("Payment recorded. The receipt gets its number when you're back online."); }} />}
      <Modal open={sending} onClose={() => setSending(false)} title={data.perms.approval ? "Send for approval?" : `Send ${doc.number}?`}
        description={data.perms.approval ? "A manager approves it when you're back online." : "It's marked as sent now and goes to your customer when you're back online."}
        footer={data.perms.approval ? <Button variant="primary" onClick={() => send(false)}>Send for approval</Button> : (
          <>
            <Button onClick={() => send(false)}>Just mark as sent</Button>
            {doc.customer_email && data.emailReady && <Button variant="primary" onClick={() => send(true)}>Email {doc.customer_email}</Button>}
          </>
        )}>
        {!doc.customer_email && !data.perms.approval && <p className="text-sm text-ink-2">This customer has no email address, so share the link once you're online.</p>}
      </Modal>
    </>
  );
}

const MANUAL = ["bank_transfer", "cash", "pos", "other"];
function PaymentModal({ doc, onClose, onDone }) {
  const [form, setForm] = useState({ amount: String(balance(doc) / 100), method: "bank_transfer", reference: "", date: new Date().toISOString().slice(0, 10), note: "" });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = () => {
    const n = Number(String(form.amount).replace(/[^\d.]/g, ""));
    if (!(n > 0)) return setError("Enter the amount you received.");
    if (Math.round(n * 100) > balance(doc)) return setError(`That's more than the ${formatMoney(balance(doc), doc.currency)} left on this invoice.`);
    queue({ kind: "payment.record", docId: doc.id, form }).then(onDone);
  };
  return (
    <Modal open onClose={onClose} title="Record a payment" description={`${formatMoney(balance(doc), doc.currency)} left on ${doc.number}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Record payment</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Amount" htmlFor="op-amount" error={error}><Input id="op-amount" inputMode="decimal" value={form.amount} onChange={set("amount")} /></Field>
        <Field label="Method" htmlFor="op-method"><Select id="op-method" value={form.method} onChange={set("method")}>{MANUAL.map((m) => <option key={m} value={m}>{PAYMENT_METHODS[m]}</option>)}</Select></Field>
        <Field label="Date" htmlFor="op-date"><Input id="op-date" type="date" value={form.date} onChange={set("date")} /></Field>
        <Field label="Reference" htmlFor="op-ref" optional><Input id="op-ref" value={form.reference} onChange={set("reference")} /></Field>
        <Field label="Note" htmlFor="op-note" optional><Textarea id="op-note" rows={2} value={form.note} onChange={set("note")} /></Field>
      </div>
    </Modal>
  );
}

function Editor({ data, kind, id }) {
  const doc = id ? data.documents.find((d) => d.id === id) : null;
  if (id && !doc) return <EmptyState icon={FileText} title="This document isn't on this device" />;
  if (doc && !["draft", "pending_approval"].includes(doc.status)) return <><Back href={`/documents/${encodeURIComponent(id)}`}>Back</Back><EmptyState icon={FileText} title="Only drafts can be edited" /></>;
  kind = doc?.kind || kind;
  const b = data.business;
  const onSave = async (input, intent) => {
    if (!input.customer_id && !input.customer?.name) return { error: "Choose a customer or add a new one." };
    if (!input.items?.length) return { error: "Add at least one item." };
    const docId = id || newId("local");
    await queue({ kind: "document.save", docId, baseUpdatedAt: doc && !isLocal(id) ? doc.updated_at : null, input: { ...input, kind } });
    if (intent === "send") await queue({ kind: "document.send", docId, email: Boolean(input.email_customer) });
    if (intent === "submit") await queue({ kind: "document.send", docId, submit: true });
    return { id: docId };
  };
  return (
    <>
      <Back href={id ? `/documents/${encodeURIComponent(id)}` : kind === "quote" ? "/quotes" : "/invoices"}>{id ? "Back to document" : kind === "quote" ? "Quotes" : "Invoices"}</Back>
      <div>
        <h1 className="text-title-1 text-ink">{id ? `Edit ${doc.number}` : kind === "quote" ? "New quotation" : "New invoice"}</h1>
        <p className="text-sm text-ink-2">Saved on this device. It syncs, and gets its real number, when you're back online.</p>
      </div>
      <DocumentEditor key={id || kind}
        kind={kind}
        doc={doc}
        items={doc ? data.items.filter((i) => i.document_id === id).sort((x, y) => x.sort_order - y.sort_order) : undefined}
        costs={doc ? data.costs.filter((c) => c.document_id === id) : undefined}
        customers={data.customers.filter((c) => !c.archived_at)}
        presets={data.presets}
        business={{ ...b, tax_rate: Number(b.tax_rate) }}
        perms={{ canViewCosts: data.perms.costs, isJunior: data.member.role === "junior_finance" }}
        emailReady={data.emailReady}
        onSave={onSave}
        onSaved={(newDocId) => go(`/documents/${encodeURIComponent(newDocId)}`)}
      />
    </>
  );
}

function Customers({ data }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const list = data.customers.filter((c) => !c.archived_at && (!q || `${c.name} ${c.company} ${c.email} ${c.phone}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title-1 text-ink">Customers</h1>
        <Button icon={Plus} variant="primary" onClick={() => setAdding(true)}>Add customer</Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" aria-label="Search customers" />
      <Card className="overflow-hidden">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.slice(0, 300).map((c) => {
              const owed = data.documents.filter((d) => d.customer_id === c.id && d.kind === "invoice" && !["draft", "void", "pending_approval"].includes(d.status)).reduce((t, d) => t + balance(d), 0);
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{c.name}{c._local && <Badge size="sm" tone="info" className="ml-2">Waiting to sync</Badge>}</p>
                    <p className="truncate text-[12px] text-ink-3">{[c.company, c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                  </div>
                  {owed > 0 && <span className="text-[13px] font-semibold tabular-nums text-ink">{formatMoney(owed, data.business.currency)} owed</span>}
                </li>
              );
            })}
          </ul>
        ) : <EmptyState compact icon={Users} title={q ? "No matches" : "No customers yet"} />}
      </Card>
      {adding && <CustomerModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast.success("Customer added."); }} />}
    </>
  );
}

function CustomerModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", address: "" });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = () => {
    if (!form.name.trim()) return setError("A customer needs a name.");
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("Check the email address.");
    queue({ kind: "customer.save", customerId: newId("local"), form }).then(onDone);
  };
  return (
    <Modal open onClose={onClose} title="Add a customer" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add customer</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Name" htmlFor="oc-name" error={error}><Input id="oc-name" value={form.name} onChange={set("name")} /></Field>
        <Field label="Company" htmlFor="oc-company" optional><Input id="oc-company" value={form.company} onChange={set("company")} /></Field>
        <Field label="Email" htmlFor="oc-email" optional><Input id="oc-email" type="email" value={form.email} onChange={set("email")} /></Field>
        <Field label="Phone" htmlFor="oc-phone" optional><Input id="oc-phone" type="tel" value={form.phone} onChange={set("phone")} /></Field>
        <Field label="Address" htmlFor="oc-address" optional><Textarea id="oc-address" rows={2} value={form.address} onChange={set("address")} /></Field>
      </div>
    </Modal>
  );
}

function Payments({ data }) {
  const byId = Object.fromEntries(data.documents.map((d) => [d.id, d]));
  return (
    <>
      <h1 className="text-title-1 text-ink">Payments</h1>
      <Card className="overflow-hidden">
        {data.payments.length ? (
          <ul className="divide-y divide-line">
            {data.payments.slice(0, 300).map((p) => {
              const d = byId[p.document_id];
              return (
                <li key={p.id}>
                  <a href={d ? `#/documents/${encodeURIComponent(d.id)}` : "#/payments"} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{d?.customer_name || "Payment"}</p>
                      <p className="truncate text-[12px] text-ink-3">{d?.number} · {PAYMENT_METHODS[p.method] || p.method} · {formatDate(p.paid_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[14px] font-semibold tabular-nums text-ink">{formatMoney(p.amount_minor, p.currency || d?.currency)}</span>
                      {p._pending && <Badge size="sm" tone="info">Waiting to sync</Badge>}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState compact icon={Wallet} title="No payments yet" />}
      </Card>
      <p className="flex items-center gap-1.5 text-[12px] text-ink-3"><AlertTriangle className="size-3.5" />Online card and transfer payments from customers show here after the next sync.</p>
    </>
  );
}
