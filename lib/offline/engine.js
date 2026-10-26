"use client";
// Offline mode, on the device. Holds a copy of the business's data in
// IndexedDB, applies changes made offline to that copy straight away, and keeps
// them in an outbox that is sent to /api/offline/sync when the connection is
// back. Every change has its own id, so the server applies it once even if it
// is sent twice. Documents made offline show "Draft (offline)" until they sync
// and get their real number.
import { computeTotals } from "@/lib/money";

const DB = "usetally-offline", STORE = "kv";
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
async function get(key) {
  const db = await idb();
  return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function put(key, value) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

export const newId = (prefix = "op") => `${prefix}:${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)}`;
export const isLocal = (id) => String(id || "").startsWith("local:");

const state = { ready: false, data: null, outbox: [], ids: {}, problems: [], online: true, syncing: false, lastSync: null, signedOut: false };
const listeners = new Set();
function emit() { const snap = { ...state }; listeners.forEach((fn) => fn(snap)); }
export function subscribe(fn) { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); }
export const current = () => state;

async function persist() {
  try { await Promise.all([put("data", state.data), put("outbox", state.outbox), put("ids", state.ids), put("problems", state.problems), put("lastSync", state.lastSync)]); } catch { /* storage full or blocked */ }
}

let loading = null;
export function load() {
  if (loading) return loading;
  loading = (async () => {
    state.online = typeof navigator === "undefined" ? true : navigator.onLine;
    try {
      const [data, outbox, ids, problems, lastSync] = await Promise.all([get("data"), get("outbox"), get("ids"), get("problems"), get("lastSync")]);
      state.data = data || null; state.outbox = outbox || []; state.ids = ids || {}; state.problems = problems || []; state.lastSync = lastSync || null;
    } catch { /* private window: works for this visit only */ }
    state.ready = true;
    emit();
    if (typeof window !== "undefined" && !window.__usetallyOffline) {
      window.__usetallyOffline = true;
      window.addEventListener("online", () => { state.online = true; emit(); sync(); });
      window.addEventListener("offline", () => { state.online = false; emit(); });
      setInterval(() => { if (navigator.onLine) sync(); }, 5 * 60 * 1000);
    }
  })();
  return loading;
}

// ---------------------------------------------------------------- changes, applied to the local copy
function docTotals(input) {
  const items = (input.items || []).map((i) => ({ quantity: Number(i.quantity) || 0, unit_price_minor: Number(i.unit_price_minor) || 0, vat_category: i.vat_category }));
  return computeTotals(items, input.discount_minor || 0, input.tax_rate || 0, { inclusive: Boolean(input.prices_include_vat) });
}

export function applyLocal(data, op) {
  if (!data) return;
  const now = new Date().toISOString();
  if (op.kind === "customer.save") {
    const c = data.customers.find((x) => x.id === op.customerId);
    const row = { name: op.form.name || "", company: op.form.company || "", email: op.form.email || "", phone: op.form.phone || "", address: op.form.address || "", notes: op.form.notes || "", updated_at: now };
    if (c) Object.assign(c, row);
    else data.customers.push({ id: op.customerId, ...row, archived_at: null, created_at: now, _local: true });
    data.customers.sort((a, b) => a.name.localeCompare(b.name));
  } else if (op.kind === "document.save") {
    const input = op.input, t = docTotals(input);
    let doc = data.documents.find((d) => d.id === op.docId);
    const cust = input.customer_id ? data.customers.find((c) => c.id === input.customer_id) || {} : input.customer || {};
    const fields = {
      kind: input.kind || doc?.kind, title: input.title || "", issue_date: input.issue_date, due_date: input.due_date || null, valid_until: input.valid_until || null,
      customer_id: input.customer_id || null, customer_name: cust.name || "", customer_company: cust.company || "", customer_email: cust.email || "", customer_phone: cust.phone || "", customer_address: cust.address || "",
      subtotal_minor: t.subtotal, discount_minor: t.discount, tax_rate: input.tax_rate || 0, tax_label: input.tax_label || "", tax_minor: t.tax, total_minor: t.total, prices_include_vat: Boolean(input.prices_include_vat),
      notes: input.notes || "", terms: input.terms || "", updated_at: now, _pending: true,
    };
    if (doc) Object.assign(doc, fields);
    else {
      doc = { id: op.docId, number: "Draft (offline)", status: "draft", currency: data.business.currency, amount_paid_minor: 0, created_at: now, template: null, paper: null, layout: {}, snapshot: null, _local: true, ...fields };
      data.documents.unshift(doc);
    }
    data.items = data.items.filter((i) => i.document_id !== op.docId).concat((input.items || []).map((i, n) => ({ id: `${op.docId}:i${n}`, document_id: op.docId, ...i, sort_order: n })));
    if (Array.isArray(input.costs)) data.costs = data.costs.filter((c) => c.document_id !== op.docId).concat(input.costs.map((c, n) => ({ id: `${op.docId}:c${n}`, document_id: op.docId, ...c, sort_order: n })));
  } else if (op.kind === "document.send") {
    const doc = data.documents.find((d) => d.id === op.docId);
    if (doc) Object.assign(doc, { status: op.submit ? "pending_approval" : "sent", sent_at: op.submit ? doc.sent_at : now, updated_at: now, _pending: true });
  } else if (op.kind === "payment.record") {
    const doc = data.documents.find((d) => d.id === op.docId);
    const amount = Math.round(Number(String(op.form.amount).replace(/[^\d.]/g, "")) * 100) || 0;
    data.payments.unshift({ id: op.id, document_id: op.docId, method: op.form.method, reference: op.form.reference || "", amount_minor: amount, currency: doc?.currency, paid_at: op.form.date || now, note: op.form.note || "", _pending: true });
    if (doc) {
      doc.amount_paid_minor = Number(doc.amount_paid_minor || 0) + amount;
      doc.status = doc.amount_paid_minor >= Number(doc.total_minor) ? "paid" : "partially_paid";
      doc._pending = true;
      data.receipts.unshift({ id: `${op.id}:r`, document_id: op.docId, number: "Receipt (offline)", amount_minor: amount, currency: doc.currency, balance_after_minor: Math.max(0, Number(doc.total_minor) - doc.amount_paid_minor), issued_at: op.form.date || now, _pending: true });
    }
  }
}

// queue a change: it shows at once, and goes to the server when it can
export async function queue(op) {
  await load();
  op = { ...op, id: op.id || newId("op"), at: new Date().toISOString() };
  applyLocal(state.data, op);
  // a draft made offline and edited again offline is sent once, as its latest version
  const same = op.kind === "document.save" ? state.outbox.findIndex((o) => o.kind === "document.save" && o.docId === op.docId) : -1;
  if (same >= 0 && isLocal(op.docId)) state.outbox[same] = { ...op, id: state.outbox[same].id };
  else state.outbox.push(op);
  await persist();
  emit();
  sync();
  return op;
}

// ---------------------------------------------------------------- sync
let inflight = null;
export function sync() {
  if (inflight) return inflight;
  if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve();
  inflight = (async () => {
    state.syncing = true; emit();
    try {
      if (state.outbox.length) {
        const res = await fetch("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: state.outbox, ids: state.ids }), cache: "no-store" });
        if (res.status === 401) return signedOut();
        if (!res.ok) throw new Error(`sync ${res.status}`);
        const { results, ids } = await res.json();
        Object.assign(state.ids, ids || {});
        const keep = [];
        for (const op of state.outbox) {
          const r = results.find((x) => x.id === op.id);
          if (!r || r.retry) { keep.push(op); continue; }
          if (r.error) state.problems.unshift({ id: op.id, kind: op.kind, label: describe(op), error: r.error, at: new Date().toISOString() });
          else if (r.conflict) state.problems.unshift({ id: op.id, kind: op.kind, label: describe(op), error: r.message, at: new Date().toISOString(), info: true });
        }
        // later changes may point at things that now have real ids
        state.outbox = keep.map((op) => ({ ...op, docId: state.ids[op.docId] || op.docId, customerId: state.ids[op.customerId] || op.customerId, input: op.input ? { ...op.input, customer_id: state.ids[op.input.customer_id] || op.input.customer_id } : op.input }));
        state.problems = state.problems.slice(0, 30);
      }
      await pull();
    } catch { /* still offline, or the server is unreachable: try again later */ }
    finally { state.syncing = false; inflight = null; await persist(); emit(); }
  })();
  return inflight;
}

async function pull() {
  const res = await fetch("/api/offline/snapshot", { cache: "no-store" });
  if (res.status === 401) return signedOut();
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  const data = await res.json();
  if (state.data && state.data.userId !== data.userId) { state.outbox = []; state.ids = {}; state.problems = []; }
  // the server's copy, with anything still waiting replayed on top
  for (const op of state.outbox) applyLocal(data, op);
  state.data = data;
  state.lastSync = new Date().toISOString();
  state.signedOut = false;
}

function signedOut() { state.signedOut = true; }

export async function clearOffline() {
  state.data = null; state.outbox = []; state.ids = {}; state.problems = []; state.lastSync = null;
  try { const db = await idb(); await new Promise((res) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).clear(); tx.oncomplete = res; tx.onerror = res; }); } catch { /* nothing stored */ }
  emit();
}

export function dismissProblem(id) { state.problems = state.problems.filter((p) => p.id !== id); persist(); emit(); }

function describe(op) {
  const d = state.data?.documents.find((x) => x.id === op.docId);
  const name = d ? `${d.number} for ${d.customer_name}` : "a document";
  return { "document.save": `Saving ${name}`, "document.send": `Sending ${name}`, "payment.record": `Payment on ${name}`, "customer.save": `Customer ${op.form?.name || ""}` }[op.kind] || "A change";
}
