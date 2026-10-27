import { BRAND } from "@/lib/brand";

// One plain description of Usetally, shared by the landing page metadata,
// structured data (JSON-LD), llms.txt and the sitemap, so search engines and
// AI assistants (ChatGPT, Gemini, Claude, Perplexity…) all read the same facts.
// Keep it factual: no ratings, reviews or customer counts we can't prove.

export const SEO = {
  title: "Usetally: quotes, invoices, payments and receipts in one place",
  short: "Invoicing and quotation software for small businesses: send branded quotes, turn them into invoices, get paid by bank transfer or online into your own Bachs, Paystack, Stripe or Flutterwave account, send receipts automatically, and see the tax you owe for any period.",
  description: "Usetally is invoicing and quotation software for small businesses and freelancers. Create branded quotes, turn accepted quotes into invoices, let customers pay online through your own Paystack, Stripe, Flutterwave or Bachs account (or by bank transfer), and issue receipts automatically. VAT, GST or sales tax is worked out on every invoice at your rate, with a tax summary and export for any period; in Nigeria, a tax consultant can file the VAT return for you. Track hidden costs and real profit on every job, work as a team with roles and approvals, and print on A4, Letter or 80 mm/58 mm thermal POS paper.",
  keywords: [
    "invoice software", "invoicing app", "invoice generator", "online invoicing", "quotation software", "quote maker",
    "estimate and invoice app", "receipt generator", "small business invoicing", "freelancer invoices",
    "send invoices online", "get paid online", "Paystack invoicing", "Stripe invoicing", "Flutterwave invoicing",
    "invoice app Nigeria", "VAT invoice Nigeria", "VAT return Nigeria", "invoice app Africa", "proforma invoice", "POS receipt printing", "job costing and profit",
  ],
  audience: "Small businesses, freelancers, agencies, contractors, printers, event and service businesses, in Africa and worldwide.",
  features: [
    ["Branded quotes", "Your logo, colours and templates. Customers accept a quote online with their name; no account needed."],
    ["Quotes become invoices", "One click converts an accepted quote into an invoice, keeping items and costs."],
    ["Online payments into your own account", "Connect Paystack, Stripe, Flutterwave or Bachs. Money goes straight to you; Usetally never holds it and takes 0% of payments."],
    ["Automatic receipts", "When a payment is confirmed, the invoice is marked paid and a receipt is issued and emailed."],
    ["Hidden costs and real profit", "Add your private costs to each job to see profit before you send. Customers never see them."],
    ["Tax on every invoice", "VAT, GST or sales tax at your rate, zero-rated and exempt items, customer tax IDs, UBL e-invoice files, and a tax summary and export for any month, quarter or year. In Nigeria: withholding tax, and a tax consultant can file your VAT return; you pay NRS directly."],
    ["Works offline", "Create quotes, invoices and record payments with no network. Everything syncs when you're back online."],
    ["Teams, roles and approvals", "Owner, manager, finance and junior roles. Junior drafts wait for approval before reaching a customer."],
    ["Print anywhere", "A4, US Letter, A5 and half letter, plus 80 mm and 58 mm thermal POS receipts. PDF download for every document."],
    ["Works on any device", "Runs in the browser and installs to the home screen."],
    ["Secure", "Each business's data is isolated, payment keys are encrypted, and changing bank details or keys needs an emailed code."],
  ],
  faq: [
    ["Do you hold my money?", "No. Customers pay by transfer to your bank, or through your own Bachs, Paystack, Flutterwave or Stripe account, so money goes straight to you. Online payments are confirmed with the provider; a transfer you confirm in one tap. Then the invoice is marked paid and the receipt goes out."],
    ["Does Usetally handle tax?", "It works out the tax on every invoice at your rate (VAT, GST or sales tax) and adds it up for any period, with an export for your accountant. In Nigeria it goes further: tap “File & pay for me” and a tax consultant files your VAT return. You pay the tax office from your own bank; Usetally never holds tax money."],
    ["Can my customers see my costs?", "Never. Hidden costs live only inside your account. In a team, you choose who can see them, and they never appear on quotes, invoices, receipts or PDFs."],
    ["Do my customers need an account?", "No. They open a secure link on any phone or computer, accept the quote with their name, and pay. They can download the PDF and their receipt."],
    ["Can I print receipts on a POS printer?", "Yes. Every document prints on A4, US Letter, A5 or half letter, and receipts also print on 80 mm and 58 mm thermal rolls."],
    ["What happens after the free trial?", "You get 14 days of everything, free, with no card. After that you stay on the Free plan (5 quotes or invoices a month, with “Powered by Usetally” on documents) until you choose a paid plan. Your quotes, invoices, customers and receipts stay safe either way."],
    ["Can I use it on my phone?", "Yes. It works in any browser and installs to your home screen. With no network you can still make quotes and invoices and record payments; they sync when you're back online."],
    ["Is my data safe?", "Each business's data is kept separate in the database, payment keys are encrypted, and changing bank details or payment keys needs a code sent to your email. You can download or delete your data at any time."],
  ],
  brand: BRAND,
};

// public pages search engines and assistants may read
export const PUBLIC_PAGES = [
  ["/", 1, "weekly"],
  ["/signup", 0.8, "monthly"],
  ["/login", 0.4, "monthly"],
  ["/terms", 0.3, "yearly"],
  ["/privacy", 0.3, "yearly"],
  ["/dpa", 0.2, "yearly"],
  ["/subprocessors", 0.2, "yearly"],
];
