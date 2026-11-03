// Announcements (Admin → Announcements): a dashboard banner and one email to
// each business owner. Pure, tested in node.

export const DRAFT = {
  title: "Usetally now works inside ChatGPT",
  body: [
    "Run your business by chatting. Ask ChatGPT, Claude or Grok to make a quote, send an invoice or tell you who still owes you, and Usetally does it.",
    [
      "• Make quotes and invoices: describe the job, get a branded draft in seconds.",
      "• Send and chase: email it to your customer and see who's overdue.",
      "• Record payments: log a transfer and the receipt goes out by itself.",
    ].join("\n"),
    "It's in beta. On ChatGPT, connect it through Developer mode while our app waits for directory approval. On Claude and Grok, add it as a custom connector. Your assistant only does what your team role allows, makes drafts first, and asks before sending anything or recording a payment.",
  ].join("\n\n"),
  link_href: "/app/settings/ai",
  link_label: "Connect your assistant",
};

export function checkAnnouncement(input = {}) {
  const title = String(input.title || "").replace(/\s+/g, " ").trim();
  const body = String(input.body || "").replace(/\r\n/g, "\n").trim();
  const link_href = String(input.link_href || "").trim();
  const link_label = String(input.link_label || "").replace(/\s+/g, " ").trim();
  if (title.length < 3) return { error: "Add a title." };
  if (title.length > 120) return { error: "Keep the title under 120 characters." };
  if (body.length > 2000) return { error: "Keep the message under 2,000 characters." };
  if (link_href && !/^\/[^\s/][^\s]*$|^https:\/\/[^\s]+$/.test(link_href)) return { error: "The link must start with / (a Usetally page) or https://." };
  if (link_href && !link_label) return { error: "Add a button label for the link." };
  if (link_label.length > 40) return { error: "Keep the button label short." };
  const audience = input.audience === "selected" ? "selected" : "all";
  const business_ids = audience === "selected" ? [...new Set((input.business_ids || []).map(String).filter((x) => UUID.test(x)))].slice(0, 500) : [];
  if (audience === "selected" && !business_ids.length) return { error: "Pick at least one business, or send it to everyone." };
  return { ok: true, value: { title, body, link_href, link_label, audience, business_ids } };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// is this announcement for this business? (the database checks too)
export const isFor = (a, businessId) => !a?.audience || a.audience === "all" || (a.business_ids || []).includes(businessId);

// "Everyone" or "3 businesses"
export const audienceLabel = (a) => (a?.audience === "selected" ? `${(a.business_ids || []).length} selected business${(a.business_ids || []).length === 1 ? "" : "es"}` : "Everyone");

// one address per owner, skipping businesses being deleted and duplicates
export function ownerRecipients(rows = []) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const email = String(r.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email) || r.businesses?.deletion_requested_at) continue;
    seen.add(email);
    out.push({ email, name: r.full_name || "" });
  }
  return out;
}

export const absoluteLink = (site, href) => (!href ? site + "/app" : href.startsWith("/") ? site + href : href);
