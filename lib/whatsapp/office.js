import "server-only";
import * as z from "zod";
import { registerTools } from "@/lib/ai/tools";
import { money, toMinorAmount } from "@/lib/ai/tools-core";
import { emailConfigured, sendEmail } from "@/lib/email";
import { receiptEmail } from "@/lib/emails";
import { receiptForEmail, withDocument } from "@/lib/email-document";
import { absoluteLogoUrl } from "@/lib/site";
import { normPhone, prettyPhone, templateVars, waShareLink } from "@/lib/whatsapp/core";
import { sendWhatsapp } from "@/lib/whatsapp/twilio";

// Everything the WhatsApp bot can do for one linked person, in one business.
// It reuses the AI & MCP tools (lib/ai/tools.js), so every change goes through
// the app's own database actions as that person: roles, approvals and plan
// limits apply exactly as in the app. Sending to customers on WhatsApp uses
// the approved templates; without one, the owner gets a link to forward.

const textOf = (r) => (r?.content || []).map((c) => c.text).join("\n");

export async function openOffice({ service, link, cfg, site }) {
  const [{ data: business }, { data: member }] = await Promise.all([
    service.from("businesses").select("*").eq("id", link.business_id).maybeSingle(),
    service.from("memberships").select("role, can_view_costs, full_name, email").eq("business_id", link.business_id).eq("user_id", link.user_id).maybeSingle(),
  ]);
  if (!business || !member) return null;

  const tools = {};
  registerTools({ registerTool: (name, def, handler) => { tools[name] = { name, def, handler }; } },
    { service, userId: link.user_id, business, member, scope: "read write", site, appName: "WhatsApp" });
  const run = async (name, input = {}) => {
    const t = tools[name];
    if (!t) return { isError: true, content: [{ type: "text", text: "You can't do that with your role in this business." }] };
    try { return await t.handler(input); }
    catch (e) { console.error("whatsapp.tool_failed", { name, message: e?.message }); return { isError: true, content: [{ type: "text", text: "Something went wrong. Try again in a minute." }] }; }
  };

  const docRow = async (ref) => {
    const r = await run("get_document", { document: ref });
    if (r.isError || !r.structuredContent?.id) return null;
    const { data } = await service.from("documents").select("id, kind, number, status, customer_name, customer_email, customer_phone, currency, total_minor, amount_paid_minor, access_token")
      .eq("id", r.structuredContent.id).eq("business_id", business.id).maybeSingle();
    return data ? { ...data, view: r.structuredContent } : null;
  };
  const kindWord = (k) => ({ invoice: "Invoice", quote: "Quote", receipt: "Receipt" }[k] || "Document");
  const owedMinor = (d) => d.kind === "invoice" ? Math.max(0, Number(d.total_minor) - Number(d.amount_paid_minor || 0)) || Number(d.total_minor) : Number(d.total_minor);
  const logCustomer = (phone, body, sid) => Promise.resolve(service.from("whatsapp_messages").insert({ message_sid: sid || null, phone, direction: "customer", business_id: business.id, body: body.slice(0, 500), status: "sent" })).catch(() => null);

  // a template message to the customer; or, when that can't happen, a link the owner forwards
  async function toCustomerWhatsapp({ kind, number, token, path, amountMinor, currency, customer, phone }) {
    const to = normPhone(phone, business.country);
    const link = `${site}/${path}/${token}`;
    const share = `${kindWord(kind)} ${number} from ${business.name}${amountMinor ? ` (${money(amountMinor, currency)})` : ""}: ${link}`;
    if (!to) return { ok: false, text: `There's no WhatsApp number for ${customer || "this customer"}. Send me their number, or forward this:\n${share}` };
    const tpl = cfg?.connected ? cfg.templates[kind] : "";
    if (!tpl) return { ok: false, text: `Tap to send it from your own WhatsApp:\n${waShareLink(to, share)}` };
    const r = await sendWhatsapp(cfg, { to, contentSid: tpl, variables: templateVars({ customer, business: business.name, label: `${kind} ${number}`, amount: amountMinor ? money(amountMinor, currency) : "", token }) });
    if (!r.ok) {
      console.error("whatsapp.customer_send_failed", { business: business.id, code: r.code });
      return { ok: false, text: `WhatsApp didn't deliver it to ${prettyPhone(to)} (${r.error}). Tap to send it yourself:\n${waShareLink(to, share)}` };
    }
    await logCustomer(to, share, r.sid);
    return { ok: true, text: `Sent to ${customer || "the customer"} on WhatsApp (${prettyPhone(to)}).` };
  }

  // the newest receipt on an invoice, to the customer on WhatsApp or by email
  async function sendReceipt(doc, { phone, channel = "auto" } = {}) {
    const { data: receipt } = await service.from("receipts").select("*").eq("document_id", doc.id).eq("business_id", business.id).order("issued_at", { ascending: false }).limit(1).maybeSingle();
    if (!receipt) return "There's no receipt on it yet.";
    const wa = channel !== "email" && (phone || doc.customer_phone);
    if (wa) {
      const r = await toCustomerWhatsapp({ kind: "receipt", number: receipt.number, token: receipt.access_token, path: "r", amountMinor: Number(receipt.amount_minor), currency: receipt.currency, customer: doc.customer_name, phone: phone || doc.customer_phone });
      if (r.ok || channel === "whatsapp" || !doc.customer_email) return `Receipt ${receipt.number}: ${r.text}`;
    }
    if (doc.customer_email && (await emailConfigured())) {
      const link = `${site}/r/${receipt.access_token}`;
      const r = await sendEmail({
        to: doc.customer_email, fromName: business.name, replyTo: business.email || undefined,
        ...withDocument(({ color, attached, model }) => receiptEmail({ business, logo: absoluteLogoUrl(business.logo_path), receipt, documentNumber: doc.number, link, color, attached, model }), await receiptForEmail(service, receipt, business)),
      }).catch(() => ({ sent: false }));
      if (r.sent) return `Receipt ${receipt.number} emailed to ${doc.customer_email}.`;
    }
    return `Receipt ${receipt.number}: ${site}/r/${receipt.access_token}`;
  }

  const act = {
    business, member, tools, run,
    can: (name) => Boolean(tools[name]),

    async overview() { return textOf(await run("get_business_overview")); },

    async unpaid() {
      const r = await run("list_documents", { kind: "invoice", status: "unpaid", limit: 10 });
      const docs = r.structuredContent?.documents || [];
      if (!docs.length) return "Nobody owes you right now. 🎉";
      const over = await run("get_business_overview");
      const o = over.structuredContent || {};
      return [`*${o.owed_to_you || "Money owed"}* owed across ${o.unpaid_invoices ?? docs.length} unpaid invoice${(o.unpaid_invoices ?? docs.length) === 1 ? "" : "s"}${o.overdue_invoices ? ` (${o.overdue_invoices} overdue)` : ""}.`, "",
        ...docs.map((d) => `• ${d.number} · ${d.customer} · ${d.total}${d.due_date ? ` · due ${d.due_date}` : ""}`),
        ...(docs.length >= 10 ? ["", "Showing the 10 newest."] : []),
        "", "To mark one paid, reply e.g. *paid INV-0042*."].join("\n");
    },

    doc: docRow,

    async findCustomer(name) {
      const r = await run("find_customers", { query: name, limit: 3 });
      return r.structuredContent?.customers || [];
    },

    async create(kind, { customer, items }) {
      const r = await run(`create_${kind}`, { customer, items });
      if (r.isError) return { error: textOf(r) };
      return { doc: r.structuredContent };
    },

    // channel: whatsapp | email | both | link
    async send(ref, { channel = "link", phone, email } = {}) {
      const doc = await docRow(ref);
      if (!doc) return `I can't find ${ref}.`;
      const viaEmail = channel === "email" || channel === "both";
      const r = await run("send_document", { document: doc.id, email_customer: viaEmail, ...(email ? { email } : {}) });
      if (r.isError) return textOf(r);
      const out = [textOf(r).split("\n\n")[0]];
      if (/approv/i.test(out[0]) && !r.structuredContent) return out[0];
      if (channel === "whatsapp" || channel === "both") {
        const fresh = await docRow(doc.id);
        const w = await toCustomerWhatsapp({ kind: fresh.kind, number: fresh.number, token: fresh.access_token, path: "d", amountMinor: owedMinor(fresh), currency: fresh.currency, customer: fresh.customer_name, phone: phone || fresh.customer_phone });
        out.push(w.text);
      }
      return out.join("\n\n");
    },

    async convert(ref) {
      const r = await run("convert_quote_to_invoice", { document: ref });
      if (r.isError) return { error: textOf(r) };
      return { doc: r.structuredContent, text: textOf(r).split("\n\n")[0] };
    },

    async pay(ref, { amount, method = "bank_transfer", receipt = "none", phone } = {}) {
      const doc = await docRow(ref);
      if (!doc || doc.kind !== "invoice") return `I can't find invoice ${ref}.`;
      const minor = amount == null || amount === "full" ? owedMinor(doc) : toMinorAmount(amount);
      const r = await run("record_payment", { document: doc.id, amount: minor / 100, method });
      if (r.isError) return textOf(r);
      const out = [textOf(r).split("\n\n")[0]];
      if (receipt !== "none") out.push(await sendReceipt(doc, { phone, channel: receipt }));
      else out.push(`Receipt: reply *receipt ${doc.number}* to send it to ${doc.customer_name || "the customer"}.`);
      return out.join("\n\n");
    },

    async receipt(ref, { phone, channel } = {}) {
      const doc = await docRow(ref);
      if (!doc || doc.kind !== "invoice") return `I can't find invoice ${ref}.`;
      return sendReceipt(doc, { phone, channel });
    },

    async void(ref) { return textOf(await run("void_document", { document: ref })); },
  };
  return act;
}

// ---------------------------------------------------------------- tools for the AI
// Reading and drafting run straight away; sending, money and cancelling become
// a change that waits for the person's YES.
export const CONFIRM_TOOLS = ["send_document", "record_payment", "convert_quote_to_invoice", "void_document", "send_receipt"];

const docRef = z.string().min(1).describe("The document's number (e.g. INV-0042, QT-0007).");
const EXTRA = {
  send_document: {
    description: "Send a quote or invoice to the customer. The person is asked to confirm before anything goes out. channel: whatsapp (an approved WhatsApp message to the customer's phone), email, both, or link (just mark it sent and give the link to forward).",
    inputSchema: {
      document: docRef,
      channel: z.enum(["whatsapp", "email", "both", "link"]).describe("How to send it. Prefer what the person asked for; if unsure, whatsapp when the customer has a phone, else email."),
      phone: z.string().max(40).optional().describe("The customer's WhatsApp number, if the person gave one."),
      email: z.string().max(200).optional().describe("Send to this email instead of the customer's saved one."),
    },
  },
  record_payment: {
    description: "Mark an invoice paid (fully or partly) with money received outside Usetally (transfer, cash, POS). A receipt is issued. The person is asked to confirm first.",
    inputSchema: {
      document: docRef,
      amount: z.union([z.number(), z.string()]).optional().describe("The amount received as a normal amount. Leave out for the full amount still owed."),
      method: z.enum(["bank_transfer", "cash", "pos", "other"]).default("bank_transfer"),
      receipt: z.enum(["none", "whatsapp", "email", "auto"]).default("none").describe("Also send the customer the receipt: whatsapp, email, auto (WhatsApp if they have a phone, else email) or none."),
    },
  },
  send_receipt: {
    description: "Send the newest receipt on an invoice to the customer (WhatsApp or email). The person is asked to confirm first.",
    inputSchema: { document: docRef, channel: z.enum(["whatsapp", "email", "auto"]).default("auto"), phone: z.string().max(40).optional() },
  },
};

// the tool list the AI sees, as JSON schema
export function aiTools(act) {
  const list = [];
  const keep = ["get_business_overview", "list_documents", "get_document", "find_customers", "find_products", "create_invoice", "create_quote", "update_draft", "convert_quote_to_invoice", "void_document"];
  for (const name of keep) {
    const t = act.tools[name];
    if (!t) continue;
    list.push({ name, description: t.def.description + (CONFIRM_TOOLS.includes(name) ? " The person is asked to confirm first." : ""), shape: t.def.inputSchema || {} });
  }
  if (act.tools.send_document) list.push({ name: "send_document", ...EXTRA.send_document, shape: EXTRA.send_document.inputSchema });
  if (act.tools.record_payment) {
    list.push({ name: "record_payment", ...EXTRA.record_payment, shape: EXTRA.record_payment.inputSchema });
    list.push({ name: "send_receipt", ...EXTRA.send_receipt, shape: EXTRA.send_receipt.inputSchema });
  }
  return list.map(({ name, description, shape }) => {
    const schema = z.toJSONSchema(z.object(shape), { io: "input" });
    delete schema.$schema;
    return { name, description, schema, shape };
  });
}
