import "server-only";
import { after } from "next/server";
import * as z from "zod";
import { friendlyError } from "@/lib/context";
import { can } from "@/lib/permissions";
import { emailConfigured } from "@/lib/email";
import { canWrite } from "@/lib/ai/oauth-core";
import {
  OPEN, UUID, buildPayload, docLine, docView, links, money, pickCustomer, statusFilter, sumByCurrency, toMinorAmount, today,
} from "@/lib/ai/tools-core";

// What ChatGPT, Claude and Grok can do in Usetally. Every change goes through
// the app's own database actions as the person who connected the assistant
// (mcp_as_user), so roles, approvals and plan limits apply exactly as in the
// app. Reads are always limited to the connected business.

const DOC_COLUMNS = "id, kind, number, title, status, customer_id, customer_name, customer_company, customer_email, customer_phone, currency, issue_date, due_date, valid_until, subtotal_minor, discount_minor, tax_rate, tax_label, tax_minor, total_minor, amount_paid_minor, notes, terms, access_token, converted_invoice_id, source_quote_id, updated_at";

// work that finishes after the reply (emails, stock): after() inside a request,
// straight away anywhere else (tests, scripts)
function later(fn) {
  try { after(fn); } catch { Promise.resolve().then(fn).catch(() => null); }
}

const text = (s) => ({ content: [{ type: "text", text: s }] });
const result = (summary, data) => ({ content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data });
const fail = (s) => ({ content: [{ type: "text", text: s }], isError: true });

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const customerShape = z.object({
  id: z.string().optional().describe("An existing customer's id from find_customers. Leave out to use a name."),
  name: z.string().max(120).optional().describe("Customer's name. An existing customer with exactly this name or email is reused."),
  company: z.string().max(120).optional(),
  email: z.string().max(200).optional().describe("Needed to email the document to them."),
  phone: z.string().max(40).optional(),
  address: z.string().max(500).optional(),
}).describe("Who the document is for.");
const itemShape = z.object({
  description: z.string().min(1).max(300).describe("What it is, e.g. \"Logo design\"."),
  quantity: z.number().positive().default(1),
  unit_price: z.union([z.number(), z.string()]).optional().describe("Price for one, in the document's currency as a normal amount (150000 means ₦150,000, not kobo). Leave out when using product_id."),
  details: z.string().max(1000).optional().describe("A second line under the description."),
  vat: z.enum(["standard", "zero", "exempt"]).optional().describe("Only for VAT-registered businesses: zero-rated or exempt items."),
  product_id: z.string().optional().describe("A product from find_products; its name and price are used unless given."),
});
const docFields = {
  items: z.array(itemShape).min(1).max(200),
  title: z.string().max(200).optional().describe("Optional heading, e.g. \"Website redesign\"."),
  currency: z.string().length(3).optional().describe("3-letter code (NGN, USD, GBP…). Leave out for the business's usual currency."),
  discount: z.union([z.number(), z.string()]).optional().describe("A discount off the total, as an amount."),
  tax_rate: z.number().min(0).max(100).optional().describe("Tax percentage. Leave out to use the business's usual tax."),
  tax_label: z.string().max(30).optional(),
  notes: z.string().max(2000).optional().describe("A note shown to the customer."),
  terms: z.string().max(2000).optional().describe("Payment terms. Leave out for the business's usual terms."),
};
const docRef = z.string().min(1).describe("The document's number (e.g. INV-0042, QT-0007) or id.");

export function registerTools(server, ctx) {
  const { service, userId, business, member, scope, site } = ctx;
  const asUser = async (fn, args) => {
    const { data, error } = await service.rpc("mcp_as_user", { uid: userId, fn, args });
    return error ? { error: friendlyError(error) } : { data };
  };
  const findDoc = async (ref) => {
    const r = String(ref || "").trim();
    let q = service.from("documents").select(DOC_COLUMNS).eq("business_id", business.id);
    q = UUID.test(r) ? q.eq("id", r) : q.ilike("number", r.replace(/[%_\\]/g, ""));
    const { data } = await q.limit(1).maybeSingle();
    return data;
  };
  const itemsOf = async (id) => (await service.from("document_items").select("description, details, quantity, unit_price_minor, vat_category, sort_order").eq("document_id", id).eq("business_id", business.id).order("sort_order")).data || [];
  const notFound = (ref) => fail(`No quote or invoice "${ref}" in ${business.name}. Use list_documents to find it.`);
  const showCosts = can(member, "costs.view");

  // ---------------------------------------------------------------- read
  server.registerTool("get_business_overview", {
    title: "Business overview",
    description: `What's happening in ${business.name}: money owed, overdue invoices, payments this month, quotes waiting for an answer, drafts, and whether it can send. Start here when asked how the business is doing.`,
    inputSchema: {}, annotations: READ,
  }, async () => {
    const t = today();
    const monthStart = `${t.slice(0, 8)}01`;
    const [{ data: open }, { data: paidRows }, { data: quotes }, { count: drafts }, allowance] = await Promise.all([
      service.from("documents").select("currency, total_minor, amount_paid_minor, due_date").eq("business_id", business.id).eq("kind", "invoice").in("status", OPEN).limit(5000),
      service.from("payments").select("currency, amount_minor").eq("business_id", business.id).gte("paid_at", monthStart).limit(5000),
      service.from("documents").select("id").eq("business_id", business.id).eq("kind", "quote").in("status", ["sent", "viewed"]).limit(1000),
      service.from("documents").select("id", { count: "exact", head: true }).eq("business_id", business.id).in("status", ["draft", "pending_approval"]),
      asUser("business_allowance", { target: business.id }),
    ]);
    const owed = (r) => Number(r.total_minor) - Number(r.amount_paid_minor || 0);
    const overdue = (open || []).filter((r) => r.due_date && r.due_date < t);
    const a = allowance.data || {};
    const data = {
      business: business.name, your_role: member.role, assistant_access: canWrite(scope) ? "full" : "view only", usual_currency: business.currency,
      owed_to_you: sumByCurrency(open || [], owed), unpaid_invoices: (open || []).length,
      overdue: sumByCurrency(overdue, owed), overdue_invoices: overdue.length,
      received_this_month: sumByCurrency(paidRows || [], (r) => Number(r.amount_minor)),
      quotes_waiting_for_answer: (quotes || []).length, drafts: drafts || 0,
      can_send: a.allowed !== false, ...(a.allowed === false ? { why_not: friendlyError({ message: `ALLOWANCE:${a.reason}` }) } : {}),
      ...(a.limit != null && a.used != null ? { plan_usage: `${a.used} of ${a.limit} documents this month` } : {}),
    };
    return result(`${business.name}: ${data.owed_to_you} owed across ${data.unpaid_invoices} unpaid invoices (${data.overdue_invoices} overdue).`, data);
  });

  server.registerTool("list_documents", {
    title: "List quotes and invoices",
    description: "Find quotes and invoices, newest first. Filter by kind, status (unpaid and overdue included) or customer.",
    inputSchema: {
      kind: z.enum(["quote", "invoice", "all"]).default("all"),
      status: z.enum(["all", "draft", "awaiting_approval", "sent", "viewed", "accepted", "declined", "unpaid", "overdue", "partially_paid", "paid", "void"]).default("all"),
      customer: z.string().max(120).optional().describe("Part of the customer's name or company."),
      limit: z.number().int().min(1).max(50).default(10),
    },
    annotations: READ,
  }, async ({ kind, status, customer, limit }) => {
    const t = today();
    let q = service.from("documents").select(DOC_COLUMNS).eq("business_id", business.id);
    if (kind && kind !== "all") q = q.eq("kind", kind);
    const f = statusFilter(status, t);
    if (f.eq) q = q.eq("status", f.eq);
    if (f.in) q = q.in("status", f.in);
    if (f.dueBefore) q = q.eq("kind", "invoice").lt("due_date", f.dueBefore);
    if (customer) {
      const c = customer.replace(/[%_\\,()]/g, " ").trim();
      if (c) q = q.or(`customer_name.ilike.%${c}%,customer_company.ilike.%${c}%`);
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit || 10);
    if (error) return fail("Couldn't read your documents. Try again.");
    if (!data.length) return text("Nothing matches.");
    return result(data.map((d) => docLine(d, t)).join("\n"), { documents: data.map((d) => ({ id: d.id, number: d.number, kind: d.kind, customer: d.customer_name, total: money(d.total_minor, d.currency), status: d.status, due_date: d.due_date, valid_until: d.valid_until, links: links(site, d) })) });
  });

  server.registerTool("get_document", {
    title: "Get a quote or invoice",
    description: "Everything on one quote or invoice: items, totals, what's been paid, and its links (the customer's link and PDF once it's sent).",
    inputSchema: { document: docRef }, annotations: READ,
  }, async ({ document }) => {
    const doc = await findDoc(document);
    if (!doc) return notFound(document);
    const [items, { data: payments }, costs] = await Promise.all([
      itemsOf(doc.id),
      service.from("payments").select("amount_minor, currency, method, reference, paid_at").eq("document_id", doc.id).eq("business_id", business.id).order("paid_at"),
      showCosts ? service.from("document_costs").select("label, amount_minor").eq("document_id", doc.id).eq("business_id", business.id).then((r) => r.data || []) : Promise.resolve(null),
    ]);
    const v = docView(site, doc, items, { payments: payments || [], costs });
    return result(docLine(doc), v);
  });

  server.registerTool("find_customers", {
    title: "Find customers",
    description: "Search the business's saved customers by name, company, email or phone.",
    inputSchema: { query: z.string().max(120).optional(), limit: z.number().int().min(1).max(50).default(10) }, annotations: READ,
  }, async ({ query, limit }) => {
    let q = service.from("customers").select("id, name, company, email, phone, address").eq("business_id", business.id).is("archived_at", null);
    const s = String(query || "").replace(/[%_\\,()]/g, " ").trim();
    if (s) q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    const { data } = await q.order("name").limit(limit || 10);
    if (!data?.length) return text(s ? `No saved customer matches "${s}". You can still create a document with a new customer's name.` : "No saved customers yet.");
    return result(data.map((c) => `${c.name}${c.company ? ` (${c.company})` : ""}${c.email ? ` · ${c.email}` : ""}`).join("\n"), { customers: data });
  });

  server.registerTool("find_products", {
    title: "Find products and services",
    description: "Search the business's price list (saved products and services) to use their names and prices on documents.",
    inputSchema: { query: z.string().max(120).optional(), limit: z.number().int().min(1).max(50).default(20) }, annotations: READ,
  }, async ({ query, limit }) => {
    let q = service.from("products").select("id, name, description, unit, unit_price_minor, vat_category").eq("business_id", business.id).is("archived_at", null);
    const s = String(query || "").replace(/[%_\\,()]/g, " ").trim();
    if (s) q = q.or(`name.ilike.%${s}%,description.ilike.%${s}%`);
    const { data, error } = await q.order("name").limit(limit || 20);
    if (error) return text("This business has no price list yet.");
    if (!data?.length) return text(s ? `Nothing in the price list matches "${s}".` : "The price list is empty.");
    return result(data.map((p) => `${p.name} · ${money(p.unit_price_minor, business.currency)}${p.unit ? ` per ${p.unit}` : ""}`).join("\n"), { products: data.map((p) => ({ id: p.id, name: p.name, description: p.description, unit: p.unit, price: money(p.unit_price_minor, business.currency), vat: p.vat_category })) });
  });

  if (!canWrite(scope)) return;

  // ---------------------------------------------------------------- write
  const b = business; // its tax, terms and due-date defaults fill in new documents

  async function resolveItems(items) {
    const ids = items.map((i) => i.product_id).filter((id) => id && UUID.test(id));
    if (!ids.length) return items;
    const { data } = await service.from("products").select("id, name, description, unit_price_minor, vat_category").eq("business_id", business.id).in("id", ids);
    const byId = Object.fromEntries((data || []).map((p) => [p.id, p]));
    return items.map((i) => {
      const p = byId[i.product_id];
      if (!p) return i;
      return { ...i, description: i.description || p.name, details: i.details ?? p.description, vat: i.vat || p.vat_category, ...(i.unit_price == null ? { unit_price_minor: Number(p.unit_price_minor) } : {}) };
    });
  }

  async function customerFor(input) {
    if (!input) return { error: "Say who it's for: a customer's name, or an id from find_customers." };
    if (input.id) {
      const { data } = await service.from("customers").select("id").eq("business_id", business.id).eq("id", input.id).maybeSingle();
      return data ? { customer_id: data.id } : { error: "That customer isn't in this business. Use find_customers." };
    }
    if (!String(input.name || "").trim()) return { error: "Add the customer's name." };
    const s = String(input.email || input.name).replace(/[%_\\,()]/g, " ").trim();
    const { data } = await service.from("customers").select("id, name, company, email").eq("business_id", business.id).is("archived_at", null)
      .or(`name.ilike.${s},company.ilike.${s},email.ilike.${s}`).limit(5);
    const existing = pickCustomer(data || [], input);
    if (existing) return { customer_id: existing.id };
    return { customer: { name: input.name.trim().slice(0, 120), company: input.company || "", email: String(input.email || "").toLowerCase(), phone: input.phone || "", address: input.address || "" } };
  }

  async function save(kind, docId, input, { existing, existingItems } = {}) {
    const items = input.items ? await resolveItems(input.items) : undefined;
    const { payload, errors } = buildPayload(kind, { ...input, items }, b, { existing, existingItems });
    if (errors.length) return { error: errors.join(" ") };
    if (input.customer) {
      const c = await customerFor(input.customer);
      if (c.error) return c;
      Object.assign(payload, c);
    } else if (existing?.customer_id) payload.customer_id = existing.customer_id;
    else if (existing) payload.customer = { name: existing.customer_name, company: existing.customer_company || "", email: existing.customer_email || "", phone: existing.customer_phone || "", address: "" };
    const saved = await asUser("save_document", { target: business.id, doc_id: docId || null, payload });
    if (saved.error) return saved;
    const id = saved.data;
    if (input.currency && input.currency.toUpperCase() !== (existing?.currency || business.currency)) {
      const cur = await asUser("set_document_currency", { doc_id: id, cur: input.currency.toUpperCase() });
      if (cur.error) return { id, warning: `Saved in ${existing?.currency || business.currency}: ${cur.error}` };
    }
    return { id };
  }

  async function savedView(id, summary, extra = {}) {
    const { data: doc } = await service.from("documents").select(DOC_COLUMNS).eq("id", id).eq("business_id", business.id).maybeSingle();
    if (!doc) return fail("Saved, but couldn't read it back. Check it in Usetally.");
    const v = docView(site, doc, await itemsOf(id));
    return result(`${summary(doc)}${extra.warning ? `\nNote: ${extra.warning}` : ""}`, v);
  }

  for (const kind of ["invoice", "quote"]) {
    const Kind = kind === "invoice" ? "Invoice" : "Quote";
    server.registerTool(`create_${kind}`, {
      title: `Create ${kind === "invoice" ? "an invoice" : "a quote"}`,
      description: `Create a draft ${kind} in ${business.name}, branded with the business's template. Nothing is sent: show the person the total and ask before using send_document. Prices are normal amounts in the document's currency.`,
      inputSchema: {
        customer: customerShape, ...docFields,
        ...(kind === "invoice" ? { due_date: z.string().optional().describe("YYYY-MM-DD. Leave out for the business's usual payment terms.") } : { valid_until: z.string().optional().describe("YYYY-MM-DD. Leave out for the business's usual validity.") }),
      },
      annotations: WRITE,
    }, async (input) => {
      const r = await save(kind, null, input);
      if (r.error) return fail(r.error);
      return savedView(r.id, (d) => `Draft ${Kind.toLowerCase()} ${d.number} for ${d.customer_name}: ${money(d.total_minor, d.currency)}. It hasn't been sent.`, r);
    });
  }

  server.registerTool("update_draft", {
    title: "Edit a draft",
    description: "Change a draft quote or invoice. Only the fields given change; items, if given, replace all the items. Sent documents can't be edited here.",
    inputSchema: {
      document: docRef, customer: customerShape.optional(), ...Object.fromEntries(Object.entries(docFields).map(([k, v]) => [k, v.optional()])),
      due_date: z.string().optional().describe("Invoices: YYYY-MM-DD."), valid_until: z.string().optional().describe("Quotes: YYYY-MM-DD."),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, async ({ document, ...input }) => {
    const doc = await findDoc(document);
    if (!doc) return notFound(document);
    if (!["draft", "pending_approval"].includes(doc.status)) return fail(`${doc.number} has been sent, so it can't be edited. It's ${doc.status}.`);
    const r = await save(doc.kind, doc.id, input, { existing: doc, existingItems: input.items ? null : await itemsOf(doc.id) });
    if (r.error) return fail(r.error);
    return savedView(r.id, (d) => `Updated ${d.number}: ${money(d.total_minor, d.currency)}.`, r);
  });

  server.registerTool("send_document", {
    title: "Send to the customer",
    description: "Send a quote or invoice: it's marked sent, gets its customer link and PDF, and is emailed to the customer (or the email given). Already-sent documents are emailed again. Always confirm with the person first. If the person's role needs approval, it's sent for approval instead.",
    inputSchema: {
      document: docRef,
      email: z.string().max(200).optional().describe("Send to this address instead of the customer's saved email."),
      message: z.string().max(4000).optional().describe("A short personal message for the email."),
      email_customer: z.boolean().default(true).describe("false: just mark it sent and return the link, e.g. to share on WhatsApp."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ document, email, message, email_customer }) => {
    const doc = await findDoc(document);
    if (!doc) return notFound(document);
    if (doc.status === "void") return fail(`${doc.number} is void.`);
    const juniorNeedsApproval = member.role === "junior_finance" && business.require_approval;
    if (["draft", "pending_approval"].includes(doc.status)) {
      if (juniorNeedsApproval) {
        if (doc.status === "pending_approval") return fail(`${doc.number} is already waiting for a manager to approve it.`);
        const s = await asUser("submit_document", { doc_id: doc.id });
        return s.error ? fail(s.error) : text(`${doc.number} needs approval before it goes out. It's been sent to your managers to approve.`);
      }
      const sent = await asUser("mark_document_sent", { doc_id: doc.id, expected_updated_at: null });
      if (sent.error) return fail(sent.error);
    }
    const fresh = await findDoc(doc.id);
    const l = links(site, fresh);
    const to = String(email || fresh.customer_email || "").trim().toLowerCase();
    if (!email_customer) return result(`${fresh.number} is marked sent. Share this link with the customer: ${l.customer_link}`, { number: fresh.number, status: fresh.status, links: l });
    if (!to) return result(`${fresh.number} is marked sent, but the customer has no email. Share the link instead: ${l.customer_link}`, { number: fresh.number, links: l });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail(`"${to}" doesn't look like an email address.`);
    if (!(await emailConfigured())) return result(`${fresh.number} is marked sent. Email isn't set up on this Usetally, so share the link: ${l.customer_link}`, { number: fresh.number, links: l });
    const q = await asUser("queue_document_send", { doc_id: fresh.id, to_email: to, cc: [], subject: "", message: message || "", include_pdf: true, send_at: null, mark_on_send: false });
    if (q.error) return fail(`${fresh.number} is marked sent, but the email couldn't be queued: ${q.error}. Share the link instead: ${l.customer_link}`);
    const { sendAfterUndo } = await import("@/lib/send-queue");
    later(() => sendAfterUndo(q.data.id, q.data.send_after));
    return result(`${fresh.number} (${money(fresh.total_minor, fresh.currency)}) is on its way to ${to}, with the PDF attached.`, { number: fresh.number, emailed_to: to, links: l });
  });

  server.registerTool("convert_quote_to_invoice", {
    title: "Turn a quote into an invoice",
    description: "Make an invoice from a sent or accepted quote, with the same customer and items. Like in the app, the invoice is live straight away (its customer link and PDF work) but isn't emailed: use send_document to email it.",
    inputSchema: { document: docRef.describe("The quote's number or id.") }, annotations: WRITE,
  }, async ({ document }) => {
    const doc = await findDoc(document);
    if (!doc || doc.kind !== "quote") return fail(`No quote "${document}". Use list_documents with kind "quote".`);
    if (doc.converted_invoice_id) {
      const { data: inv } = await service.from("documents").select("number").eq("id", doc.converted_invoice_id).maybeSingle();
      return fail(`${doc.number} was already turned into invoice ${inv?.number || ""}.`);
    }
    const r = await asUser("convert_quote_to_invoice", { quote_id: doc.id });
    if (r.error) return fail(r.error);
    return savedView(r.data, (d) => `Invoice ${d.number} created from ${doc.number}: ${money(d.total_minor, d.currency)}. Its customer link works now; it hasn't been emailed.`);
  });

  server.registerTool("record_payment", {
    title: "Record a payment",
    description: "Record money the customer paid outside Usetally (bank transfer, cash, POS). A receipt is issued automatically. Confirm the amount first.",
    inputSchema: {
      document: docRef.describe("The invoice's number or id."),
      amount: z.union([z.number(), z.string()]).describe("The amount received, as a normal amount."),
      method: z.enum(["bank_transfer", "cash", "pos", "other"]).default("bank_transfer"),
      date: z.string().optional().describe("YYYY-MM-DD when it was paid. Leave out for today."),
      reference: z.string().max(120).optional().describe("Bank or teller reference."),
      note: z.string().max(500).optional(),
    },
    annotations: WRITE,
  }, async ({ document, amount, method, date, reference, note }) => {
    const doc = await findDoc(document);
    if (!doc || doc.kind !== "invoice") return fail(`No invoice "${document}".`);
    const minor = toMinorAmount(amount);
    if (!(minor > 0)) return fail("Enter the amount received.");
    const owed = Number(doc.total_minor) - Number(doc.amount_paid_minor || 0);
    if (minor > owed) return fail(`That's more than the ${money(owed, doc.currency)} still owed on ${doc.number}.`);
    const r = await asUser("record_manual_payment", { doc_id: doc.id, pay_method: method || "bank_transfer", pay_reference: reference || "", pay_amount: minor, pay_note: note || "", pay_date: date || null });
    if (r.error) return fail(r.error);
    later(async () => { const { pushPendingStock } = await import("@/lib/pos"); await pushPendingStock({ businessId: business.id, limit: 5 }).catch(() => null); });
    const fresh = await findDoc(doc.id);
    const left = Number(fresh.total_minor) - Number(fresh.amount_paid_minor || 0);
    return result(`Recorded ${money(minor, doc.currency)} on ${doc.number}. ${left > 0 ? `${money(left, doc.currency)} still owed.` : "It's fully paid."} A receipt was issued.`, { number: fresh.number, status: fresh.status, paid: money(fresh.amount_paid_minor, fresh.currency), still_owed: money(left, fresh.currency), links: links(site, fresh) });
  });

  server.registerTool("void_document", {
    title: "Void a document",
    description: "Cancel a sent quote or invoice so it can't be paid or accepted. It stays in the records, marked void. This can't be undone, so confirm first.",
    inputSchema: { document: docRef }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ document }) => {
    const doc = await findDoc(document);
    if (!doc) return notFound(document);
    if (doc.status === "void") return text(`${doc.number} is already void.`);
    const r = await asUser("void_document", { doc_id: doc.id });
    return r.error ? fail(r.error) : text(`${doc.number} is now void.`);
  });
}
