import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
const core = await import("../lib/whatsapp/core.js");
const { guided, describePending, executePending } = await import("../lib/whatsapp/guided.js");

test("phone numbers: any way people write them → digits with the country code", () => {
  assert.equal(core.normPhone("whatsapp:+2348012345678"), "2348012345678");
  assert.equal(core.normPhone("+234 801 234 5678"), "2348012345678");
  assert.equal(core.normPhone("0801 234 5678"), "2348012345678");
  assert.equal(core.normPhone("08012345678", "Ghana"), "2338012345678");
  assert.equal(core.normPhone("0244 123 456", "Ghana"), "233244123456");
  assert.equal(core.normPhone("00447700900123"), "447700900123");
  assert.equal(core.normPhone("+1 415 523 8886"), "14155238886");
  assert.equal(core.normPhone("hello"), "");
  assert.equal(core.normPhone("123"), "");
});

test("Twilio's signature: matches Twilio's documented recipe, and rejects changes", () => {
  const token = "12345", url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
  // the example from Twilio's webhook security docs
  assert.equal(core.twilioSignature(token, url, params), "0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  const sig = core.twilioSignature(token, url, params);
  assert.equal(core.verifyTwilioSignature(token, url, params, sig), true);
  assert.equal(core.verifyTwilioSignature(token, url, { ...params, Digits: "9999" }, sig), false, "a changed field");
  assert.equal(core.verifyTwilioSignature("other", url, params, sig), false, "another token");
  assert.equal(core.verifyTwilioSignature(token, url, params, ""), false);
  // same as computing it by hand
  const manual = createHmac("sha1", token).update(url + Object.keys(params).sort().map((k) => k + params[k]).join("")).digest("base64");
  assert.equal(sig, manual);
});

test("link codes: readable, and found in what people send", () => {
  let n = 0;
  const code = core.makeCode((max) => (n++ * 7) % max);
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(core.parseLinkCode("LINK K7Q2MX"), "K7Q2MX");
  assert.equal(core.parseLinkCode("link k7q2mx"), "K7Q2MX");
  assert.equal(core.parseLinkCode("K7Q2MX"), "K7Q2MX");
  assert.equal(core.parseLinkCode("HELLO1"), null, "has an I/O/L/1-free alphabet");
  assert.equal(core.parseLinkCode("INVOICE"), null);
  assert.equal(core.parseLinkCode("Hello"), null);
  assert.equal(core.parseLinkCode("ABCDEF"), null, "words without a digit aren't codes");
});

test("amounts typed in a chat", () => {
  assert.equal(core.parseAmount("150000"), 150000);
  assert.equal(core.parseAmount("150,000"), 150000);
  assert.equal(core.parseAmount("₦150k"), 150000);
  assert.equal(core.parseAmount("1.5m"), 1500000);
  assert.equal(core.parseAmount("N 20,000.50"), 20000.5);
  assert.equal(core.parseAmount("abc"), null);
  assert.equal(core.parseAmount("0"), null);
});

test("item lines: description, quantity and price", () => {
  const { items, bad } = core.parseItems("Logo design 150000\n2 x Business cards @ 15k\n3 chairs 5,000 each\nChairs x2 4000\nDesign 5000\nLogo design - ₦50,000\nno price here");
  assert.deepEqual(items, [
    { description: "Logo design", quantity: 1, unit_price: 150000 },
    { description: "Business cards", quantity: 2, unit_price: 15000 },
    { description: "chairs", quantity: 3, unit_price: 5000 },
    { description: "Chairs", quantity: 2, unit_price: 4000 },
    { description: "Design", quantity: 1, unit_price: 5000 },
    { description: "Logo design", quantity: 1, unit_price: 50000 },
  ]);
  assert.deepEqual(bad, ["no price here"]);
});

test("document numbers, yes/no, message splitting and WhatsApp formatting", () => {
  assert.equal(core.parseDocRef("paid inv-0042 50k"), "INV-0042");
  assert.equal(core.parseDocRef("convert QT 7"), "QT-7");
  assert.equal(core.parseDocRef("hello"), null);
  for (const y of ["yes", "Yes!", "ok", "👍", "confirm", "go ahead"]) assert.equal(core.isYes(y), true, y);
  for (const n of ["no", "No.", "cancel"]) assert.equal(core.isNo(n), true, n);
  assert.equal(core.isYes("yes but change the price"), false);
  const parts = core.splitMessage(Array.from({ length: 100 }, (_, i) => `Line ${i} ${"x".repeat(40)}`).join("\n"), 500);
  assert.ok(parts.length > 5 && parts.every((p) => p.length <= 500));
  assert.equal(core.toWhatsapp("**Total**: ₦5,000\n## Heading\n[Pay](https://x.y/z)"), "*Total*: ₦5,000\nHeading\nPay: https://x.y/z");
  assert.deepEqual(core.templateVars({ customer: "Ada", business: "Obi Foods", label: "invoice INV-0042", amount: "₦150,000", token: "abc" }), { 1: "Ada", 2: "Obi Foods", 3: "invoice INV-0042", 4: "₦150,000", 5: "abc" });
});

// ---- the guided bot, with a fake business
function fakeAct() {
  const calls = [];
  const docs = {
    "INV-0042": { id: "1", kind: "invoice", number: "INV-0042", status: "sent", customer_name: "Ada", customer_phone: "", customer_email: "ada@x.ng", view: { number: "INV-0042", kind: "invoice", customer: { name: "Ada", phone: "", email: "ada@x.ng" }, total: "₦150,000.00", still_owed: "₦150,000.00", currency: "NGN", items: [] } },
    "QT-0007": { id: "2", kind: "quote", number: "QT-0007", status: "sent", customer_name: "Tunde", customer_phone: "2348011111111", customer_email: "", view: { number: "QT-0007", kind: "quote", customer: { name: "Tunde", phone: "2348011111111" }, total: "₦80,000.00", items: [] } },
  };
  return {
    calls, business: { country: "Nigeria" },
    doc: async (ref) => docs[String(ref).toUpperCase()] || null,
    unpaid: async () => "₦150,000 owed",
    create: async (kind, input) => { calls.push(["create", kind, input]); return { doc: { number: kind === "quote" ? "QT-0008" : "INV-0043", kind, customer: { name: input.customer.name, phone: input.customer.phone || "", email: "" }, total: "₦180,000.00", items: [] } }; },
    send: async (ref, args) => { calls.push(["send", ref, args]); return `sent ${ref}`; },
    pay: async (ref, args) => { calls.push(["pay", ref, args]); return `paid ${ref}`; },
    receipt: async (ref, args) => { calls.push(["receipt", ref, args]); return `receipt ${ref}`; },
    convert: async (ref) => { calls.push(["convert", ref]); return { text: "Invoice INV-0044 created", doc: { number: "INV-0044" } }; },
    void: async (ref) => { calls.push(["void", ref]); return `void ${ref}`; },
  };
}

test("guided: a new invoice, then sent on WhatsApp to a number given along the way", async () => {
  const act = fakeAct();
  let r = await guided({ text: "1", act });
  assert.equal(r.state.flow, "new");
  r = await guided({ state: r.state, text: "Ada Obi 0801 234 5678", act });
  assert.deepEqual(r.state.customer, { name: "Ada Obi", phone: "2348012345678" });
  r = await guided({ state: r.state, text: "Logo design 150k\n2 x cards 15000", act });
  assert.equal(act.calls[0][0], "create");
  assert.equal(act.calls[0][2].items.length, 2);
  assert.match(r.reply, /INV-0043/);
  assert.equal(r.state.step, "channel");
  r = await guided({ state: r.state, text: "1", act });
  assert.deepEqual(act.calls.at(-1), ["send", "INV-0043", { channel: "whatsapp" }]);
  assert.deepEqual(r.state, {});
});

test("guided: WhatsApp for a customer with no number asks for it; cancel stops anything", async () => {
  const act = fakeAct();
  let r = await guided({ text: "send INV-0042", act });
  assert.equal(r.state.step, "channel");
  r = await guided({ state: r.state, text: "1", act });
  assert.equal(r.state.step, "phone");
  r = await guided({ state: r.state, text: "not a number", act });
  assert.equal(r.state.step, "phone");
  r = await guided({ state: r.state, text: "08099998888", act });
  assert.deepEqual(act.calls.at(-1), ["send", "INV-0042", { channel: "whatsapp", phone: "2348099998888" }]);
  r = await guided({ state: { flow: "pay", step: "amount", ref: "INV-0042" }, text: "cancel", act });
  assert.deepEqual(r.state, {});
  assert.equal(act.calls.filter((c) => c[0] === "pay").length, 0);
});

test("guided: marking paid always ends in a YES question, never pays directly", async () => {
  const act = fakeAct();
  let r = await guided({ text: "paid INV-0042 50k", act });
  assert.deepEqual(r.pending, { action: "pay", ref: "INV-0042", args: { amount: 50000, receipt: "none" } });
  assert.match(r.reply, /Reply \*YES\*/);
  r = await guided({ text: "paid inv-0042", act });
  assert.equal(r.pending.args.amount, "full");
  assert.match(r.reply, /full ₦150,000/);
  // the menu route
  r = await guided({ text: "4", act });
  r = await guided({ state: r.state, text: "INV-0042", act });
  r = await guided({ state: r.state, text: "full", act });
  r = await guided({ state: r.state, text: "2", act });
  assert.deepEqual(r.pending, { action: "pay", ref: "INV-0042", args: { amount: "full", receipt: "email" } });
  assert.equal(act.calls.filter((c) => c[0] === "pay").length, 0, "nothing recorded before YES");
  assert.equal(await executePending(act, r.pending), "paid INV-0042");
});

test("guided: convert asks first; unknown text shows the menu; who owes me", async () => {
  const act = fakeAct();
  let r = await guided({ text: "convert QT-0007", act });
  assert.equal(r.pending.action, "convert");
  assert.match(await executePending(act, r.pending), /INV-0044[\s\S]*send INV-0044/);
  r = await guided({ text: "convert INV-0042", act });
  assert.match(r.reply, /can't find quote/);
  r = await guided({ text: "blah", act });
  assert.match(r.reply, /1\. New invoice/);
  r = await guided({ text: "who owes me", act });
  assert.equal(r.reply, "₦150,000 owed");
});

test("the confirmation says exactly what will happen", () => {
  const doc = { number: "INV-0042", customer: { name: "Ada", phone: "2348012345678", email: "ada@x.ng" }, total: "₦150,000.00", still_owed: "₦100,000.00", currency: "NGN" };
  assert.match(describePending({ action: "send", ref: "INV-0042", args: { channel: "whatsapp" } }, doc), /Send INV-0042 \(₦150,000.00\) to Ada on WhatsApp \(\+2348012345678\)\?/);
  assert.match(describePending({ action: "send", ref: "INV-0042", args: { channel: "email" } }, doc), /by email \(ada@x\.ng\)/);
  assert.match(describePending({ action: "pay", ref: "INV-0042", args: { amount: "full", receipt: "whatsapp" } }, doc), /full ₦100,000.00 as paid on INV-0042 \(Ada\)\? The receipt goes to Ada on WhatsApp/);
  assert.match(describePending({ action: "void", ref: "INV-0042", args: {} }, doc), /can't be undone/);
});

// ---- AI providers: a pasted key picks its provider; model lists are filtered and ranked
const prov = await import("../lib/whatsapp/providers.js");
test("a pasted key picks its provider", () => {
  assert.equal(prov.providerOfKey("AIzaSyA1234567890abcdefghijklmnopqrs"), "gemini");
  assert.equal(prov.providerOfKey("gsk_abcdefghijklmnopqrstuvwxyz123456"), "groq");
  assert.equal(prov.providerOfKey("sk-ant-api03-abcdefghijklmnopqrstuvwx"), "anthropic");
  assert.equal(prov.providerOfKey("sk-proj-abcdefghijklmnopqrstuvwxyz"), "openai");
  assert.equal(prov.providerOfKey(' "gsk_abcdefghijklmnopqrstuvwxyz123456" '), "groq", "quotes and spaces from copying");
  assert.equal(prov.providerOfKey("nvapi-abcdefghijklmnopqrstuvwxyz12"), "nvidia");
  assert.equal(prov.providerOfKey("hello"), null);
  assert.equal(prov.providerOfKey("sk-or-v1-abcdefghijklmnopqrstuvwxyz1234"), "openrouter", "not mistaken for OpenAI");
  assert.deepEqual(prov.FREE_IDS, ["gemini", "groq", "nvidia", "openrouter"]);
});
test("model lists: chat models only, the bot's best fit first", () => {
  const g = prov.chatModels("gemini", [{ name: "models/gemini-2.5-pro" }, { name: "models/gemini-2.5-flash" }, { name: "models/gemini-2.5-flash-lite" }, { name: "models/text-embedding-004" }, { name: "models/gemini-2.5-flash-preview-tts" }, { name: "models/imagen-4.0-generate" }]);
  assert.deepEqual(g.map((m) => m.id), ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]);
  assert.equal(g[0].recommended, true);
  const q = prov.chatModels("groq", [{ id: "whisper-large-v3" }, { id: "llama-3.1-8b-instant" }, { id: "llama-3.3-70b-versatile" }, { id: "meta-llama/llama-guard-4-12b" }]);
  assert.deepEqual(q.map((m) => m.id), ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]);
  const n = prov.chatModels("nvidia", [{ id: "meta/llama-3.1-8b-instruct" }, { id: "nvidia/nv-embedqa-e5-v5" }, { id: "meta/llama-3.3-70b-instruct" }, { id: "meta/llama-3.2-11b-vision-instruct" }, { id: "nvidia/llama-3.2-nv-rerankqa-1b-v2" }]);
  assert.deepEqual(n.map((m) => m.id), ["meta/llama-3.3-70b-instruct", "meta/llama-3.1-8b-instruct"]);
  const r = prov.chatModels("openrouter", [{ id: "deepseek/deepseek-chat-v3-0324", supported_parameters: ["tools"] }, { id: "deepseek/deepseek-r1:free", supported_parameters: ["tools"] }, { id: "deepseek/deepseek-chat-v3-0324:free", supported_parameters: ["tools", "temperature"] }, { id: "some/model:free", supported_parameters: ["temperature"] }, { id: "meta-llama/llama-3.3-70b-instruct:free", supported_parameters: ["tools"] }]);
  assert.deepEqual(r.map((m) => m.id).sort(), ["deepseek/deepseek-chat-v3-0324:free", "deepseek/deepseek-r1:free", "meta-llama/llama-3.3-70b-instruct:free"]);
  assert.ok(r.every((m) => m.id.endsWith(":free")), "paid models left out");
  assert.equal(r[0].id, "deepseek/deepseek-chat-v3-0324:free");
  const o = prov.chatModels("openai", [{ id: "gpt-4.1-mini" }, { id: "gpt-4.1" }, { id: "text-embedding-3-small" }, { id: "gpt-4o-mini-tts" }, { id: "gpt-4.1-mini-2025-04-14" }, { id: "dall-e-3" }]);
  assert.deepEqual(o.map((m) => m.id), ["gpt-4.1-mini", "gpt-4.1"]);
});
test("tool schemas are trimmed to what Gemini accepts", () => {
  const s = prov.simpleSchema({ $schema: "x", type: "object", additionalProperties: false, properties: { a: { type: "string", maxLength: 5, default: "x" }, b: { type: ["number", "null"], exclusiveMinimum: 0 } }, required: ["a"] });
  assert.deepEqual(s, { type: "object", properties: { a: { type: "string" }, b: { type: "number", nullable: true } }, required: ["a"] });
});
