// Announcements (Admin → Announcements): a dashboard banner and one email to
// each business owner. Pure, tested in node.

export const DRAFT = {
  title: "Usetally now works inside ChatGPT (beta)",
  body: [
    "You can now create quotes and invoices, send them, record payments and check what you're owed just by chatting with ChatGPT. It works with Claude and Grok too.",
    "It's in beta. On ChatGPT you connect it through Developer mode for now, while our app waits for approval in the ChatGPT directory. On Claude and Grok, add it as a custom connector.",
    "Your assistant only does what your team role allows. It makes drafts first, and asks you before sending anything or recording a payment.",
  ].join("\n\n"),
  link_href: "/app/settings/ai",
  link_label: "Set it up",
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
  return { ok: true, value: { title, body, link_href, link_label } };
}

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
