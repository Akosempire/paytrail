// Every email Usetally sends, written once. Each returns { subject, html, text }
// for sendEmail(). Layout and design rules live in lib/email-layout.js.
import { BRAND } from "./brand.js";
import { PAYMENT_PROBLEMS } from "@/lib/admin-messages-core";
import { renderCelebration, renderEmail } from "./email-layout.js";
import { renderAnnouncement } from "./email-announcement.js";
import { documentBlock } from "./email-docview.js";
import { formatMoney } from "./money.js";
import { formatDate } from "./format.js";

const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";
// "123 456", "1234 567", "1234 5678": codes can be 6 to 10 digits (Supabase setting)
const pretty = (code) => { const c = String(code); return /^\d{6,10}$/.test(c) ? `${c.slice(0, Math.ceil(c.length / 2))} ${c.slice(Math.ceil(c.length / 2))}` : c; };
const NOT_YOU = { intent: "warning", title: "Didn't ask for this?", text: "You can ignore this email. Nothing changes unless the code or link is used. Never share it with anyone, including us." };

const build = (subject, opts) => ({ subject, ...renderEmail(opts) });

// ---- account ---------------------------------------------------------------

export function signupCodeEmail({ name, code, link }) {
  return build(`${pretty(code)} is your ${BRAND.name} sign-up code`, {
    preheader: `Your code is ${pretty(code)}. It expires in 1 hour.`,
    eyebrow: "Confirm your email",
    heading: String(name || "").trim() ? `Welcome to ${BRAND.name}, ${first(name)}` : `Welcome to ${BRAND.name}`,
    paragraphs: ["Enter this code on the sign-up page to confirm your email and set up your business."],
    code: { value: code, caption: "Expires in 1 hour" },
    button: link ? { text: "Confirm my email", url: link } : null,
    note: { ...NOT_YOU, text: "Someone may have typed your email by mistake. If it wasn't you, ignore this email and no account will be created." },
  });
}

export function resetCodeEmail({ code, link }) {
  return build(`${pretty(code)} is your ${BRAND.name} password reset code`, {
    preheader: `Reset your password with code ${pretty(code)}. It expires in 1 hour.`,
    eyebrow: "Password reset",
    heading: "Choose a new password",
    paragraphs: ["Enter this code on the reset page, or use the button, to choose a new password for your account."],
    code: { value: code, caption: "Expires in 1 hour" },
    button: link ? { text: "Reset my password", url: link } : null,
    note: { ...NOT_YOU, text: "Your password stays the same unless this code or link is used. If you didn't ask, someone may have typed your email by mistake." },
  });
}

export function securityCodeEmail({ code, action, businessName, minutes = 10 }) {
  return build(`${pretty(code)} is your ${BRAND.name} security code`, {
    preheader: `Use ${pretty(code)} to ${action}. It expires in ${minutes} minutes.`,
    eyebrow: "Security check",
    heading: "Confirm it's you",
    paragraphs: [`Use this code to ${action}${businessName ? ` for ${businessName}` : ""}.`],
    code: { value: code, caption: `Expires in ${minutes} minutes` },
    note: { intent: "error", title: "Not you? Act now.", text: "Don't share this code. Change your password straight away, because someone may be signed in to your account. We never ask for codes by phone or chat." },
  });
}

export function deletionScheduledEmail({ businessName, date }) {
  return build(`${businessName} is scheduled for deletion`, {
    preheader: `Everything in ${businessName} will be deleted on ${formatDate(date)}.`,
    eyebrow: "Privacy & data",
    heading: "Your business is scheduled for deletion",
    paragraphs: [
      `${businessName} and all of its quotes, invoices, receipts, customers and team access will be permanently deleted on ${formatDate(date)}.`,
      "Until then, you can download a copy of your data or cancel the deletion from Settings → Privacy & data.",
    ],
    details: [["Business", businessName], ["Deletes on", formatDate(date)]],
    note: { intent: "warning", title: "Didn't ask for this?", text: "Sign in and cancel it straight away, then change your password." },
  });
}

export function adminAlertEmail({ subject, heading, lines = [], link }) {
  return build(`[${BRAND.name}] ${subject}`, {
    preheader: lines[0] || subject,
    eyebrow: "Admin alert",
    heading: heading || subject,
    paragraphs: lines,
    button: link ? { text: "Open admin", url: link } : null,
    footer: `Automatic alert from your ${BRAND.name} platform. Set who receives these with ADMIN_ALERT_EMAILS.`,
  });
}

// ---- Ideas & help ------------------------------------------------------------

// the team answered someone's message in Ideas & help
export function teamReplyEmail({ name, subject, reply, link, app = BRAND.name }) {
  return build(`Re: ${subject}`, {
    preheader: reply.slice(0, 120),
    eyebrow: `Reply from the ${app} team`,
    heading: `Hi ${first(name)}, we replied`,
    paragraphs: [`About “${subject}”:`, reply],
    button: { text: "Open the conversation", url: link },
    footer: `You're getting this because you wrote to the ${app} team from the app. Reply in the app so the whole conversation stays together.`,
  });
}

// ---- TrackOja (sent for it, /api/notify/trackoja) ---------------------------

export function trackojaEmail({ subject, heading, lines, details = [], button }) {
  return build(subject, {
    preheader: lines[0] || subject,
    brand: { name: "TrackOja", color: "#1570EF" },
    eyebrow: "TrackOja",
    heading,
    paragraphs: lines,
    details,
    button,
    footer: "Sent by TrackOja about your store. Turn daily emails off in TrackOja → Settings.",
  });
}

// ---- business → customer ---------------------------------------------------

// color: the accent of the template the business picked for this document (lib/email-document.js)
const brandOf = (b, logo, color) => ({ name: b.name, color: color || b.brand_color, logo });
const attachedNote = (kind, number) => `Your ${kind} ${number} is attached as a PDF.`;

// model (lib/doc-model.js): when given, the document itself is in the email body
export function documentEmail({ business, logo, doc, link, color, attached = false, model = null }) {
  const quote = doc.kind === "quote";
  const due = doc.total_minor - (doc.amount_paid_minor || 0);
  return build(`${quote ? "Quotation" : "Invoice"} ${doc.number} from ${business.name}`, {
    brand: brandOf(business, logo, color),
    preheader: quote ? `${formatMoney(doc.total_minor, doc.currency)}${doc.title ? ` · ${doc.title}` : ""}. Review and accept online.` : `${formatMoney(due, doc.currency)} due${doc.due_date ? ` by ${formatDate(doc.due_date)}` : ""}. Pay online in a few taps.`,
    eyebrow: quote ? "Quotation" : "Invoice",
    heading: quote ? `Your quotation from ${business.name}` : `Invoice ${doc.number} from ${business.name}`,
    paragraphs: [
      `Hi ${first(doc.customer_name)},`,
      quote
        ? `Here's our quotation${doc.title ? ` for ${doc.title}` : ""}${model ? ", below" : ""}. You can review it, accept it and pay online from the link${model ? "" : " below"}. No account needed.`
        : `Here's your invoice${doc.title ? ` for ${doc.title}` : ""}${model ? ", below" : ""}. You can view it and pay online from the link${model ? "" : " below"}.`,
      ...(attached ? [attachedNote(quote ? "quotation" : "invoice", doc.number)] : []),
    ],
    document: documentBlock(model, link),
    details: quote
      ? [["Quotation", doc.number], ["Total", formatMoney(doc.total_minor, doc.currency)], ["Valid until", doc.valid_until ? formatDate(doc.valid_until) : null]]
      : [["Invoice", doc.number], ["Amount due", formatMoney(due, doc.currency)], ["Due date", doc.due_date ? formatDate(doc.due_date) : null]],
    button: { text: quote ? "View quotation" : "View & pay invoice", url: link },
    footer: `Sent by ${business.name} using ${BRAND.name}. Reply to this email to reach ${business.name}.`,
  });
}

// From the send sheet: the business's own subject and message (variables
// already filled in), the same details and button as documentEmail, and a
// link to the PDF when they chose to include it.
const escText = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function sentDocumentEmail({ business, logo, doc, link, subject, paragraphs, pdfLink, color, attached = false, model = null }) {
  const base = documentEmail({ business, logo, doc, link, color, attached, model });
  if (!paragraphs?.length && !subject && !pdfLink) return base;
  const quote = doc.kind === "quote";
  const due = doc.total_minor - (doc.amount_paid_minor || 0);
  const body = paragraphs?.length ? paragraphs : null;
  return build(subject || base.subject, {
    brand: brandOf(business, logo, color),
    preheader: quote ? `${formatMoney(doc.total_minor, doc.currency)}${doc.title ? ` · ${doc.title}` : ""}. Review and accept online.` : `${formatMoney(due, doc.currency)} due${doc.due_date ? ` by ${formatDate(doc.due_date)}` : ""}. Pay online in a few taps.`,
    eyebrow: quote ? "Quotation" : "Invoice",
    heading: quote ? `Your quotation from ${business.name}` : `Invoice ${doc.number} from ${business.name}`,
    paragraphs: [
      ...(body || [`Hi ${first(doc.customer_name)},`, quote ? "Here's our quotation. You can review it, accept it and pay online from the link below." : "Here's your invoice. You can view it and pay online from the link below."])
        .map((x) => (String(x).includes("\n") ? { html: String(x).split("\n").map(escText).join("<br>") } : x)),
      ...(attached ? [attachedNote(quote ? "quotation" : "invoice", doc.number)]
        : pdfLink ? [{ html: `Prefer a file? <a href="${escText(pdfLink)}" style="color:inherit;text-decoration:underline">Download the PDF</a>.` }] : []),
    ],
    document: documentBlock(model, link),
    details: quote
      ? [["Quotation", doc.number], ["Total", formatMoney(doc.total_minor, doc.currency)], ["Valid until", doc.valid_until ? formatDate(doc.valid_until) : null]]
      : [["Invoice", doc.number], ["Amount due", formatMoney(due, doc.currency)], ["Due date", doc.due_date ? formatDate(doc.due_date) : null]],
    button: { text: quote ? "View quotation" : "View & pay invoice", url: link },
    footer: `Sent by ${business.name} using ${BRAND.name}. Reply to this email to reach ${business.name}.`,
  });
}

// business ← their client opened the invoice (at most once a day per invoice)
export function documentViewedEmail({ business, doc, link }) {
  const quote = doc.kind === "quote";
  const due = doc.total_minor - (doc.amount_paid_minor || 0);
  const who = doc.customer_company || doc.customer_name || "Your client";
  return build(`${who} opened ${doc.number}`, {
    preheader: `${who} just opened ${quote ? "your quotation" : "your invoice"} ${doc.number}.`,
    eyebrow: quote ? "Quotation viewed" : "Invoice viewed",
    heading: `${who} opened ${doc.number}`,
    paragraphs: [quote ? "They're looking at your quotation now. A quick follow-up often helps them decide." : "They're looking at your invoice now. It's also in the invoice's activity."],
    details: [[quote ? "Quotation" : "Invoice", doc.number], [quote ? "Total" : "Amount due", formatMoney(quote ? doc.total_minor : due, doc.currency)], ["Due date", !quote && doc.due_date ? formatDate(doc.due_date) : null]],
    button: { text: `Open ${doc.number}`, url: link },
    footer: `You get this once a day at most for each ${quote ? "quotation" : "invoice"}. ${BRAND.name} for ${business.name}.`,
  });
}

export function receiptEmail({ business, logo, receipt, documentNumber, link, color, attached = false, model = null }) {
  return build(`Receipt ${receipt.number} from ${business.name}`, {
    brand: brandOf(business, logo, color),
    preheader: `${formatMoney(receipt.amount_minor, receipt.currency)} received for ${documentNumber}. Thank you.`,
    eyebrow: "Payment received",
    heading: "Thank you for your payment",
    paragraphs: [attached ? `We've received your payment for ${documentNumber}. Your receipt ${receipt.number} is attached as a PDF, and you can view it online too.` : `We've received your payment for ${documentNumber}. Your receipt is ready to view, download or print.`],
    details: [["Receipt", receipt.number], ["For", documentNumber], ["Amount paid", formatMoney(receipt.amount_minor, receipt.currency)], ["Date", receipt.paid_at || receipt.created_at ? formatDate(receipt.paid_at || receipt.created_at) : null]],
    document: documentBlock(model, link),
    button: { text: "View receipt", url: link },
    footer: `Sent by ${business.name} using ${BRAND.name}. Reply to this email to reach ${business.name}.`,
  });
}

export function inviteEmail({ business, logo, inviter, roleLabel, link }) {
  return build(`Join ${business.name} on ${BRAND.name}`, {
    brand: brandOf(business, logo),
    preheader: `${inviter} invited you to join ${business.name} as ${roleLabel}.`,
    eyebrow: "Team invitation",
    heading: `You're invited to ${business.name}`,
    paragraphs: [`${inviter} added you as ${roleLabel} on ${BRAND.name}, where ${business.name} prepares quotes, invoices and receipts.`],
    details: [["Business", business.name], ["Your role", roleLabel], ["Invited by", inviter]],
    button: { text: "Accept invitation", url: link },
    note: { intent: "info", title: "Link expires in 7 days", text: "Sign in or create an account with this email address to join." },
    footer: `Sent by ${business.name} using ${BRAND.name}.`,
  });
}

// ---- Usetally → the business's team ----------------------------------------

export function claimsDigestEmail({ business, claims, total, link }) {
  const n = claims.length;
  return build(n === 1 ? `1 bank transfer to confirm for ${business.name}` : `${n} bank transfers to confirm for ${business.name}`, {
    preheader: `${total} that customers say they've sent. Check your bank, then confirm.`,
    eyebrow: "Transfers to confirm",
    heading: n === 1 ? "A customer says they've paid" : `${n} customers say they've paid`,
    paragraphs: [`Check your bank account, then confirm each one in ${BRAND.name}. Confirming records the payment and sends the customer their receipt.`],
    details: claims.slice(0, 10).map((c) => [`${c.number} · ${c.payer}`, c.amount]),
    button: { text: "Check and confirm", url: link },
    note: { intent: "info", title: "Nothing is recorded yet", text: "Only confirm once you see the money in your account." },
    footer: `Daily summary sent to ${business.name}'s team by ${BRAND.name}.`,
  });
}

// ---- VAT returns -------------------------------------------------------------

// ---- free access -------------------------------------------------------------

export function freeAccessEmail({ name, businessName, plan, months, until, link }) {
  const span = months === 12 ? "A free year" : months === 1 ? "A free month" : `${months} free months`;
  const origin = new URL(link).origin;
  return { subject: `🎁 ${span} of Usetally, on us`, ...renderCelebration({
    preheader: `Usetally ${plan.name} for ${businessName}, free until ${until}.`,
    logo: `${origin}/email/logo.png`,
    image: { src: `${origin}/email/gift.png`, alt: "A gift" },
    kicker: "A gift for you",
    heading: `${span} of Usetally ${plan.name} 🎉`,
    sub: `Hi ${first(name)}, it's on us. No card, nothing to pay.`,
    stub: [["For", businessName], ["Valid until", until], ["You pay", "Nothing"]],
    perks: [["🎨", "Your logo"], ["💸", "Paid direct"], ["🧾", "Tax sorted"]],
    button: { text: "Open Usetally", url: link },
    note: "Nothing is charged when it ends.",
  }) };
}

export function vatRequestConsultantEmail({ consultant, business, periodLabel, vat, due, link }) {
  return build(`New VAT return to file: ${business.name}, ${periodLabel}`, {
    preheader: `${business.name} asked for their ${periodLabel} VAT return to be filed. Due ${due}.`,
    eyebrow: "VAT return to file",
    heading: `${business.name}: ${periodLabel} VAT`,
    paragraphs: [`Hello ${first(consultant.name)}, ${business.name} asked Usetally to file their ${periodLabel} VAT return. Their numbers, TIN and invoice export are on your page. Once filed on Rev360, enter the filing reference, the amount to pay and the payment reference, and upload the acknowledgement.`],
    details: [["Business", business.name], ["TIN", business.tax_id || "Not added yet"], ["VAT charged", vat], ["Due", due]],
    button: { text: "Open the request", url: link },
    note: { intent: "info", title: "Getting access", text: "Ask the business to give you access in Rev360. They should never share their password." },
    footer: `Sent by ${BRAND.name}. This link is private to you.`,
  });
}

export function vatFiledEmail({ business, periodLabel, amount, reference, due, filedBy, link }) {
  return build(`Your ${periodLabel} VAT return is filed: pay ${amount} by ${due}`, {
    preheader: `Payment reference ${reference || "on Rev360"}. Pay by ${due}.`,
    eyebrow: "VAT return filed",
    heading: `${periodLabel} VAT: filed`,
    paragraphs: [`${filedBy} filed ${business.name}'s ${periodLabel} VAT return. Pay the amount below on Rev360, Remita or through your bank, then tap "I've paid" in Usetally and upload the receipt.`],
    details: [["Amount to pay", amount], ["Payment reference", reference || "See Rev360"], ["Pay by", due]],
    button: { text: "Open in Usetally", url: link },
    footer: `Sent to ${business.name}'s team by ${BRAND.name}.`,
  });
}

export function vatReminderEmail({ business, periodLabel, vat, due, days, status, link }) {
  const filed = status === "filed";
  return build(`${days} day${days === 1 ? "" : "s"} left: ${periodLabel} VAT ${filed ? "payment" : "return"} due ${due}`, {
    preheader: `${periodLabel} VAT: ${vat}. Due ${due}.`,
    eyebrow: "VAT due soon",
    heading: filed ? `Pay your ${periodLabel} VAT by ${due}` : `Your ${periodLabel} VAT return is due ${due}`,
    paragraphs: [filed ? `The return is filed. Pay it before the deadline, then upload the receipt in Usetally.` : `${business.name} charged ${vat} VAT in ${periodLabel}. File it yourself, or tap "File & pay for me" and a tax consultant handles it.`],
    details: [["VAT charged", vat], ["Due", due]],
    button: { text: filed ? "Mark as paid" : "File it now", url: link },
    footer: `Reminder from ${BRAND.name}. VAT returns are due on the 21st of the following month.`,
  });
}

// ---- invoice reminders (Settings → Reminders) --------------------------------

// subject and message are the business's own rule text, already filled in
export function invoiceReminderEmail({ business, logo, doc, subject, message, link, color, attached = false, model = null }) {
  const due = Number(doc.total_minor || 0) - Number(doc.amount_paid_minor || 0);
  return build(subject, {
    brand: brandOf(business, logo, color),
    preheader: `${formatMoney(due, doc.currency)} due${doc.due_date ? ` by ${formatDate(doc.due_date)}` : ""}.`,
    eyebrow: "Payment reminder",
    heading: `Invoice ${doc.number}`,
    paragraphs: [...String(message || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean), ...(attached ? [attachedNote("invoice", doc.number)] : [])],
    details: [["Invoice", doc.number], ["Amount due", formatMoney(due, doc.currency)], ["Due date", doc.due_date ? formatDate(doc.due_date) : null]],
    document: documentBlock(model, link),
    button: { text: "View & pay invoice", url: link },
    footer: `Sent by ${business.name} using ${BRAND.name}. Reply to this email to reach ${business.name}.`,
  });
}

// ---- Usetally billing: an upgrade that wasn't paid (lib/subscription-recovery.js) ----
export function upgradeRetryEmail({ name, business, plan, amount, link }) {
  return build(`Your ${BRAND.name} upgrade didn't go through`, {
    preheader: `${plan} for ${business} wasn't paid. Here's a fresh link, and other ways to pay.`,
    eyebrow: "Upgrade not completed",
    heading: "Your upgrade didn't go through",
    paragraphs: [
      `Hi ${first(name) || "there"},`,
      `You started ${plan} for ${business} (${amount}), but the payment wasn't completed, so nothing was charged.`,
      "These are the usual reasons, and what helps:",
      { html: PAYMENT_PROBLEMS.map(([p, fix]) => `• <strong>${escText(p)}</strong>: ${escText(fix)}`).join("<br>") },
      "If it still won't go through, just reply to this email and we'll help you pay another way, such as a bank transfer.",
    ],
    details: [["Plan", plan], ["Business", business], ["Amount", amount]],
    button: { text: "Try again", url: link },
    footer: `You're getting this because you started an upgrade on ${BRAND.name}. We only send this once.`,
  });
}

// ---- a message the Usetally team starts (Admin → a business → Message) ----
// Admin → Announcements: news from the team to every business owner (own design: lib/email-announcement.js)
export function announcementEmail({ title, body, link, label, name }) {
  let site = "";
  try { site = link ? new URL(link).origin : ""; } catch { /* relative or bad link: no logo */ }
  return { subject: title, ...renderAnnouncement({ title, body, link, label, name, site }) };
}

export function teamMessageEmail({ subject, body, link }) {
  const paras = String(body || "").replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => (p.includes("\n") ? { html: p.split("\n").map(escText).join("<br>") } : p));
  return build(subject, {
    preheader: String(body || "").replace(/\s+/g, " ").slice(0, 120),
    eyebrow: `From the ${BRAND.name} team`,
    heading: subject,
    paragraphs: paras,
    button: { text: `Reply in ${BRAND.name}`, url: link },
    footer: `Sent by the ${BRAND.name} team. Reply to this email or in the app, whichever is easier.`,
  });
}
