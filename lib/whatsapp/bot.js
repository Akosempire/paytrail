import "server-only";
import * as z from "zod";
import { featuresOf, hasFeature, upgradeMessage } from "@/lib/entitlements";
import { sha256 } from "@/lib/crypto";
import { emailConfigured, sendEmail } from "@/lib/email";
import { whatsappLinkedEmail } from "@/lib/emails";
import { BRAND } from "@/lib/brand";
import { MENU, isMenu, isNo, isYes, normPhone, parseLinkCode, prettyPhone, splitMessage, toWhatsapp } from "@/lib/whatsapp/core";
import { describePending, executePending, guided } from "@/lib/whatsapp/guided";
import { CONFIRM_TOOLS, aiTools, openOffice } from "@/lib/whatsapp/office";
import { runAi } from "@/lib/whatsapp/ai";
import { sendWhatsapp } from "@/lib/whatsapp/twilio";

// One incoming WhatsApp message, start to finish: who sent it, link them if
// they sent a code, then the guided bot or the AI, and the reply. Every change
// (sending, money, converting, cancelling) waits for the person's YES.

const PENDING_MINUTES = 15;
const PER_10_MIN = 40;          // messages one number may send in 10 minutes
const LINK_TRIES_PER_HOUR = 8;  // wrong link codes from one unlinked number

const COMMAND = /^(paid|mark paid|payment|received|receipt|send|convert|turn|void)\b.*\b(INV|QT|QUO|RCT)[-\s]?\d/i;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function systemPrompt(act) {
  const b = act.business;
  return `You are ${BRAND.name}'s WhatsApp assistant for ${b.name}${b.country ? ` (${b.country})` : ""}. You help ${act.member.full_name || "the owner"} (role: ${act.member.role}) make quotes and invoices, see who owes them, mark invoices paid and send documents to customers. Today is ${today()}. The usual currency is ${b.currency}.
Rules:
- Replies are WhatsApp messages: short, friendly, plain words. Use *bold* for numbers and totals. No tables, no headings, no markdown links.
- Amounts are normal amounts (150k = 150000 = ${b.currency} 150,000).
- To make a quote or invoice, call create_quote or create_invoice (it's only a draft), then show the customer, items and total and ask how to send it: WhatsApp, email, both or a link.
- Use find_customers and find_products to reuse saved customers and prices. If the customer is new, their name is enough; ask for a WhatsApp number only when sending by WhatsApp.
- send_document, record_payment, send_receipt, convert_quote_to_invoice and void_document don't run straight away: the person is asked to reply YES. Call them when the person asks; don't ask for confirmation yourself first.
- Only help with this business's quotes, invoices, receipts, customers and payments. For anything else, say briefly what you can do. Never make up numbers: read them with the tools.
- If the person seems stuck, tell them they can reply *menu* for numbered options.`;
}

export async function handleIncoming({ service, cfg, site, from, text: rawText, sid, numMedia = 0 }) {
  const phone = normPhone(from);
  if (!phone) return { skipped: "no phone" };
  const text = String(rawText || "").trim().slice(0, 2000);

  // Twilio retries if we were slow: each MessageSid is handled once
  const { error: dup } = await service.from("whatsapp_messages").insert({ message_sid: sid || null, phone, direction: "in", body: text.slice(0, 2000) });
  if (dup) return { skipped: /duplicate|unique/i.test(dup.message || "") ? "duplicate" : dup.message };

  const replies = [];
  let businessId = null;
  const say = (s) => replies.push(s);
  try {
    const since = (min) => new Date(Date.now() - min * 60_000).toISOString();
    const { count: recent } = await service.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("phone", phone).eq("direction", "in").gte("created_at", since(10));
    if ((recent || 0) > PER_10_MIN) {
      if (recent === PER_10_MIN + 1) say("You're sending messages very fast. Give it a few minutes, then try again.");
      return await deliver();
    }

    const { data: link } = await service.from("whatsapp_links").select("id, phone, user_id, business_id").eq("phone", phone).maybeSingle();
    if (!link) {
      await linkOrIntro();
      return await deliver();
    }
    businessId = link.business_id;

    const act = await openOffice({ service, link, cfg, site });
    if (!act) {
      await service.from("whatsapp_links").delete().eq("id", link.id);
      say(`This number isn't part of that business on ${BRAND.name} any more, so I've unlinked it. To use it again, link it from ${site}/app/settings/whatsapp.`);
      return await deliver();
    }
    if (!hasFeature(await featuresOf(service, link.business_id), "whatsapp")) {
      say(`${upgradeMessage("whatsapp")}\n${site}/app/settings/billing`);
      return await deliver();
    }
    service.from("whatsapp_links").update({ last_seen_at: new Date().toISOString() }).eq("id", link.id).then(() => null, () => null);

    if (!text) {
      say(numMedia ? "I can only read text messages for now. Type what you need, or reply *menu*." : MENU);
      return await deliver();
    }

    const { data: session } = await service.from("whatsapp_sessions").select("state, history").eq("phone", phone).maybeSingle();
    let state = session?.state || {};
    let history = Array.isArray(session?.history) ? session.history : [];
    let pending = state.pending && Date.parse(state.pending.until) > Date.now() ? state.pending : null;
    delete state.pending;
    let reply = "";

    if (pending && isYes(text)) {
      reply = await executePending(act, pending);
      pending = null;
    } else if (pending && isNo(text)) {
      reply = "OK, I didn't do it. What next?";
      pending = null;
    } else {
      pending = null; // anything else moves on
      // numbered menus: no AI set, a guided task in progress, "menu", a number, or a short command
      const useGuided = !cfg.ai || state.flow || isMenu(text) || /^\d$/.test(text) || COMMAND.test(text);
      if (useGuided) {
        const g = await guided({ state, text, act });
        reply = g.reply; pending = g.pending || null; state = g.state;
      } else {
        try {
          const r = await viaAi(act, history, text, cfg);
          reply = r.reply; pending = r.pending;
        } catch (e) {
          console.error("whatsapp.ai_failed", { message: e?.message });
          const g = await guided({ state: {}, text, act });
          reply = g.reply; pending = g.pending || null; state = g.state;
        }
      }
    }

    if (pending) state.pending = { ...pending, until: new Date(Date.now() + PENDING_MINUTES * 60_000).toISOString() };
    reply = toWhatsapp(reply) || MENU;
    history = [...history, { role: "user", content: text.slice(0, 1500) }, { role: "assistant", content: reply.slice(0, 1500) }].slice(-12);
    await service.from("whatsapp_sessions").upsert({ phone, state, history, updated_at: new Date().toISOString() });
    say(reply);
  } catch (e) {
    console.error("whatsapp.handle_failed", { message: e?.message });
    say("Sorry, something went wrong on our side. Try again in a minute, or reply *menu*.");
  }
  return await deliver();

  // ---- helpers (share this message's phone, text and replies)
  async function deliver() {
    for (const r of replies) for (const part of splitMessage(r)) {
      const s = await sendWhatsapp(cfg, { to: phone, body: part });
      await service.from("whatsapp_messages").insert({ message_sid: s.sid || null, phone, direction: "out", business_id: businessId, body: part.slice(0, 2000), status: s.ok ? "sent" : `failed: ${String(s.error).slice(0, 120)}` }).then(() => null, () => null);
      if (!s.ok) { console.error("whatsapp.reply_failed", { code: s.code }); break; }
    }
    return { replies };
  }

  async function linkOrIntro() {
    const code = parseLinkCode(text);
    if (!code) {
      // a customer replying to a document a business sent them: point them to that business
      const { data: last } = await service.from("whatsapp_messages").select("business_id").eq("phone", phone).eq("direction", "customer").not("business_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last?.business_id) {
        const { data: b } = await service.from("businesses").select("name, phone, email").eq("id", last.business_id).maybeSingle();
        if (b) {
          say(`Thanks for your message. This number only delivers documents for businesses on ${BRAND.name}, and nobody reads replies here.\n\nTo reach *${b.name}*${b.phone ? `, call or WhatsApp ${b.phone}` : ""}${b.email ? `${b.phone ? " or" : ","} email ${b.email}` : ""}.`);
          return;
        }
      }
      say(`Hi! I'm ${BRAND.name} on WhatsApp. I make quotes and invoices, tell you who owes you, and send them to your customers.\n\nTo start, link this number: in ${BRAND.name} open *Settings → WhatsApp*, tap *Link WhatsApp* and send me the code.\n${site}/app/settings/whatsapp`);
      return;
    }
    const { count: tries } = await service.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("phone", phone).eq("direction", "in").gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((tries || 0) > LINK_TRIES_PER_HOUR) { say("Too many tries. Wait an hour, then get a new code in Settings → WhatsApp."); return; }
    const now = new Date().toISOString();
    const { data: row } = await service.from("whatsapp_link_codes").select("code_hash, user_id, business_id").eq("code_hash", sha256(`wa:${code}`)).is("used_at", null).gt("expires_at", now).maybeSingle();
    if (!row) { say("That code didn't work or has expired. Get a new one in *Settings → WhatsApp* (codes last 10 minutes)."); return; }
    const { data: used } = await service.from("whatsapp_link_codes").update({ used_at: now }).eq("code_hash", row.code_hash).is("used_at", null).select("code_hash");
    if (!used?.length) { say("That code was just used. Get a new one in *Settings → WhatsApp*."); return; }
    const [{ data: member }, { data: business }] = await Promise.all([
      service.from("memberships").select("role").eq("business_id", row.business_id).eq("user_id", row.user_id).maybeSingle(),
      service.from("businesses").select("id, name").eq("id", row.business_id).maybeSingle(),
    ]);
    if (!member || !business) { say("That code is for a business you're no longer part of."); return; }
    if (!hasFeature(await featuresOf(service, business.id), "whatsapp")) { say(`${upgradeMessage("whatsapp")}\n${site}/app/settings/billing`); return; }
    const { error } = await service.from("whatsapp_links").upsert({ phone, user_id: row.user_id, business_id: business.id, linked_at: now, last_seen_at: now }, { onConflict: "phone" });
    if (error) { say("Couldn't link this number just now. Try again in a minute."); return; }
    await service.from("whatsapp_sessions").delete().eq("phone", phone);
    businessId = business.id;
    say(`✅ Linked to *${business.name}*.\n\nTell me what you need in your own words, like:\n“Invoice Ada for 2 logo designs at 150k”\n“Who owes me?”\n“INV-0042 has been paid”\n\nNothing goes to a customer and no payment is recorded until you reply *YES*.\n\n${MENU}`);
    // so they notice if it wasn't them
    try {
      const { data: u } = await service.auth.admin.getUserById(row.user_id);
      if (u?.user?.email && (await emailConfigured())) await sendEmail({ to: u.user.email, ...whatsappLinkedEmail({ phone: prettyPhone(phone), business: business.name, link: `${site}/app/settings/whatsapp` }) });
    } catch { /* the link still works */ }
  }
}

// the AI turn: reads and drafts run; changes come back as a pending YES
async function viaAi(act, history, text, cfg) {
  const tools = aiTools(act);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  let pending = null;
  const callTool = async (name, input) => {
    const t = byName[name];
    if (!t) return `There's no tool called ${name}.`;
    const parsed = z.object(t.shape).safeParse(input || {});
    if (!parsed.success) return `The details didn't fit: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
    const args = parsed.data;
    if (CONFIRM_TOOLS.includes(name)) {
      if (pending) return "Another change is already waiting for the person's YES. Stop and let them answer.";
      const doc = await act.doc(args.document);
      if (!doc) return `No document "${args.document}" in this business. Use list_documents to find it.`;
      const action = { send_document: "send", record_payment: "pay", send_receipt: "receipt", convert_quote_to_invoice: "convert", void_document: "void" }[name];
      const { document, ...rest } = args;
      pending = { action, ref: doc.number, args: action === "pay" ? { ...rest, amount: rest.amount ?? "full" } : rest };
      return "Waiting for the person to reply YES; they've been shown what will happen. Don't call more tools.";
    }
    const r = await act.run(name, args);
    return (r.content || []).map((c) => c.text).join("\n") || "Done.";
  };
  const said = await runAi({ ai: cfg.ai, system: systemPrompt(act), history, message: text, tools, callTool });
  if (pending) {
    const doc = await act.doc(pending.ref);
    // the summary the model gave (e.g. a new draft) stays; the confirmation is ours, exact
    const intro = said && !/\byes\b/i.test(said) ? `${said}\n\n` : "";
    return { reply: `${intro}${describePending(pending, doc?.view)}`, pending };
  }
  return { reply: said || MENU, pending: null };
}
