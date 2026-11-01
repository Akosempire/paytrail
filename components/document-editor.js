"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boxes, ClipboardPaste, LayoutTemplate, Truck, EyeOff, Plus, X, Trash2, Send, Save, UserPlus, Users, ChevronDown, Loader2, ShieldCheck, Eye, PencilLine, Check, CloudOff, CircleAlert } from "lucide-react";
import { DocPreview } from "@/components/doc-preview";
import { buildModel } from "@/lib/doc-model";
import { Button, Card, CardHeader, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { Modal, Switch, useToast } from "@/components/ui-client";
import { LayoutPanel } from "@/components/layout-panel";
import { DocPreview as TemplatePreview } from "@/components/doc-preview";
import { TEMPLATES, defaultLayout, resolveLayout } from "@/lib/doc-templates";
import { CURRENCIES, computeTotals, formatMoney, marginOf, minorToInput, toMinor } from "@/lib/money";
import { COST_CATEGORIES, formatDate } from "@/lib/format";
import { saveDocument } from "@/app/app/documents/actions";
import { PasteList } from "@/components/paste-list";
import { PostcodeField } from "@/components/postcode-field";
import { TrackOjaPicker } from "@/components/trackoja-picker";
import { CustomerPicker } from "@/components/customer-picker";
import { QuoteStudio, FoldRow } from "@/components/quote-studio";
import { TERM_CHIPS, VALIDITY_CHIPS, addDaysIso, daysBetween, dueSentence, evalQty, formatAmountInput, isEmail, missingStep, qtyValue, suggestEmail, unformatAmountInput } from "@/lib/builder-core";

// externalId: the TrackOja product a line came from ("Add from TrackOja")
const blankItem = () => ({ key: Math.random().toString(36).slice(2), description: "", details: "", quantity: "1", price: "", vat: "standard", externalId: null });
const blankCost = (c = {}) => ({ key: Math.random().toString(36).slice(2), label: c.label || "", category: c.category || "other", amount: c.amount_minor ? minorToInput(c.amount_minor) : "" });

// onSave/onSaved: used by offline mode, which saves to the device instead of the server
// pos: { store } when the business is connected to TrackOja POS (products can be added from it)
// recentIds / owes / suggestions: recent customers, what each still owes, items used before (optional; offline mode has none)
// guest: "Try it" on the website (no account): new customer only, kept on this device, Send asks them to sign up
export function DocumentEditor({ kind, doc, items: initialItems, costs: initialCosts, customers, presets, business, perms, emailReady, onSave, onSaved, pos, recentIds = [], owes = {}, suggestions = [], guest = false, userId = "", lead = null, extraTemplates = false }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const quote = kind === "quote";
  // each document can be in its own currency (the business default comes first);
  // the guest builder (/try) follows the "Your business" card instead
  const [pickedCurrency, setPickedCurrency] = useState(doc?.currency || business.currency);
  const currency = guest ? business.currency : pickedCurrency;
  // the template and paper, picked while the document is made (Templates in the preview);
  // a new document starts on the business's default for its kind
  const [look, setLook] = useState(() => {
    const base = doc?.template ? { template: doc.template, paper: doc.paper, layout: doc.layout || {} } : defaultLayout(business, kind);
    const r = resolveLayout({ kind, ...base }, business);
    return { template: r.template, paper: r.paper, layout: base.layout || {}, payment_instructions: doc?.payment_instructions || "" };
  });
  const [lookTouched, setLookTouched] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // the window opens at the top (the templates), not at the first text box further down
  useEffect(() => {
    if (!templatesOpen) return;
    const t = setTimeout(() => { const box = document.querySelector('[role="dialog"] .overflow-y-auto'); if (box) box.scrollTop = 0; document.querySelector('[role="dialog"] [aria-pressed="true"]')?.focus({ preventScroll: true }); }, 30);
    return () => clearTimeout(t);
  }, [templatesOpen]);
  const money = (v) => formatMoney(v, currency);

  const [customerMode, setCustomerMode] = useState(guest ? "new" : "existing"); // existing = search/pick; new = typing a new customer in
  const [customerId, setCustomerId] = useState(doc?.customer_id || "");
  const [customer, setCustomer] = useState({ name: "", company: "", email: "", phone: "", address: "", postcode: "", postcode_area: "", postcode_verified: false });
  // where the goods go (e.g. a WhatsApp order): address, postcode for the rider, who receives it
  const [delivery, setDelivery] = useState({ address: doc?.delivery_address || "", postcode: doc?.delivery_postcode || "", postcode_area: doc?.delivery_postcode_area || "", contact: doc?.delivery_contact || "" });
  const [deliveryOn, setDeliveryOn] = useState(Boolean(doc?.delivery_address || doc?.delivery_postcode));
  const [title, setTitle] = useState(doc?.title || "");
  const [issueDate, setIssueDate] = useState(doc?.issue_date || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState((quote ? doc?.valid_until : doc?.due_date) || addDays(quote ? business.quote_validity_days : business.invoice_due_days));
  const [items, setItems] = useState(initialItems?.length ? initialItems.map((i) => ({ key: i.id, description: i.description, details: i.details || "", quantity: String(Number(i.quantity)), price: minorToInput(i.unit_price_minor), vat: i.vat_category || "standard", externalId: i.external_product_id || null })) : [blankItem()]);
  const [inclusive, setInclusive] = useState(Boolean(doc?.prices_include_vat));
  const [costs, setCosts] = useState(initialCosts?.length ? initialCosts.map((c) => blankCost(c)) : []);
  const [discount, setDiscount] = useState(doc?.discount_minor ? minorToInput(doc.discount_minor) : "");
  const [taxRate, setTaxRate] = useState(String(doc?.tax_rate ?? business.tax_rate ?? 0));
  const [taxLabel, setTaxLabel] = useState(doc?.tax_label || business.tax_label || "VAT");
  // a second tax for places that charge two (Canada: GST + PST or QST)
  const [tax2Rate, setTax2Rate] = useState(String(doc?.tax2_rate ?? business.tax2_rate ?? 0));
  const [tax2Label, setTax2Label] = useState(doc?.tax2_label ?? business.tax2_label ?? "");
  const tax2On = Boolean(tax2Label) || Number(tax2Rate) > 0;
  const taxNames = tax2On ? `${taxLabel || "Tax"} + ${tax2Label || "tax"}` : taxLabel || "VAT";
  const [notes, setNotes] = useState(doc?.notes || "");
  const [terms, setTerms] = useState(doc?.terms ?? business.default_terms ?? "");
  const [emailCustomer, setEmailCustomer] = useState(emailReady);
  const [targetMargin, setTargetMargin] = useState("30");
  const [presetOpen, setPresetOpen] = useState(false);
  const [attempted, setAttempted] = useState(false); // red outlines only after a send attempt
  const [emailTouched, setEmailTouched] = useState(false);
  const [discountOn, setDiscountOn] = useState(Boolean(doc?.discount_minor));
  const [taxOn, setTaxOn] = useState(Number(doc?.tax_rate ?? business.tax_rate ?? 0) > 0 || Boolean(doc?.tax2_rate));
  const today = new Date().toISOString().slice(0, 10);

  const parsedItems = items.map((i) => ({ quantity: qtyValue(i.quantity), unit_price_minor: toMinor(i.price) || 0, vat_category: i.vat }));
  const totals = computeTotals(parsedItems, toMinor(discount) || 0, Number(taxRate) || 0, { inclusive, tax2Rate: tax2On ? Number(tax2Rate) || 0 : 0 });
  const mixedVat = items.some((i) => i.vat !== "standard");
  const costTotal = costs.reduce((s, c) => s + (toMinor(c.amount) || 0), 0);
  const revenue = totals.net; // what you earn before tax
  const { profit, pct } = marginOf(revenue, costTotal);
  const target = Math.min(95, Math.max(0, Number(targetMargin) || 0));
  const suggested = costTotal > 0 ? Math.ceil(costTotal / (1 - target / 100) / 100) * 100 : 0;
  const costsVisible = perms.canViewCosts;
  const needsApproval = perms.isJunior && business.require_approval;

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);
  const [view, setView] = useState("edit"); // phones: edit | preview
  // quote builder: rarely-changed parts are folded to one line (Details, Notes & terms)
  const [folds, setFolds] = useState({ details: false, notes: Boolean(doc?.notes) });
  const setFold = (k, v) => setFolds((f) => ({ ...f, [k]: v }));

  // live preview of what the customer will see, from the unsaved form
  const who = customerMode === "existing" ? selectedCustomer || {} : customer;
  const draftDoc = {
    ...(doc || {}), kind, number: doc?.number || (quote ? "New quotation" : "New invoice"), title, currency, status: doc?.status || "draft",
    issue_date: issueDate, due_date: quote ? null : endDate, valid_until: quote ? endDate : null,
    customer_name: who.name || "", customer_company: who.company || "", customer_email: who.email || "", customer_phone: who.phone || "", customer_address: who.address || "", customer_postcode: who.postcode || "",
    delivery_address: deliveryOn ? delivery.address : "", delivery_postcode: deliveryOn ? delivery.postcode : "", delivery_contact: deliveryOn ? delivery.contact : "",
    subtotal_minor: totals.subtotal, discount_minor: totals.discount, tax_rate: Number(taxRate) || 0, tax_label: taxLabel, tax2_rate: tax2On ? Number(tax2Rate) || 0 : 0, tax2_label: tax2On ? tax2Label : "", tax2_minor: totals.tax2, tax_minor: totals.tax, total_minor: totals.total, prices_include_vat: inclusive,
    amount_paid_minor: doc?.amount_paid_minor || 0, notes, terms, snapshot: null,
    template: look.template, paper: look.paper, layout: look.layout, payment_instructions: look.payment_instructions,
  };
  const draftItems = items.filter((i) => i.description.trim()).map((i) => ({ description: i.description, details: i.details, quantity: qtyValue(i.quantity), unit_price_minor: toMinor(i.price) || 0, vat_category: i.vat }));
  const deferred = useDeferredValue(JSON.stringify([draftDoc, draftItems]));
  const previewModel = useMemo(() => { const [d, its] = JSON.parse(deferred); return buildModel({ doc: d, items: its, business }); }, [deferred, business]);

  function setItem(key, patch) { setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i))); }
  // a list pasted from WhatsApp etc.: replaces empty rows, adds after the rest
  const [paste, setPaste] = useState(null); // null = closed, else the starting text
  // "Paste a WhatsApp order" from the ➕ opens straight into the list reader
  useEffect(() => { if (!doc?.id && new URLSearchParams(window.location.search).get("paste") === "1") setPaste(""); }, [doc?.id]);
  function addPasted(parsed) {
    const fresh = parsed.map((p) => ({ ...blankItem(), description: p.description.slice(0, 300), quantity: String(p.quantity), price: p.price == null ? "" : String(p.price) }));
    setItems((list) => [...list.filter((i) => i.description.trim() || i.price), ...fresh]);
    setPaste(null);
    toast.success(`${fresh.length} item${fresh.length === 1 ? "" : "s"} added. Check the prices before you send.`);
  }
  // pasting several lines into a description opens the list reader instead
  const onDescPaste = (e) => {
    const t = e.clipboardData?.getData("text") || "";
    if (t.split(/\r?\n/).filter((l) => l.trim()).length >= 2) { e.preventDefault(); setPaste(t); }
  };
  // a product from TrackOja: one more of it if it's already on the document
  const [posOpen, setPosOpen] = useState(false);
  function addFromTrackOja(p) {
    setItems((list) => {
      const same = list.find((i) => i.externalId === p.id);
      if (same) return list.map((i) => (i === same ? { ...i, quantity: String(Math.round((qtyValue(i.quantity) + 1) * 100) / 100) } : i));
      const line = { ...blankItem(), description: p.name.slice(0, 300), details: p.sku ? `SKU ${p.sku}` : "", price: minorToInput(p.price_minor), externalId: p.id };
      return [...list.filter((i) => i.description.trim() || i.price), line];
    });
  }
  function setCost(key, patch) { setCosts((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c))); }

  // ---- what's still missing, the input the server takes, saving -------------
  const badIdx = items.findIndex((i) => i.description.trim() && !Number.isFinite(toMinor(i.price)));
  const hasCustomer = customerMode === "existing" ? Boolean(customerId) : Boolean(customer.name.trim());
  const missing = missingStep({ hasCustomer, items, badPrice: badIdx >= 0 ? String(badIdx) : null, quote, approval: needsApproval });
  const missingField = missing?.step === "customer" && customerMode === "new" ? "cn" : missing?.field;
  const flag = (id) => attempted && missingField === id;
  const emailBad = customerMode === "new" && emailTouched && customer.email.trim() && !isEmail(customer.email);
  const emailHint = customerMode === "new" && emailTouched ? suggestEmail(customer.email) : null;

  function buildInput() {
    const input = {
      kind, title, issue_date: issueDate,
      ...(quote ? { valid_until: endDate } : { due_date: endDate }),
      discount_minor: toMinor(discount) || 0, tax_rate: Number(taxRate) || 0, tax_label: taxLabel, tax2_rate: tax2On ? Number(tax2Rate) || 0 : 0, tax2_label: tax2On ? tax2Label : "", notes, terms,
      items: items.filter((i) => i.description.trim()).map((i) => ({ description: i.description.trim(), details: i.details.trim(), quantity: qtyValue(i.quantity) || 1, unit_price_minor: toMinor(i.price) || 0, vat_category: i.vat, ...(i.externalId ? { external_product_id: i.externalId } : {}) })),
      prices_include_vat: inclusive,
      email_customer: emailCustomer,
    };
    if (!guest) input.currency = currency;
    if (!guest && lookTouched) input.look = look;
    input.delivery = deliveryOn ? { address: delivery.address, postcode: delivery.postcode, contact: delivery.contact } : { address: "", postcode: "", contact: "" };
    if (customerMode === "existing") input.customer_id = customerId;
    else input.customer = customer;
    if (costsVisible) input.costs = costs.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), category: c.category, amount_minor: toMinor(c.amount) || 0 }));
    return input;
  }

  function focusField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!quote || guest || doc?.id || window.matchMedia("(pointer: coarse)").matches) return;
    const t = setTimeout(() => document.getElementById(customerMode === "new" ? "cn" : "customer-search")?.focus({ preventScroll: true }), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- autosave -------------------------------------------------------------
  // Drafts already on the server save themselves there. New documents are kept
  // on this device until you save them (so no invoice number is used up), and
  // anything that can't reach the server is kept here too until it can.
  const snapKey = guest ? `usetally:try:builder:${kind}` : `usetally:builder:${kind}:${doc?.id || "new"}`;
  const serverAutosave = Boolean(doc?.id && !onSave && (doc.status || "draft") === "draft");
  const snapshot = JSON.stringify({ customerMode, customerId, customer, delivery, deliveryOn, currency: pickedCurrency, look: lookTouched ? look : null, title, issueDate, endDate, items, inclusive, costs, discount, taxRate, taxLabel, tax2Rate, tax2Label, notes, terms });
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | local | offline | unsaved
  const [retry, setRetry] = useState(0);
  const firstSnap = useRef(snapshot);
  const submitting = useRef(false);
  const latest = useRef({ missing, buildInput });
  latest.current = { missing, buildInput };

  const writeLocal = (snap) => { try { localStorage.setItem(snapKey, JSON.stringify({ at: Date.now(), snap })); return true; } catch { return false; } };
  const clearLocal = () => { try { localStorage.removeItem(snapKey); } catch { /* storage blocked */ } };

  // bring back work that wasn't saved to the server
  useEffect(() => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(snapKey) || "null"); } catch { saved = null; }
    if (!saved?.snap) return;
    let d;
    try { d = JSON.parse(saved.snap); } catch { return; }
    const worth = d.items?.some((i) => i.description?.trim() || i.price) || d.customerId || d.customer?.name?.trim();
    if (!worth || saved.snap === firstSnap.current) return;
    setCustomerMode(d.customerMode); setCustomerId(d.customerId || ""); setCustomer(d.customer); setDelivery(d.delivery); setDeliveryOn(d.deliveryOn);
    setTitle(d.title); setIssueDate(d.issueDate); setEndDate(d.endDate); setItems(d.items?.length ? d.items : [blankItem()]); setInclusive(d.inclusive); setCosts(d.costs || []);
    setDiscount(d.discount); setDiscountOn(Boolean(d.discount)); setTaxRate(d.taxRate); setTaxLabel(d.taxLabel); setTax2Rate(d.tax2Rate); setTax2Label(d.tax2Label); setNotes(d.notes); setTerms(d.terms); if (CURRENCIES.includes(d.currency)) setPickedCurrency(d.currency); if (d.look?.template) { setLook(d.look); setLookTouched(true); }
    toast.info(`We kept your unsaved ${quote ? "quotation" : "invoice"} on this device.`, { action: { label: "Discard it", onClick: () => { clearLocal(); window.location.reload(); } } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapKey]);

  useEffect(() => {
    const back = () => setRetry((n) => n + 1);
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);

  useEffect(() => {
    if (snapshot === firstSnap.current && retry === 0) return;
    if (submitting.current) return;
    setSaveState("saving");
    let alive = true;
    const t = setTimeout(async () => {
      if (!serverAutosave) { if (alive) setSaveState(writeLocal(snapshot) ? "local" : "unsaved"); return; }
      if (typeof navigator !== "undefined" && navigator.onLine === false) { writeLocal(snapshot); if (alive) setSaveState("offline"); return; }
      const { missing: m, buildInput: build } = latest.current;
      if (m) { writeLocal(snapshot); if (alive) setSaveState("unsaved"); return; }
      try {
        const res = await saveDocument(doc.id, build(), "draft");
        if (!alive) return;
        if (res?.error) { writeLocal(snapshot); setSaveState(navigator.onLine === false ? "offline" : "unsaved"); return; }
        clearLocal();
        setSaveState("saved");
      } catch {
        writeLocal(snapshot);
        if (alive) setSaveState(navigator.onLine === false ? "offline" : "unsaved");
      }
    }, serverAutosave ? 1500 : 600);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, retry]);

  function submit(intent) {
    if (badIdx >= 0) { setAttempted(true); focusField(`item-${badIdx}-price`); return toast.error(`Check the price for "${items[badIdx].description}".`); }
    const input = buildInput();
    submitting.current = true;
    start(async () => {
      const result = onSave ? await onSave(input, intent) : await saveDocument(doc?.id || null, input, intent);
      submitting.current = false;
      if (result?.error) {
        toast.error(result.error);
        if (result.id && !onSaved) { clearLocal(); router.push(`/app/documents/${result.id}`); }
        return;
      }
      clearLocal();
      if (onSaved) return onSaved(result.id, intent);
      toast.success(intent === "send" ? (emailCustomer && emailReady ? "Saved and emailed to your customer." : "Saved and marked as sent.") : intent === "submit" ? "Sent for approval." : "Draft saved.");
      router.push(`/app/documents/${result.id}${intent === "send" ? "?sent=1" : ""}`);
    });
  }

  // Send: if something's missing, the button says what and takes you there
  function send() {
    if (pending) return;
    if (missing) { setAttempted(true); setView("edit"); setTimeout(() => focusField(missingField), 0); return; }
    submit(needsApproval ? "submit" : "send");
  }
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); latest.current.send?.(); }
      else if (e.key === "Escape") setPresetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  latest.current.send = send;

  // ---- items ------------------------------------------------------------------
  const suggestionMap = useMemo(() => new Map(suggestions.map((x) => [x.description.toLowerCase(), x])), [suggestions]);
  const datalistId = `item-suggestions-${kind}`;
  function onDescChange(item, value) {
    const hit = suggestionMap.get(value.trim().toLowerCase());
    setItem(item.key, hit && !item.price && hit.unit_price_minor > 0 ? { description: value, price: formatAmountInput(minorToInput(hit.unit_price_minor)) } : { description: value });
  }
  function addRow(focus = true) {
    const fresh = blankItem();
    setItems((l) => [...l, fresh]);
    if (focus) setTimeout(() => focusField(`item-${items.length}-desc`), 0);
    return fresh;
  }
  // Enter in a row: next row's description, or a new row from the last one
  function onRowEnter(e, idx) {
    if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (idx === items.length - 1) addRow();
    else focusField(`item-${idx + 1}-desc`);
  }
  function removeItem(item, idx) {
    setItems((l) => (l.length > 1 ? l.filter((x) => x.key !== item.key) : [blankItem()]));
    if (!item.description.trim() && !item.price) return;
    toast.success("Item removed", { action: { label: "Undo", onClick: () => setItems((l) => {
      const rest = l.length === 1 && !l[0].description.trim() && !l[0].price ? [] : l;
      return [...rest.slice(0, idx), item, ...rest.slice(idx)];
    }) } });
  }
  function addShipping() {
    const at = items.findIndex((i) => /^(delivery|shipping)$/i.test(i.description.trim()));
    if (at >= 0) return focusField(`item-${at}-price`);
    const emptyAt = items.length === 1 && !items[0].description.trim() && !items[0].price ? 0 : items.length;
    setItems((l) => [...l.slice(0, emptyAt), { ...blankItem(), description: "Delivery" }]);
    setTimeout(() => focusField(`item-${emptyAt}-price`), 0);
  }

  // ---- the preview: click a part to edit it --------------------------------
  function onPreviewClick(e) {
    const part = e.target.closest?.(".pt-parties, .pt-lines, .pt-items, .pt-totals, .pt-blocks, .pt-meta, .pt-titleblock");
    if (!part) return;
    e.preventDefault();
    let id;
    if (part.matches(".pt-parties")) id = customerMode === "new" ? "cn" : customerId ? "customer-change" : "customer-search";
    else if (part.matches(".pt-lines, .pt-items")) {
      const row = e.target.closest("li, tbody tr");
      const rows = row ? [...part.querySelectorAll(row.tagName === "LI" ? ":scope > li" : "tbody tr")] : [];
      const n = Math.max(0, rows.indexOf(row));
      const filled = items.map((i, k) => (i.description.trim() ? k : -1)).filter((k) => k >= 0);
      id = `item-${filled[n] ?? 0}-desc`;
    } else if (part.matches(".pt-totals")) id = discountOn ? "discount" : "add-discount";
    else if (part.matches(".pt-blocks")) id = "notes";
    else id = "end";
    if (id === "end") setFold("details", true);
    if (id === "notes") setFold("notes", true);
    setView("edit");
    setTimeout(() => focusField(id), 0);
  }

  const termChips = quote ? VALIDITY_CHIPS : TERM_CHIPS;
  const termDays = daysBetween(issueDate, endDate);
  const statusText = { saving: "Saving…", saved: "Saved", local: "Saved on this device", offline: "Offline · changes will sync", unsaved: serverAutosave ? "Unsaved changes" : "Not saved yet" }[saveState];
  const sendLabel = missing ? missing.label : guest ? `Send ${quote ? "quote" : "invoice"}` : needsApproval ? "Submit for approval" : `Save & send ${quote ? "quote" : "invoice"}`;

  // ---- the pieces, laid out below as the classic editor (invoices) or the
  // three-column builder (components/quote-studio.js) for quotes and invoices,
  // and for the guest page on the website (/try), which has no costs column
  // and puts its "Your business" card (lead) at the top of the middle column
  const studio = true;
  const formatShortDate = (iso) => (iso ? formatDate(iso, { day: "numeric", month: "short" }) : "no date");
  const customerCard = (
        <Card id="customer-card" className="relative z-20" style={{ overflow: "visible" }}>
          <CardHeader title="Customer" icon={Users} actions={customerMode === "new" && customers.length > 0 && (
            <button type="button" onClick={() => { setCustomerMode("existing"); setTimeout(() => focusField("customer-search"), 0); }} className="inline-flex min-h-9 items-center text-[13px] font-medium text-brand-ink hover:underline">Choose an existing customer</button>
          )} />
          <div className="p-5">
            {customerMode === "existing" ? (
              <div className="flex flex-col gap-2">
                <label htmlFor="customer-search" className={cx("text-[13px] font-medium text-ink-2", customerId && "sr-only")}>Who is this for?</label>
                <CustomerPicker customers={customers} recentIds={recentIds} owes={owes} value={customerId} money={money}
                  onChange={setCustomerId} invalid={flag("customer-search")} describedBy={flag("customer-search") ? "customer-missing" : undefined}
                  onAddNew={(name) => { setCustomer((c) => ({ ...c, name })); setCustomerMode("new"); setTimeout(() => focusField("ce"), 0); }} />
                {flag("customer-search") && <p id="customer-missing" className="text-[12.5px] text-danger-ink">Choose who this is for, or type a new name.</p>}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="cn"><Input id="cn" value={customer.name} aria-invalid={flag("cn") || undefined} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} autoComplete="name" autoCapitalize="words" placeholder="Chioma Obi" className="h-12 text-[16px] sm:h-10 sm:text-sm" /></Field>
                <Field label="WhatsApp / phone" htmlFor="cp" optional><Input id="cp" type="tel" inputMode="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} autoComplete="tel" placeholder="0803 123 4567" className="h-12 text-[16px] sm:h-10 sm:text-sm" /></Field>
                <Field label="Email" htmlFor="ce" optional hint={emailBad || emailHint ? undefined : "To email them the document."} className="sm:col-span-2">
                  <Input id="ce" type="email" inputMode="email" autoCapitalize="none" value={customer.email} aria-invalid={emailBad || undefined} aria-describedby={emailBad || emailHint ? "ce-check" : undefined}
                    onChange={(e) => { setCustomer({ ...customer, email: e.target.value }); if (emailTouched && isEmail(e.target.value)) setEmailTouched(false); }}
                    onBlur={() => setEmailTouched(Boolean(customer.email.trim()))} autoComplete="email" placeholder="chioma@obifoods.ng" className="h-12 text-[16px] sm:h-10 sm:text-sm" />
                  {(emailBad || emailHint) && (
                    <p id="ce-check" className={cx("mt-1.5 text-[12.5px]", emailBad ? "text-danger-ink" : "text-ink-2")} aria-live="polite">
                      {emailBad && !emailHint && "That doesn't look like an email address."}
                      {emailHint && <>Did you mean <button type="button" onClick={() => { setCustomer((c) => ({ ...c, email: emailHint })); setEmailTouched(false); }} className="font-medium text-brand-ink underline underline-offset-2">{emailHint}</button>?</>}
                    </p>
                  )}
                </Field>
                <details className="group sm:col-span-2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-3.5 text-[14px] font-medium text-ink-2 ring-1 ring-line hover:bg-hover [&::-webkit-details-marker]:hidden">More details<span className="text-[12px] font-normal text-ink-3 group-open:hidden">Company, address, postcode</span></summary>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Company" htmlFor="cc" optional><Input id="cc" value={customer.company} onChange={(e) => setCustomer({ ...customer, company: e.target.value })} placeholder="Obi Foods Ltd" /></Field>
                    <Field label="Address" htmlFor="ca" optional><Input id="ca" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></Field>
                    <PostcodeField id="cpc" value={customer.postcode} onChange={(code, v) => setCustomer((c) => ({ ...c, postcode: code, postcode_area: v.area, postcode_verified: v.verified }))} />
                  </div>
                </details>
                {flag("cn") && <p className="text-[12.5px] text-danger-ink sm:col-span-2">Add your customer's name.</p>}
              </div>
            )}
          </div>
        </Card>
  );
  const deliveryCard = (
        <Card>
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-2 ring-1 ring-line"><Truck className="size-4" /></span>
              <div className="min-w-0"><p className="text-[15px] font-semibold text-ink">Delivery</p><p className="text-[13px] text-ink-3">{deliveryOn ? "Shown on the document for the dispatch rider." : "Add a delivery address with a checked postcode."}</p></div>
            </div>
            <Switch checked={deliveryOn} onChange={setDeliveryOn} label={<span className="sr-only">Add delivery address</span>} />
          </div>
          {deliveryOn && (
            <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
              <Field label="Deliver to" htmlFor="da" className="sm:col-span-2"><Textarea id="da" rows={2} value={delivery.address} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} placeholder="Plot 4, Admiralty Way, Lekki" /></Field>
              <PostcodeField id="dpc" value={delivery.postcode} area={delivery.postcode_area} verified={Boolean(doc?.delivery_postcode && doc?.delivery_postcode_area)} onChange={(code, v) => setDelivery((d) => ({ ...d, postcode: code, postcode_area: v.area }))} />
              <Field label="Receiver" htmlFor="dc" optional hint="Name and phone for the rider."><Input id="dc" value={delivery.contact} onChange={(e) => setDelivery({ ...delivery, contact: e.target.value })} placeholder="Tunde · 0803 000 0000" /></Field>
            </div>
          )}
        </Card>
  );
  const detailsBody = (
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Title" htmlFor="title" optional className="sm:col-span-3"><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={quote ? "Website redesign for Obi Foods" : "Monthly retainer — October"} /></Field>
            <Field label="Issue date" htmlFor="issue"><Input id="issue" type="date" value={issueDate} onChange={(e) => { const v = e.target.value; if (!v) return; setEndDate((d) => addDaysIso(v, daysBetween(issueDate, d))); setIssueDate(v); }} className="h-11 sm:h-10" /></Field>
            <Field label={quote ? "Valid until" : "Due date"} htmlFor="end"><Input id="end" type="date" value={endDate} onChange={(e) => e.target.value && setEndDate(e.target.value)} className="h-11 sm:h-10" /></Field>
            {guest
              ? <Field label="Currency" hint="Set it under Your business."><Input value={currency} disabled /></Field>
              : <Field label="Currency" htmlFor="doc-currency" hint={currency === business.currency ? "Your default. Pick another for this one only." : `This ${quote ? "quote" : "invoice"} only. Your default stays ${business.currency}.`}>
                  <Select id="doc-currency" value={currency} onChange={(e) => setPickedCurrency(e.target.value)} className="h-11 sm:h-10">
                    {[business.currency, ...CURRENCIES.filter((c) => c !== business.currency)].map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>}
            <div className="flex flex-col gap-2 sm:col-span-3">
              <p className="text-sm font-medium text-ink" aria-live="polite">{dueSentence(endDate, today, { quote, issueIso: issueDate })}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={quote ? "Valid for" : "Payment terms"}>
                {termChips.map(([n, label]) => (
                  <button key={n} type="button" aria-pressed={termDays === n} onClick={() => setEndDate(addDaysIso(issueDate, n))}
                    className={cx("inline-flex min-h-9 items-center rounded-full px-3 text-[13px] font-medium ring-1 transition-colors max-sm:min-h-11", termDays === n ? "bg-brand-soft text-brand-ink ring-brand-line/60" : "bg-surface text-ink-2 ring-line-strong hover:bg-hover")}>{label}</button>
                ))}
              </div>
            </div>
          </div>
  );
  const itemsCard = (
        <Card className="@container">
          <CardHeader title="Items" description="What your customer sees and pays for." />
          <div className="hidden grid-cols-[minmax(0,1fr)_80px_140px_120px_36px] gap-3 border-b border-line bg-subtle px-5 py-2 text-[12px] font-medium text-ink-3 @2xl:grid">
            <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span><span />
          </div>
          <ul className="divide-y divide-line">
            {items.map((item, idx) => {
              const line = Math.round(qtyValue(item.quantity) * (toMinor(item.price) || 0));
              return (
                <li key={item.key} className="grid gap-2.5 px-5 py-4 @2xl:grid-cols-[minmax(0,1fr)_80px_140px_120px_36px] @2xl:items-start @2xl:gap-3">
                  <div className="flex flex-col gap-2">
                    <Input id={`item-${idx}-desc`} aria-label={`Item ${idx + 1} description`} aria-invalid={flag(`item-${idx}-desc`) || undefined} list={suggestions.length ? datalistId : undefined} value={item.description} onPaste={onDescPaste} onKeyDown={(e) => onRowEnter(e, idx)} onChange={(e) => onDescChange(item, e.target.value)} placeholder="e.g. Brand identity design" className="h-11 text-[16px] sm:h-10 sm:text-sm" />
                    {item.externalId && (
                      <span className="inline-flex items-center gap-1.5 self-start text-[12px] font-medium text-brand-ink" title="Stock is deducted in TrackOja when this invoice is fully paid">
                        <Boxes className="size-3.5" />TrackOja product
                      </span>
                    )}
                    <Textarea aria-label={`Item ${idx + 1} details`} rows={1} value={item.details} onChange={(e) => setItem(item.key, { details: e.target.value })} placeholder="Details (optional)" className="min-h-9 text-[13px]" />
                    <label className="inline-flex items-center gap-1.5 self-start text-[12.5px] text-ink-3">
                      {taxLabel || "VAT"}
                      <select aria-label={`Item ${idx + 1} ${taxLabel || "VAT"}`} value={item.vat} onChange={(e) => setItem(item.key, { vat: e.target.value })}
                        className={`h-7 rounded-md bg-surface px-1.5 text-[12.5px] ring-1 ring-line-strong ${item.vat === "standard" ? "text-ink-2" : "font-medium text-brand-ink"}`}>
                        <option value="standard">Standard ({(Number(taxRate) || 0) + (tax2On ? Number(tax2Rate) || 0 : 0)}%)</option><option value="zero">Zero-rated (0%)</option><option value="exempt">Exempt</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2.5 @2xl:contents">
                    <div className="relative">
                      <Input id={`item-${idx}-qty`} aria-label={`Item ${idx + 1} quantity`} inputMode="decimal" title="You can type sums like 3*8" value={item.quantity} onKeyDown={(e) => onRowEnter(e, idx)}
                        onChange={(e) => setItem(item.key, { quantity: e.target.value.replace(/[^\d.+\-*/()x×÷ ]/gi, "").slice(0, 40) })}
                        onBlur={() => { const v = evalQty(item.quantity); setItem(item.key, { quantity: v != null && v > 0 ? String(v) : "1" }); }}
                        className="h-11 text-right text-[16px] tabular sm:h-10 sm:text-sm" />
                      {/[+\-*/x×÷(]/i.test(item.quantity.replace(/^-/, "")) && evalQty(item.quantity) != null && <span className="pointer-events-none absolute -bottom-4 right-1 text-[11px] text-ink-3 tabular" aria-live="polite">= {evalQty(item.quantity)}</span>}
                    </div>
                    <Input id={`item-${idx}-price`} aria-label={`Item ${idx + 1} unit price`} aria-invalid={(attempted && badIdx === idx) || undefined} inputMode="decimal" value={item.price} onKeyDown={(e) => onRowEnter(e, idx)}
                      onFocus={() => setItem(item.key, { price: unformatAmountInput(item.price) })} onBlur={() => setItem(item.key, { price: formatAmountInput(item.price) })}
                      onChange={(e) => setItem(item.key, { price: e.target.value })} placeholder="0.00" className="h-11 text-right text-[16px] tabular sm:h-10 sm:text-sm" />
                  </div>
                  <div className="flex items-center justify-between @2xl:block @2xl:pt-2.5 @2xl:text-right">
                    <span className="text-[13px] text-ink-3 @2xl:hidden">Amount</span>
                    <span className="font-medium text-ink tabular">{money(line)}</span>
                  </div>
                  <button type="button" onClick={() => removeItem(item, idx)} aria-label={`Remove item ${idx + 1}${item.description ? ` (${item.description})` : ""}`}
                    className="inline-flex size-11 items-center justify-center justify-self-end rounded-md text-ink-3 hover:bg-danger-soft hover:text-danger-ink @2xl:size-9">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {suggestions.length > 0 && <datalist id={datalistId}>{suggestions.map((x) => <option key={x.description} value={x.description} />)}</datalist>}
          {flag(`item-0-desc`) && <p className="px-5 pb-3 text-[12.5px] text-danger-ink">Add at least one item with a description.</p>}
          <div className="flex flex-col gap-5 border-t border-line p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={Plus} onClick={() => addRow()}>Add item</Button>
              <Button size="sm" icon={ClipboardPaste} onClick={() => setPaste("")}>Paste list</Button>
              {pos && <Button size="sm" icon={Boxes} onClick={() => setPosOpen(true)}>Add from TrackOja</Button>}
            </div>
            {pos && <TrackOjaPicker open={posOpen} onClose={() => setPosOpen(false)} onPick={addFromTrackOja} currency={currency} store={pos.store} />}
            <PasteList open={paste !== null} initialText={paste || ""} onClose={() => setPaste(null)} onAdd={addPasted} currency={currency} />
            <dl className="w-full max-w-xs space-y-2.5 text-sm">
              <Row label="Subtotal" value={money(totals.subtotal)} />
              {discountOn && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-1 text-ink-2">Discount
                    <button type="button" aria-label="Remove discount" onClick={() => { setDiscount(""); setDiscountOn(false); }} className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-tray hover:text-ink"><X className="size-3.5" /></button>
                  </dt>
                  <dd><Input id="discount" aria-label="Discount amount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)}
                    onFocus={() => setDiscount(unformatAmountInput(discount))} onBlur={() => setDiscount(formatAmountInput(discount))} placeholder="0.00" className="h-9 w-32 text-right tabular" /></dd>
                </div>
              )}
              {taxOn && <>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-ink-2">
                  <input aria-label="Tax name" value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} className="w-12 rounded border-0 bg-transparent p-0 text-sm text-ink-2 focus:ring-0" />
                  <input id="tax-rate" aria-label="Tax rate" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value.replace(/[^\d.]/g, ""))} className="h-7 w-14 rounded-sm px-1.5 text-right text-sm ring-1 ring-line-strong" />%
                </dt>
                <dd className="tabular text-ink">{money(totals.tax1)}</dd>
              </div>
              {tax2On ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-ink-2">
                    <input aria-label="Second tax name" value={tax2Label} onChange={(e) => setTax2Label(e.target.value)} placeholder="PST" className="w-12 rounded border-0 bg-transparent p-0 text-sm text-ink-2 focus:ring-0" />
                    <input aria-label="Second tax rate" value={tax2Rate} onChange={(e) => setTax2Rate(e.target.value.replace(/[^\d.]/g, ""))} className="h-7 w-14 rounded-sm px-1.5 text-right text-sm ring-1 ring-line-strong" />%
                    <button type="button" aria-label="Remove second tax" onClick={() => { setTax2Label(""); setTax2Rate("0"); }} className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-tray hover:text-ink"><X className="size-3.5" /></button>
                  </dt>
                  <dd className="tabular text-ink">{money(totals.tax2)}</dd>
                </div>
              ) : (
                <button type="button" onClick={() => setTax2Label("Tax 2")} className="-mt-1 text-[12.5px] font-medium text-brand-ink hover:underline">+ Add another tax</button>
              )}
              </>}
              {(!discountOn || !taxOn) && <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium text-brand-ink">
                {!discountOn && <button id="add-discount" type="button" onClick={() => { setDiscountOn(true); setTimeout(() => focusField("discount"), 0); }} className="min-h-9 hover:underline">+ Add discount</button>}
                {!taxOn && <button type="button" onClick={() => { setTaxOn(true); if (!Number(taxRate) && Number(business.tax_rate) > 0) setTaxRate(String(business.tax_rate)); setTimeout(() => focusField("tax-rate"), 0); }} className="min-h-9 hover:underline">+ Add {taxLabel || "tax"}</button>}
                <button type="button" onClick={addShipping} className="min-h-9 hover:underline">+ Add shipping</button>
              </div>}
              {discountOn && taxOn && <button type="button" onClick={addShipping} className="min-h-9 text-[13px] font-medium text-brand-ink hover:underline">+ Add shipping</button>}
              {taxOn && <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                Prices already include {taxNames}
              </label>}
              {(inclusive || mixedVat) && <p className="text-[12px] text-ink-3">{inclusive ? `${money(totals.tax)} of the total is ${taxNames}. ` : ""}{mixedVat ? `${taxLabel || "VAT"} only on standard-rated items.` : ""}</p>}
              <div className="flex items-center justify-between border-t border-line pt-3">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="text-title-2 text-ink tabular">{money(totals.total)}</dd>
              </div>
            </dl>
          </div>
        </Card>
  );
  const notesBody = (
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Notes to customer" htmlFor="notes" optional><Textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thanks for the opportunity! Timeline: 3 weeks from deposit." /></Field>
            <Field label="Terms" htmlFor="terms" optional><Textarea id="terms" rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
          </div>
  );
  // Costs & profit, kept calm: profit first in one big number, one line of
  // detail, one line of pricing advice, then the costs as compact rows
  const costsHead = (
            <div className="flex items-center justify-between gap-3 px-5 pt-4">
              <h3 className="text-title-3 text-ink">Costs & profit</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-soft px-2 py-0.5 text-[11.5px] font-medium text-violet-ink" title="Only your team sees this. It's never shown to the customer."><EyeOff className="size-3" aria-hidden="true" />Team only</span>
            </div>
  );
  const marginText = revenue > 0 ? `${Math.round(pct)}%` : "—";
  const costsSummary = (
            <div className="px-5 pt-3 pb-4">
              <p className="text-[12px] text-ink-3">Profit</p>
              <div className="flex items-baseline justify-between gap-3">
                <p className={cx("text-[24px] font-semibold leading-tight tracking-tight tabular", profit < 0 ? "text-danger-ink" : costTotal > 0 || revenue > 0 ? "text-success-ink" : "text-ink")}>{money(profit)}</p>
                <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-semibold tabular", revenue <= 0 ? "bg-subtle text-ink-3" : pct < 0 ? "bg-danger-soft text-danger-ink" : pct < 15 ? "bg-warn-soft text-warn-ink" : "bg-success-soft text-success-ink")} title="Margin">{marginText}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true"><div className={cx("h-full rounded-full transition-all", pct < 0 ? "bg-danger" : pct < 15 ? "bg-warn" : "bg-success")} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
              <p className="mt-2 text-[12.5px] text-ink-3 tabular">{money(revenue)} price before {taxLabel || "tax"} − {money(costTotal)} costs</p>
              {costTotal > 0 && (
                <p className={cx("mt-2 text-[12.5px]", revenue < suggested ? (profit < 0 ? "text-danger-ink" : "text-warn-ink") : "text-success-ink")}>
                  {profit < 0 && <span className="font-medium">You'd lose money. </span>}
                  For a{" "}
                  <input aria-label="Target margin, percent" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value.replace(/[^\d.]/g, "").slice(0, 4))}
                    className="h-6 w-9 rounded-sm bg-surface px-1 text-center text-[12.5px] text-ink ring-1 ring-line-strong focus:outline-none focus:ring-brand tabular" />
                  % margin, charge at least <span className="font-semibold tabular">{money(suggested)}</span>{revenue >= suggested && " ✓"}
                </p>
              )}
            </div>
  );
  const costsList = (
            <ul className="flex flex-col gap-2.5 border-t border-line px-5 py-3">
              {costs.length === 0 && <li className="text-[13px] text-ink-3">Add what this job costs you (data, fuel, transport, software…) to see your real profit.</li>}
              {costs.map((c) => (
                <li key={c.key}>
                  <div className="flex items-center gap-1.5">
                    <Input aria-label="Cost name" value={c.label} onChange={(e) => setCost(c.key, { label: e.target.value })} placeholder="e.g. Data subscription" className="h-9 min-w-0 flex-1" />
                    <input aria-label="Cost amount" inputMode="decimal" value={c.amount} onChange={(e) => setCost(c.key, { amount: e.target.value })} placeholder="0"
                      className="h-9 w-24 shrink-0 rounded-md bg-surface px-2.5 text-right text-[13px] tabular ring-1 ring-inset ring-line-strong focus:ring-brand focus:outline-none" />
                    <button type="button" onClick={() => setCosts((l) => l.filter((x) => x.key !== c.key))} aria-label="Remove cost" className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-danger-soft hover:text-danger-ink"><Trash2 className="size-4" /></button>
                  </div>
                  <select aria-label="Cost category" value={c.category} onChange={(e) => setCost(c.key, { category: e.target.value })}
                    style={{ width: "auto", fieldSizing: "content" }}
                    className="mt-0.5 -ml-0.5 inline-block max-w-full cursor-pointer rounded bg-transparent py-0.5 pr-1 text-[12px] text-ink-3 hover:text-ink focus:outline-none focus-visible:shadow-[var(--shadow-focus)]">
                    {Object.entries(COST_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </li>
              ))}
            </ul>
  );
  const costsAdd = (
            <div className="relative flex gap-1 px-4 pb-3">
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => setCosts((l) => [...l, blankCost()])}>Add cost</Button>
              {presets.length > 0 && (
                <>
                  <Button size="sm" variant="ghost" iconRight={ChevronDown} onClick={() => setPresetOpen(!presetOpen)}>From presets</Button>
                  {presetOpen && (
                    <div className="absolute bottom-full left-5 z-20 mb-1 w-64 animate-rise rounded-xl bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-line">
                      {presets.map((p) => (
                        <button key={p.id} type="button" onClick={() => { setCosts((l) => [...l, blankCost(p)]); setPresetOpen(false); }}
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-hover">
                          <span className="truncate">{p.label}</span><span className="shrink-0 text-ink-3 tabular">{money(p.amount_minor)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
  );
  // the pricing advice now lives in one line under the profit (costsSummary)
  const costsHelper = null;
  const summaryCard = (
          <Card>
            <CardHeader title="Summary" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <Row label="Subtotal" value={money(totals.subtotal)} />
              <Row label="Total" value={money(totals.total)} strong />
            </dl>
          </Card>
  );
  const approvalNote = (
        needsApproval && (
          <div className="flex gap-2.5 rounded-xl bg-violet-soft p-4 text-[13px] text-violet-ink ring-1 ring-inset ring-violet/25">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />A manager or finance officer approves your drafts before they reach the customer.
          </div>
        )
  );
  const footerBar = (
      <div className={cx("fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur", !guest && "lg:left-[var(--sidebar-w,240px)]")}>
        {/* phones: total on top, two equal buttons, clear of the home bar; problems show as toasts */}
        <div className={cx("mx-auto flex flex-wrap items-center gap-2.5 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:gap-3 sm:px-6 sm:pb-3 lg:px-8", studio ? "max-w-[1760px]" : "max-w-[1200px]")}>
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <p className="text-[13px] text-ink-3"><span className="text-[15px] font-semibold text-ink tabular sm:text-[13px]">{money(totals.total)}</span> total{costsVisible && costTotal > 0 && <> · <span className={profit < 0 ? "text-danger-ink" : "text-success-ink"}>{money(profit)} profit</span></>}</p>
              <p className="inline-flex items-center gap-1 text-[12px] text-ink-3" role="status" aria-live="polite">
                {saveState === "saving" && <Loader2 className="size-3 animate-spin" aria-hidden />}
                {(saveState === "saved" || saveState === "local") && <Check className="size-3 text-success-ink" aria-hidden />}
                {saveState === "offline" && <CloudOff className="size-3" aria-hidden />}
                {saveState === "unsaved" && <CircleAlert className="size-3 text-warn-ink" aria-hidden />}
                {doc?.number ? doc.number : "Draft"}{statusText ? ` · ${statusText}` : ""}
              </p>
            </div>
          </div>
          {!needsApproval && emailReady && (
            <label className="hidden items-center gap-2 text-[13px] text-ink-2 sm:flex">
              <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />Email to customer
            </label>
          )}
          {!guest && <Button variant="secondary" icon={pending ? Loader2 : Save} loading={pending} onClick={() => submit("draft")} className="h-12 flex-1 sm:h-10 sm:flex-none">Save draft</Button>}
          <Button variant="primary" icon={missing ? null : needsApproval ? ShieldCheck : Send} disabled={pending} onClick={send} aria-keyshortcuts="Control+Enter Meta+Enter"
            title={missing ? undefined : "Ctrl/⌘ + Enter"} className="h-12 flex-[1.6] sm:h-10 sm:flex-none">{sendLabel}</Button>
        </div>
      </div>
  );

  // Templates: pick how this document looks while making it; the preview follows
  const templatesButton = !guest && (
    <button type="button" onClick={() => setTemplatesOpen(true)} title="Choose the template and paper for this document"
      className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-ink-2 ring-1 ring-inset ring-line hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">
      <LayoutTemplate className="size-3.5" aria-hidden="true" />Templates<span className="text-ink-3">· {TEMPLATES[look.template]?.name}</span>
    </button>
  );
  const templatesModal = !guest && (
    <Modal open={templatesOpen} onClose={() => setTemplatesOpen(false)} size="lg" title="Templates"
      description={`How this ${quote ? "quotation" : "invoice"} looks. It's saved with it and used for the PDF, the print and the email.`}
      footer={<Button variant="primary" onClick={() => setTemplatesOpen(false)}>Done</Button>}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
        <LayoutPanel kind={kind} value={look} onChange={(v) => { setLook(v); setLookTouched(true); }} brandColor={business.brand_color} extraTemplates={extraTemplates} idPrefix="bt" />
        <div className="hidden rounded-xl bg-tray p-2 md:block md:self-start md:sticky md:top-0"><TemplatePreview model={previewModel} label="Template preview" /></div>
      </div>
    </Modal>
  );

  if (studio) {
    return (
      <QuoteStudio userId={userId || (guest ? "guest" : "")} view={view} setView={setView} costsVisible={costsVisible} profit={profit} pct={pct} revenue={revenue} money={money}
        previewModel={previewModel} onPreviewClick={onPreviewClick} folds={folds} setFold={setFold}
        costs={<>{costsHead}{costsSummary}{costsList}{costsAdd}{costsHelper}</>}
        quote={<>
          {lead}
          {customerCard}
          {itemsCard}
          <FoldRow id="details" title="Details" value={`${title ? `${title} · ` : ""}${quote ? "Valid to" : "Due"} ${formatShortDate(endDate)} · ${currency}`} open={folds.details} onToggle={(v) => setFold("details", v)}>{detailsBody}</FoldRow>
          {deliveryCard}
          <FoldRow id="notes" title="Notes & terms" value={notes || terms ? [notes && "Note", terms && "Terms"].filter(Boolean).join(" and ") + " added" : "None yet"} open={folds.notes} onToggle={(v) => setFold("notes", v)}>{notesBody}</FoldRow>
          {approvalNote}
        </>}
        footer={<>{footerBar}{templatesModal}</>} label={quote ? "Quote" : "Invoice"} templates={templatesButton} />
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-40 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="sticky top-16 z-10 -mx-4 -mt-2 bg-canvas/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden" role="tablist" aria-label="Editor view">
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-tray p-1">
          {[["edit", "Edit", PencilLine], ["preview", "Preview", Eye]].map(([v, l, Icon]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cx("inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]", view === v ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3")}>
              <Icon className="size-4" />{l}
            </button>
          ))}
        </div>
      </div>
      {view === "preview" && (
        <div className="flex min-w-0 flex-col gap-2 lg:hidden">
          <div className="rounded-2xl bg-tray p-2 [&_.pt-parties]:cursor-pointer [&_.pt-items]:cursor-pointer [&_.pt-lines]:cursor-pointer [&_.pt-totals]:cursor-pointer [&_.pt-blocks]:cursor-pointer [&_.pt-meta]:cursor-pointer" onClickCapture={onPreviewClick}><DocPreview model={previewModel} label="Live preview" /></div>
          <p className="text-center text-[12px] text-ink-3">Tap any part to edit it.</p>
        </div>
      )}
      <div className={cx("flex min-w-0 flex-col gap-6", view === "preview" && "max-lg:hidden")}>
        {customerCard}
        {deliveryCard}
        <Card>
          <CardHeader title={quote ? "Quotation details" : "Invoice details"} description={doc?.number ? `Number ${doc.number}` : "Numbered automatically when saved"} />
          {detailsBody}
        </Card>
        {itemsCard}
        <Card>
          <CardHeader title="Notes & terms" description="Shown at the bottom of the document." />
          {notesBody}
        </Card>
      </div>

      <aside className={cx("flex flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto lg:pb-2 [&>*]:shrink-0", view === "preview" && "max-lg:hidden")}>
        {costsVisible ? (
          <Card className="ring-violet/30">
            {costsHead}{costsList}{costsAdd}{costsSummary}{costsHelper}
          </Card>
        ) : summaryCard}
        <Card className="hidden lg:block">
          <CardHeader title="Live preview" icon={Eye} description="What your customer will see. Click any part to edit it." />
          <div className="bg-tray p-3 [&_.pt-parties]:cursor-pointer [&_.pt-items]:cursor-pointer [&_.pt-lines]:cursor-pointer [&_.pt-totals]:cursor-pointer [&_.pt-blocks]:cursor-pointer [&_.pt-meta]:cursor-pointer" onClickCapture={onPreviewClick}><DocPreview model={previewModel} label="Live preview" /></div>
        </Card>
        {approvalNote}
      </aside>

      {footerBar}
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-medium text-ink" : "text-ink-2"}>{label}</dt>
      <dd className={cx("tabular", strong ? "font-semibold text-ink" : "text-ink")}>{value}</dd>
    </div>
  );
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}
