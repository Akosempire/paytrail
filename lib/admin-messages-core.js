// Messages the Usetally team sends a business from the admin dashboard
// (Admin → a business → Message). Each arrives by email and in the business
// owner's Ideas & help, where they can reply. Pure, tested in node.

// the usual reasons a card payment doesn't finish, and what helps with each
export const PAYMENT_PROBLEMS = [
  ["The bank's one-time code (OTP) didn't arrive or timed out", "try again and keep the page open until the code arrives."],
  ["The card isn't switched on for online or international payments", "turn it on in your bank app, or ask your bank."],
  ["The card's limit or balance was too low for the amount", "try another card, or pick the monthly plan."],
  ["The bank stopped it as an unusual payment", "approve it in your bank app, then try again."],
];

export const problemLines = () => PAYMENT_PROBLEMS.map(([p, fix]) => `• ${p}: ${fix}`);

export const MESSAGE_TEMPLATES = {
  upgrade_unpaid: {
    label: "Upgrade not paid",
    subject: "Your Usetally upgrade didn't go through",
    body: ({ firstName, plan, amount, billingLink }) => [
      `Hi ${firstName},`,
      `You started ${plan}${amount ? ` (${amount})` : ""} but the payment didn't finish, so nothing was charged.`,
      "These are the usual reasons, and what helps:",
      problemLines().join("\n"),
      `You can try again here: ${billingLink}`,
      "If it still won't go through, just reply here and we'll help you pay another way, such as a bank transfer.",
      "Thank you for choosing Usetally.",
    ].join("\n\n"),
  },
  check_in: {
    label: "Check in",
    subject: "How is Usetally working for you?",
    body: ({ firstName, business }) => [
      `Hi ${firstName},`,
      `Thanks for using Usetally for ${business}. Is everything working the way you need it to?`,
      "If anything is confusing or missing, reply here and tell us. We read every message.",
    ].join("\n\n"),
  },
  blank: { label: "Blank", subject: "", body: ({ firstName }) => `Hi ${firstName},\n\n` },
};

export function fillTemplate(key, vars = {}) {
  const t = MESSAGE_TEMPLATES[key] || MESSAGE_TEMPLATES.blank;
  const v = { firstName: String(vars.name || "").trim().split(/\s+/)[0] || "there", business: vars.business || "your business", plan: vars.plan || "a paid plan", amount: vars.amount || "", billingLink: vars.billingLink || "" };
  return { subject: t.subject, body: t.body(v) };
}

export function checkMessage({ subject, body }) {
  const s = String(subject || "").replace(/\s+/g, " ").trim();
  const b = String(body || "").replace(/\r\n/g, "\n").trim();
  if (s.length < 3) return { ok: false, error: "Add a subject (at least 3 characters)." };
  if (s.length > 140) return { ok: false, error: "Keep the subject under 140 characters." };
  if (!b) return { ok: false, error: "Write the message." };
  if (b.length > 5000) return { ok: false, error: "Keep the message under 5,000 characters." };
  return { ok: true, subject: s, body: b };
}
