// The guided WhatsApp bot: numbered menus and short questions, for when no AI
// key is set, the AI is down, or the person prefers it (reply "menu"). It also
// holds the confirm-with-YES step every change goes through, AI or not.
// Pure: it talks to the business through `act` (lib/whatsapp/office.js), so
// tests pass a fake.
import { MENU, isCancel, normPhone, parseAmount, parseDocRef, parseItems, prettyPhone } from "./core.js";

const CHANNELS = "1. WhatsApp\n2. Email\n3. Both\n4. Just give me the link\n5. Keep it as a draft";
const channelOf = (t) => ({ 1: "whatsapp", whatsapp: "whatsapp", wa: "whatsapp", 2: "email", email: "email", mail: "email", 3: "both", both: "both", 4: "link", link: "link", 5: "draft", draft: "draft", keep: "draft", later: "draft" })[String(t || "").trim().toLowerCase().replace(/[.!]$/, "")];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ITEMS_HELP = "Send the items, one per line, with the price at the end. For example:\n*Logo design 150000*\n*2 x Business cards 15k*";
const summary = (d) => [`*${d.kind === "quote" ? "Quote" : "Invoice"} ${d.number}* for ${d.customer?.name || "your customer"}: *${d.total}*`, ...(d.items || []).slice(0, 8).map((i) => `• ${i.description}${i.quantity !== 1 ? ` × ${i.quantity}` : ""} — ${i.amount}`)].join("\n");

// what a change does, in one message, ending with "Reply YES"
export function describePending(p, doc) {
  const who = doc?.customer?.name || "the customer";
  const n = doc?.number || p.ref;
  const lines = {
    send: () => {
      const how = { whatsapp: `on WhatsApp${p.args.phone || doc?.customer?.phone ? ` (${prettyPhone(normPhone(p.args.phone || doc.customer.phone)) || p.args.phone || doc.customer.phone})` : ""}`, email: `by email${p.args.email || doc?.customer?.email ? ` (${p.args.email || doc.customer.email})` : ""}`, both: "on WhatsApp and by email", link: "as a link you forward yourself" }[p.args.channel] || "";
      return `Send ${n} (${doc?.total || ""}) to ${who} ${how}?`;
    },
    pay: () => `Mark ${p.args.amount == null || p.args.amount === "full" ? `the full ${doc?.still_owed || "amount owed"}` : `${doc?.currency || ""} ${Number(p.args.amount).toLocaleString("en-NG")}`.trim()} as paid on ${n} (${who})${p.args.method && p.args.method !== "bank_transfer" ? ` by ${String(p.args.method).replace("_", " ")}` : ""}?${p.args.receipt && p.args.receipt !== "none" ? ` The receipt goes to ${who}${p.args.receipt === "email" ? " by email" : p.args.receipt === "whatsapp" ? " on WhatsApp" : ""}.` : ""}`,
    convert: () => `Turn quote ${n} (${doc?.total || ""}, ${who}) into an invoice?`,
    receipt: () => `Send the receipt for ${n} to ${who}${p.args.channel === "email" ? " by email" : p.args.channel === "whatsapp" ? " on WhatsApp" : ""}?`,
    void: () => `Cancel (void) ${n} for ${who}? This can't be undone.`,
  };
  return `${(lines[p.action] || (() => "Go ahead?"))()}\n\nReply *YES* to confirm or *NO* to cancel.`;
}

// carry out a confirmed change
export async function executePending(act, p) {
  if (p.action === "send") return act.send(p.ref, p.args);
  if (p.action === "pay") return act.pay(p.ref, p.args);
  if (p.action === "receipt") return act.receipt(p.ref, p.args);
  if (p.action === "void") return act.void(p.ref);
  if (p.action === "convert") {
    const r = await act.convert(p.ref);
    return r.error || `${r.text}\n\nSend it to the customer now? Reply *send ${r.doc.number}*.`;
  }
  return "I'm not sure what to do with that.";
}

// One message through the guided bot. Returns { reply, state, pending? }.
// state: { flow, step, ... } ({} when idle). pending: a change to confirm with YES.
export async function guided({ state = {}, text, act }) {
  const t = String(text || "").trim();
  const low = t.toLowerCase();
  if (state.flow && isCancel(t)) return { reply: `Stopped.\n\n${MENU}`, state: {} };

  // ---- inside a flow
  if (state.flow === "new") {
    const kind = state.kind;
    if (state.step === "customer") {
      const phone = normPhone((t.match(/(\+?\d[\d\s-]{7,16}\d)/) || [])[1] || "");
      const email = (t.match(/[^\s@]+@[^\s@]+\.[^\s@]+/) || [])[0] || "";
      const name = t.replace(/(\+?\d[\d\s-]{7,16}\d)/, "").replace(/[^\s@]+@[^\s@]+\.[^\s@]+/, "").replace(/[,;]+/g, " ").trim().slice(0, 120);
      if (!name) return { reply: "What's the customer's name?", state };
      return { reply: `${kind === "quote" ? "Quote" : "Invoice"} for *${name}*. ${ITEMS_HELP}`, state: { ...state, step: "items", customer: { name, ...(phone ? { phone } : {}), ...(email ? { email } : {}) } } };
    }
    if (state.step === "items") {
      const { items, bad } = parseItems(t);
      if (!items.length) return { reply: `I couldn't read a price there. ${ITEMS_HELP}`, state };
      const r = await act.create(kind, { customer: state.customer, items });
      if (r.error) return { reply: `${r.error}\n\nTry again, or reply *cancel*.`, state };
      const d = r.doc;
      return {
        reply: `${summary(d)}${bad.length ? `\n\n(I skipped: ${bad.join(", ")})` : ""}\n\nIt's saved as a draft. Send it now?\n${CHANNELS}`,
        state: { flow: "send", step: "channel", ref: d.number, phone: d.customer?.phone || "", email: d.customer?.email || "" },
      };
    }
  }

  if (state.flow === "send") {
    if (state.step === "ref") {
      const ref = parseDocRef(t) || t.toUpperCase();
      const d = await act.doc(ref);
      if (!d) return { reply: `I can't find "${t}". Send the number, like INV-0042.`, state };
      return { reply: `${summary(d.view)}\n\nHow should it go?\n${CHANNELS}`, state: { flow: "send", step: "channel", ref: d.number, phone: d.customer_phone || "", email: d.customer_email || "" } };
    }
    if (state.step === "channel") {
      const ch = channelOf(t);
      if (!ch) return { reply: `Reply with a number:\n${CHANNELS}`, state };
      if (ch === "draft") return { reply: `OK, ${state.ref} stays a draft. Reply *send ${state.ref}* when you're ready.`, state: {} };
      if ((ch === "whatsapp" || ch === "both") && !state.phone) return { reply: "What's the customer's WhatsApp number?", state: { ...state, step: "phone", channel: ch } };
      if ((ch === "email" || ch === "both") && !state.email) return { reply: "What's the customer's email address?", state: { ...state, step: "email", channel: ch } };
      return { reply: await act.send(state.ref, { channel: ch }), state: {} };
    }
    if (state.step === "phone") {
      const phone = normPhone(t, act.business?.country);
      if (!phone) return { reply: "That doesn't look like a phone number. Try again, like 0801 234 5678, or reply *cancel*.", state };
      if (state.channel === "both" && !state.email) return { reply: "And their email address?", state: { ...state, step: "email", phone } };
      return { reply: await act.send(state.ref, { channel: state.channel, phone }), state: {} };
    }
    if (state.step === "email") {
      if (!EMAIL.test(t)) return { reply: "That doesn't look like an email address. Try again, or reply *cancel*.", state };
      return { reply: await act.send(state.ref, { channel: state.channel, email: t.toLowerCase(), ...(state.phone ? { phone: state.phone } : {}) }), state: {} };
    }
  }

  if (state.flow === "pay") {
    if (state.step === "ref") {
      const ref = parseDocRef(t) || t.toUpperCase();
      const d = await act.doc(ref);
      if (!d || d.kind !== "invoice") return { reply: `I can't find invoice "${t}". Send the number, like INV-0042.`, state };
      return { reply: `${d.number} for ${d.customer_name}: ${d.view.still_owed} still owed.\nHow much did they pay? Reply *full* or an amount.`, state: { flow: "pay", step: "amount", ref: d.number } };
    }
    if (state.step === "amount") {
      const amount = /^(full|all|everything|full amount)$/i.test(t) ? "full" : parseAmount(t);
      if (amount == null) return { reply: "Reply *full*, or the amount like 50000.", state };
      return { reply: "Send the customer their receipt?\n1. On WhatsApp\n2. By email\n3. No", state: { ...state, step: "receipt", amount } };
    }
    if (state.step === "receipt") {
      const receipt = { 1: "whatsapp", whatsapp: "whatsapp", 2: "email", email: "email", 3: "none", no: "none" }[low.replace(/[.!]$/, "")];
      if (!receipt) return { reply: "Reply 1 (WhatsApp), 2 (email) or 3 (no).", state };
      const p = { action: "pay", ref: state.ref, args: { amount: state.amount, receipt } };
      return { reply: describePending(p, (await act.doc(state.ref))?.view), state: {}, pending: p };
    }
  }

  if (state.flow === "convert" && state.step === "ref") {
    const ref = parseDocRef(t) || t.toUpperCase();
    const d = await act.doc(ref);
    if (!d || d.kind !== "quote") return { reply: `I can't find quote "${t}". Send the number, like QT-0007.`, state };
    const p = { action: "convert", ref: d.number, args: {} };
    return { reply: describePending(p, d.view), state: {}, pending: p };
  }

  // ---- commands and the menu
  const ref = parseDocRef(t);
  if (/^(paid|mark paid|payment|received)\b/i.test(low) && ref) {
    const rest = t.replace(/^\S+(\s+paid)?/i, "").replace(/\b(?:INV|QT|QUO|RCT)[-\s]?\d{1,8}\b/i, "");
    const amount = parseAmount(((rest.match(/(?:₦|ngn|n(?=\d))?\s*\d[\d,.]*\s*[km]?\b/i) || [])[0] || "").trim());
    const p = { action: "pay", ref, args: { amount: amount ?? "full", receipt: "none" } };
    const d = await act.doc(ref);
    if (!d || d.kind !== "invoice") return { reply: `I can't find invoice ${ref}.`, state: {} };
    return { reply: describePending(p, d.view), state: {}, pending: p };
  }
  if (/^receipt\b/i.test(low) && ref) {
    const p = { action: "receipt", ref, args: { channel: "auto" } };
    return { reply: describePending(p, (await act.doc(ref))?.view), state: {}, pending: p };
  }
  if (/^(convert|turn)\b/i.test(low) && ref) return guided({ state: { flow: "convert", step: "ref" }, text: ref, act });
  if (/^send\b/i.test(low) && ref) return guided({ state: { flow: "send", step: "ref" }, text: ref, act });
  if (/^(void|cancel)\b/i.test(low) && ref) {
    const p = { action: "void", ref, args: {} };
    return { reply: describePending(p, (await act.doc(ref))?.view), state: {}, pending: p };
  }
  if (ref && /^[a-z]{2,4}-?\d+$/i.test(t)) {
    const d = await act.doc(ref);
    return { reply: d ? `${summary(d.view)}\n${d.view.status_in_words || d.status}${d.view.links?.customer_link ? `\n${d.view.links.customer_link}` : ""}` : `I can't find ${ref}.`, state: {} };
  }

  const pick = low.replace(/[.!]$/, "");
  if (pick === "1" || /^(new )?invoice$/.test(pick)) return { reply: "New invoice. Who's it for? (Name, and their WhatsApp number if you have it.)", state: { flow: "new", kind: "invoice", step: "customer" } };
  if (pick === "2" || /^(new )?quote$/.test(pick)) return { reply: "New quote. Who's it for? (Name, and their WhatsApp number if you have it.)", state: { flow: "new", kind: "quote", step: "customer" } };
  if (pick === "3" || /owe|unpaid|debtor|outstanding|overdue/.test(pick)) return { reply: await act.unpaid(), state: {} };
  if (pick === "4" || /^(mark )?(as )?paid$/.test(pick)) return { reply: "Which invoice was paid? Send its number, like INV-0042.", state: { flow: "pay", step: "ref" } };
  if (pick === "5" || pick === "send") return { reply: "Which quote or invoice? Send its number, like INV-0042.", state: { flow: "send", step: "ref" } };
  if (pick === "6" || pick === "convert") return { reply: "Which quote? Send its number, like QT-0007.", state: { flow: "convert", step: "ref" } };
  return { reply: MENU, state: {} };
}
