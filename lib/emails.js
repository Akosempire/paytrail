// Every email Usetally sends, written once. Each returns { subject, html, text }
// for sendEmail(). Layout and design rules live in lib/email-layout.js.
import { BRAND } from "./brand.js";
import { renderEmail } from "./email-layout.js";
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
    heading: `Welcome to ${BRAND.name}, ${first(name)}`,
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

// ---- business → customer ---------------------------------------------------

const brandOf = (b, logo) => ({ name: b.name, color: b.brand_color, logo });

export function documentEmail({ business, logo, doc, link }) {
  const quote = doc.kind === "quote";
  const due = doc.total_minor - (doc.amount_paid_minor || 0);
  return build(`${quote ? "Quotation" : "Invoice"} ${doc.number} from ${business.name}`, {
    brand: brandOf(business, logo),
    preheader: quote ? `${formatMoney(doc.total_minor, doc.currency)}${doc.title ? ` · ${doc.title}` : ""}. Review and accept online.` : `${formatMoney(due, doc.currency)} due${doc.due_date ? ` by ${formatDate(doc.due_date)}` : ""}. Pay online in a few taps.`,
    eyebrow: quote ? "Quotation" : "Invoice",
    heading: quote ? `Your quotation from ${business.name}` : `Invoice ${doc.number} from ${business.name}`,
    paragraphs: [
      `Hi ${first(doc.customer_name)},`,
      quote
        ? `Here's our quotation${doc.title ? ` for ${doc.title}` : ""}. You can review it, accept it and pay online from the link below. No account needed.`
        : `Here's your invoice${doc.title ? ` for ${doc.title}` : ""}. You can view it and pay online from the link below.`,
    ],
    details: quote
      ? [["Quotation", doc.number], ["Total", formatMoney(doc.total_minor, doc.currency)], ["Valid until", doc.valid_until ? formatDate(doc.valid_until) : null]]
      : [["Invoice", doc.number], ["Amount due", formatMoney(due, doc.currency)], ["Due date", doc.due_date ? formatDate(doc.due_date) : null]],
    button: { text: quote ? "View quotation" : "View & pay invoice", url: link },
    footer: `Sent by ${business.name} using ${BRAND.name}. Reply to this email to reach ${business.name}.`,
  });
}

export function receiptEmail({ business, logo, receipt, documentNumber, link }) {
  return build(`Receipt ${receipt.number} from ${business.name}`, {
    brand: brandOf(business, logo),
    preheader: `${formatMoney(receipt.amount_minor, receipt.currency)} received for ${documentNumber}. Thank you.`,
    eyebrow: "Payment received",
    heading: "Thank you for your payment",
    paragraphs: [`We've received your payment for ${documentNumber}. Your receipt is ready to view, download or print.`],
    details: [["Receipt", receipt.number], ["For", documentNumber], ["Amount paid", formatMoney(receipt.amount_minor, receipt.currency)], ["Date", receipt.paid_at || receipt.created_at ? formatDate(receipt.paid_at || receipt.created_at) : null]],
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
  const span = months === 12 ? "a free year" : months === 1 ? "a free month" : `${months} free months`;
  return build(`🎁 You've got ${span} of Usetally`, {
    preheader: `Usetally ${plan.name}, free until ${until}.`,
    brand: { name: BRAND.name, color: "#175cd3" },
    heading: `Hi ${first(name)}, enjoy ${span} on us`,
    pass: { label: "Free access", title: `Usetally ${plan.name}`, sub: "No card. Nothing to pay.", rows: [["For", businessName], ["Until", until]] },
    checklist: ["Your logo on every invoice", "Payments into your own account", "Tax done for you"],
    button: { text: "Open Usetally", url: link },
    footer: `Nothing is charged when it ends. ${BRAND.name}`,
  });
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
