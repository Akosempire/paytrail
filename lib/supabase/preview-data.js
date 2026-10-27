// Sample data for local preview mode only (see preview.js).
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const tok = (n) => String(n).padStart(48, "a");

export function fixtures() {
  const role = process.env.PAYTRAIL_PREVIEW_ROLE || "owner";
  const users = { owner: id(1), manager: id(2), finance: id(3), junior_finance: id(4) };
  const user = { id: users[role], email: { owner: "tolu@adeyemistudio.ng", manager: "kemi@adeyemistudio.ng", finance: "funmi@adeyemistudio.ng", junior_finance: "jide@adeyemistudio.ng" }[role], user_metadata: { full_name: { owner: "Tolu Adeyemi", manager: "Kemi Bello", finance: "Funmi Okafor", junior_finance: "Jide Musa" }[role] } };
  const BIZ = id(100);
  const tiers = [
    ["Free", "To get started", 0, 0, 5, 1, true, ["Quotes, invoices & receipts", "Online payments", "“Powered by Usetally” on documents"]],
    ["Solo", "For freelancers", 300000, 500, 50, 1, false, ["Online payments", "Hidden costs and profit per job", "Your logo and colours"]],
    ["Team", "For small companies", 1000000, 1500, 200, 5, true, ["Approvals for junior staff", "Choose who sees costs", "Online payments"]],
    ["Business", "For growing finance teams", 2000000, 3900, null, 15, true, ["Priority support", "Everything in Team"]],
  ];
  let n = 900;
  const plans = [];
  for (const [cur, idx] of [["NGN", 2], ["USD", 3]]) {
    for (const [i, t] of tiers.entries()) {
      for (const interval of t[idx] === 0 ? ["month"] : ["month", "year"]) {
        const price = interval === "year" ? t[idx] * 10 : t[idx];
        plans.push({ id: id(++n), name: t[0], tagline: interval === "year" ? `${t[1]}, billed yearly` : t[1], price_minor: price, currency: cur, billing_interval: interval,
          document_limit: t[4], seat_limit: t[5], allow_company: t[6], features: interval === "year" ? ["2 months free", ...t[7].slice(0, 2)] : t[7], active: true, sort_order: (cur === "NGN" ? 10 : 50) + i * 10 + (interval === "year" ? 1 : 0) });
      }
    }
  }
  plans.push({ id: id(999), name: "Founding", tagline: "Founding customer: Team features, price locked for life", price_minor: 6000000, currency: "NGN", billing_interval: "year", document_limit: 200, seat_limit: 5, allow_company: true, features: ["Founding customer: price locked for life"], active: false, sort_order: 5, spots: 100 });
  const teamPlan = plans.find((p) => p.name === "Team" && p.currency === "NGN" && p.billing_interval === "month");
  const business = {
    id: BIZ, kind: "company", name: "Adeyemi Studio", legal_name: "Adeyemi Studio Ltd", email: "hello@adeyemistudio.ng", phone: "+234 803 555 0142",
    website: "adeyemistudio.ng", address: "14 Harbour Way", city: "", country: process.env.PAYTRAIL_PREVIEW_COUNTRY || "", tax_id: "23456789-0001",
    document_prefs: process.env.PAYTRAIL_PREVIEW_TEMPLATE
      ? Object.fromEntries(["quote", "invoice", "receipt"].map((k) => [k, { template: process.env.PAYTRAIL_PREVIEW_TEMPLATE, paper: process.env.PAYTRAIL_PREVIEW_PAPER || "a4", layout: {} }]))
      : process.env.PAYTRAIL_PREVIEW_RECEIPT_TEMPLATE ? { receipt: { template: process.env.PAYTRAIL_PREVIEW_RECEIPT_TEMPLATE, paper: "a5", layout: {} } } : {},
    logo_path: process.env.PAYTRAIL_PREVIEW_LOGO || null, signature_path: process.env.PAYTRAIL_PREVIEW_SIGNATURE || null, signatory_name: process.env.PAYTRAIL_PREVIEW_SIGNATURE ? "Tolu Adeyemi" : null, signatory_title: process.env.PAYTRAIL_PREVIEW_SIGNATURE ? "Managing Director" : null, brand_color: "#0E9384", currency: "NGN", tax_label: "VAT", tax_rate: 7.5,
    quote_prefix: "QT", invoice_prefix: "INV", receipt_prefix: "RCT", quote_seq: 18, invoice_seq: 11, receipt_seq: 9,
    quote_validity_days: 14, invoice_due_days: 7, default_terms: "70% deposit to start, balance on delivery. Prices valid for the period stated.",
    footer_note: "Thank you for choosing Adeyemi Studio · RC 1876543", bank_name: "GTBank", bank_account_name: "Adeyemi Studio Ltd", bank_account_number: "0123456789",
    require_approval: true, plan_id: teamPlan.id, subscription_status: process.env.PAYTRAIL_PREVIEW_TRIAL ? "trialing" : "active", trial_documents_used: 1, trial_ends_at: null,
    current_period_end: day(19), onboarded_at: process.env.PAYTRAIL_PREVIEW_ONBOARDING === "1" ? null : daysAgo(60), created_at: daysAgo(60), plans: teamPlan,
  };
  const members = [
    { business_id: BIZ, user_id: users.owner, role: "owner", can_view_costs: true, full_name: "Tolu Adeyemi", email: "tolu@adeyemistudio.ng", created_at: daysAgo(60), businesses: business },
    { business_id: BIZ, user_id: users.manager, role: "manager", can_view_costs: true, full_name: "Kemi Bello", email: "kemi@adeyemistudio.ng", created_at: daysAgo(50), businesses: business },
    { business_id: BIZ, user_id: users.finance, role: "finance", can_view_costs: true, full_name: "Funmi Okafor", email: "funmi@adeyemistudio.ng", created_at: daysAgo(40), businesses: business },
    { business_id: BIZ, user_id: users.junior_finance, role: "junior_finance", can_view_costs: false, full_name: "Jide Musa", email: "jide@adeyemistudio.ng", created_at: daysAgo(20), businesses: business },
  ];
  const customers = [
    { id: id(201), business_id: BIZ, name: "Chioma Obi", company: "Obi Foods Ltd", email: "chioma@obifoods.ng", phone: "+234 802 111 2233", address: "5 Awolowo Rd, Ikoyi", notes: "Prefers WhatsApp", archived_at: null, created_at: daysAgo(55) },
    { id: id(202), business_id: BIZ, name: "Emeka Nwosu", company: "Kora Logistics", email: "emeka@koralogistics.com", phone: "+234 805 444 9087", address: "Plot 9, Trans-Amadi, Port Harcourt", notes: "", archived_at: null, created_at: daysAgo(45) },
    { id: id(203), business_id: BIZ, name: "Aisha Bello", company: "Bloom Skincare", email: "aisha@bloomskin.co", phone: "+234 809 222 1010", address: "Wuse 2, Abuja", notes: "", archived_at: null, created_at: daysAgo(30) },
    { id: id(204), business_id: BIZ, name: "Segun Ade", company: "", email: "segun.ade@gmail.com", phone: "+234 701 333 4545", address: "", notes: "", archived_at: null, created_at: daysAgo(12) },
  ];
  const base = { business_id: BIZ, currency: "NGN", tax_label: "VAT", tax_rate: 7.5, discount_minor: 0, notes: "", terms: business.default_terms, source_quote_id: null, converted_invoice_id: null, accepted_at: null, accepted_name: "", declined_at: null, decline_reason: "", viewed_at: null, paid_at: null, voided_at: null, approved_by: null, submitted_by: null };
  const mk = (n, o) => {
    const sub = o.items.reduce((s, i) => s + i[1] * i[2], 0);
    const disc = o.discount_minor || 0;
    const tax = Math.round((sub - disc) * 0.075);
    const c = customers.find((x) => x.id === o.customer_id);
    return { customer_tax_id: base.customer_company ? "21876543-0001" : "", ...base, id: id(n), access_token: tok(n), subtotal_minor: sub, tax_minor: tax, total_minor: sub - disc + tax, amount_paid_minor: 0,
      customer_name: c.name, customer_company: c.company, customer_email: c.email, customer_phone: c.phone, customer_address: c.address, created_by: users.owner, ...o };
  };
  const docs = [
    mk(301, { kind: "quote", number: "QT-0018", title: "Brand refresh & website for Bloom", customer_id: id(203), status: "sent", issue_date: day(-2), valid_until: day(12), sent_at: daysAgo(2), created_at: daysAgo(3),
      items: [["Brand identity refresh (logo, colours, type)", 1, 45000000], ["Website design & build, 6 pages", 1, 85000000], ["Product photography, 20 SKUs", 20, 1500000]], discount_minor: 5000000, notes: "Timeline: 4 weeks from deposit." }),
    mk(302, { kind: "quote", number: "QT-0017", title: "Fleet tracking dashboard", customer_id: id(202), status: "accepted", issue_date: day(-9), valid_until: day(5), sent_at: daysAgo(9), viewed_at: daysAgo(8), accepted_at: daysAgo(6), accepted_name: "Emeka Nwosu", created_at: daysAgo(10),
      items: [["Dashboard UX & UI design", 1, 60000000], ["Front-end build", 1, 90000000]] }),
    mk(303, { kind: "quote", number: "QT-0016", title: "Social media kit", customer_id: id(204), status: "pending_approval", issue_date: day(0), valid_until: day(14), created_at: daysAgo(0), created_by: users.junior_finance, submitted_by: users.junior_finance,
      items: [["Instagram templates, 12", 12, 1250000], ["Story highlight covers", 1, 3500000]] }),
    mk(304, { kind: "quote", number: "QT-0015", title: "Menu redesign", customer_id: id(201), status: "declined", issue_date: day(-20), valid_until: day(-6), sent_at: daysAgo(20), declined_at: daysAgo(15), decline_reason: "Over budget this quarter", created_at: daysAgo(21),
      items: [["Menu design, 3 versions", 3, 7500000]] }),
    mk(311, { kind: "invoice", number: "INV-0011", title: "Packaging design: phase 2", customer_id: id(201), status: "partially_paid", issue_date: day(-5), due_date: day(2), sent_at: daysAgo(5), viewed_at: daysAgo(4), amount_paid_minor: 25000000, created_at: daysAgo(5),
      items: [["Packaging artwork, 4 SKUs", 4, 9500000], ["Print-ready files & proofs", 1, 15000000]] }),
    mk(312, { kind: "invoice", number: "INV-0010", title: "Website maintenance, Q3", customer_id: id(202), status: "viewed", issue_date: day(-21), due_date: day(-14), sent_at: daysAgo(21), viewed_at: daysAgo(19), created_at: daysAgo(21),
      items: [["Monthly maintenance retainer", 3, 12000000]] }),
    mk(313, { kind: "invoice", number: "INV-0009", title: "Logo design", customer_id: id(204), status: "paid", issue_date: day(-12), due_date: day(-5), sent_at: daysAgo(12), paid_at: daysAgo(10), created_at: daysAgo(12),
      items: [["Logo design, 3 concepts", 1, 18000000]] }),
    mk(314, { kind: "invoice", number: "INV-0008", title: "Fleet dashboard: deposit", customer_id: id(202), status: "draft", issue_date: day(0), due_date: day(7), created_at: daysAgo(0),
      items: [["70% deposit: fleet tracking dashboard", 1, 105000000]] }),
  ];
  docs[6].amount_paid_minor = docs[6].total_minor;
  const items = docs.flatMap((d) => d.items.map(([description, quantity, unit_price_minor], i) => ({ id: `${d.id}-i${i}`, document_id: d.id, business_id: BIZ, description, details: i === 0 && d.kind === "quote" ? "Includes two rounds of revisions." : "", quantity, unit_price_minor, sort_order: i })));
  const cost = (doc, label, category, amount, i) => ({ id: `${id(doc)}-c${i}`, document_id: id(doc), business_id: BIZ, label, category, amount_minor: amount, note: "", sort_order: i });
  const costs = [
    cost(301, "Freelance photographer (2 days)", "labour", 12000000, 0), cost(301, "Data: MTN 200GB", "data", 3000000, 1), cost(301, "Generator diesel", "electricity", 4500000, 2), cost(301, "Adobe & Figma seats", "subscription", 2500000, 3), cost(301, "Studio transport", "transport", 1500000, 4),
    cost(302, "Contract front-end developer", "labour", 40000000, 0), cost(302, "Data & hosting", "data", 2500000, 1),
    cost(311, "Print proofs", "materials", 3500000, 0), cost(311, "Dispatch rider", "transport", 600000, 1),
    cost(313, "Font licence", "subscription", 2200000, 0), cost(313, "Data", "data", 800000, 1),
  ];
  const payments = [
    { id: id(401), business_id: BIZ, document_id: id(313), method: "flutterwave", reference: "FLW-MOCK-88213", amount_minor: docs[6].total_minor, currency: "NGN", paid_at: daysAgo(10), note: "", attempt_id: null, recorded_by: null },
    { id: id(402), business_id: BIZ, document_id: id(311), method: "bank_transfer", reference: "GTB/TRF/55021", amount_minor: 25000000, currency: "NGN", paid_at: daysAgo(3), note: "Deposit", recorded_by: users.finance, wht_minor: 1250000, documents: { number: "INV-0011", customer_name: "Chioma Obi", customer_company: "Obi Foods Ltd" } },
    { id: id(403), business_id: BIZ, document_id: id(900), method: "bachs", reference: "ch_82hd73", amount_minor: 32250000, currency: "NGN", paid_at: daysAgo(40), note: "" },
    { id: id(404), business_id: BIZ, document_id: id(901), method: "bank_transfer", reference: "", amount_minor: 54000000, currency: "NGN", paid_at: daysAgo(70), note: "" },
  ];
  const receipts = [
    { id: id(501), business_id: BIZ, document_id: id(313), payment_id: id(401), number: "RCT-0009", amount_minor: docs[6].total_minor, currency: "NGN", balance_after_minor: 0, access_token: tok(7), issued_at: daysAgo(10), template: "signature", paper: "a5" },
    { id: id(502), business_id: BIZ, document_id: id(311), payment_id: id(402), number: "RCT-0010", amount_minor: 25000000, currency: "NGN", balance_after_minor: docs[4].total_minor - 25000000, access_token: tok(8), issued_at: daysAgo(3), wht_minor: 1250000 },
  ];
  for (const p of payments) {
    p.documents = docs.find((d) => d.id === p.document_id) || { id: p.document_id, number: "INV-0005", customer_name: "Obi Foods Ltd", customer_company: "Obi Foods Ltd", kind: "invoice" };
    p.receipts = receipts.filter((r) => r.payment_id === p.id);
  }
  const act = (n, docId, actor, action, ago, detail = {}) => ({ id: n, business_id: BIZ, document_id: docId, actor_label: actor, action, created_at: new Date(Date.now() - ago * 60000).toISOString(), detail, documents: docs.find((d) => d.id === docId) ? { number: docs.find((d) => d.id === docId).number } : null });
  const activity = [
    act(1, id(303), "Jide Musa", "document.submitted", 25), act(2, id(303), "Jide Musa", "document.created", 40),
    act(3, id(311), "Funmi Okafor", "payment.recorded", 60 * 70, { amount_minor: 25000000 }), act(4, id(301), "Aisha Bello", "document.viewed", 60 * 30),
    act(5, id(301), "Tolu Adeyemi", "document.sent", 60 * 48), act(6, id(302), "Emeka Nwosu", "quote.accepted", 60 * 24 * 6),
    act(7, id(313), "Flutterwave", "payment.recorded", 60 * 24 * 10, { amount_minor: docs[6].total_minor }), act(8, id(301), "Tolu Adeyemi", "document.created", 60 * 72),
  ];
  const connections = [
    { business_id: BIZ, provider: "flutterwave", mode: "test", key_hint: "4f2X", enabled: true, payment_confirmed_at: daysAgo(30), webhook_confirmed_at: daysAgo(30), last_test_reference: "PTTEST-1", last_error: "", last_event_at: daysAgo(10), updated_at: daysAgo(30) },
    { business_id: BIZ, provider: "bachs", mode: "test", key_hint: "a91c", enabled: true, payment_confirmed_at: daysAgo(1), webhook_confirmed_at: null, last_test_reference: "PTTEST-2", last_error: "", last_event_at: null, updated_at: daysAgo(1) },
  ];
  const tables = {
    profiles: [{ user_id: user.id, full_name: user.user_metadata.full_name, active_business_id: BIZ, tour_done_at: process.env.PAYTRAIL_PREVIEW_TOUR === "1" ? null : "2026-10-01T00:00:00Z" }],
    memberships: members,
    platform_admins: role === "owner" ? [{ user_id: users.owner }] : [],
    businesses: [business, { ...business, id: id(101), name: "Kunle Okoro Photography", kind: "freelancer", subscription_status: "trialing", plan_id: null, plans: null, created_at: daysAgo(2), email: "kunle@okoro.photo" }, { ...business, id: id(102), name: "Greenfield Consulting", subscription_status: "past_due", plans: plans.find((p) => p.name === "Business"), plan_id: plans.find((p) => p.name === "Business").id, created_at: daysAgo(90), email: "accounts@greenfield.ng" }],
    customers, documents: process.env.PAYTRAIL_PREVIEW_EMPTY === "1" ? [] : docs, document_items: items, document_costs: costs,
    cost_presets: [{ id: id(601), business_id: BIZ, label: "Data: MTN 200GB monthly", category: "data", amount_minor: 3000000 }, { id: id(602), business_id: BIZ, label: "Generator diesel (per week)", category: "electricity", amount_minor: 4500000 }, { id: id(603), business_id: BIZ, label: "Adobe CC + Figma", category: "subscription", amount_minor: 2500000 }],
    payments, receipts: process.env.PAYTRAIL_PREVIEW_EMPTY === "1" ? [] : receipts, activity, payment_connections: connections, plans,
    invitations: [{ id: id(701), business_id: BIZ, email: "ngozi@adeyemistudio.ng", role: "finance", can_view_costs: true, expires_at: day(5), created_at: daysAgo(2), accepted_at: null, revoked_at: null }],
    subscription_payments: [{ id: id(801), business_id: BIZ, plan_id: teamPlan.id, method: "bachs", reference: "PTSUB-1", amount_minor: 1500000, currency: "NGN", period_start: daysAgo(11), period_end: day(19), created_at: daysAgo(11), plans: teamPlan }],
    document_files: [
      { id: id(901), business_id: BIZ, document_id: id(301), name: "Signed contract - Bello Interiors.pdf", content_type: "application/pdf", size_bytes: 842000, shared: true, uploaded_by: users.owner, uploaded_by_name: "Tolu Adeyemi", created_at: daysAgo(2), storage_key: "x" },
      { id: id(902), business_id: BIZ, document_id: id(301), name: "Delivery note 0412.jpg", content_type: "image/jpeg", size_bytes: 1630000, shared: false, uploaded_by: users.owner, uploaded_by_name: "Funmi Okafor", created_at: daysAgo(1), storage_key: "y" },
    ],
    // a customer who pressed "I've sent it" on INV-0011
    payment_claims: process.env.PAYTRAIL_PREVIEW_EMPTY === "1" ? [] : [{ id: id(951), business_id: BIZ, document_id: id(311), amount_minor: 15000000, currency: "NGN", payer_name: "Chioma Obi", paid_on: daysAgo(0).slice(0, 10), note: "Paid from GTBank", file_id: id(952), status: "pending", reply: "", created_at: daysAgo(0), documents: { number: "INV-0011" } }],
    // VAT returns and a consultant, so "File & pay for me" can be seen
    tax_consultants: [{ id: id(971), name: "Tolu Bello", firm: "Bello & Co Tax", email: "tolu@bellotax.ng", phone: "+234 803 000 1111", citn_number: "CITN/12345", active: true, access_token: "c".repeat(48), created_at: daysAgo(30) }],
    vat_returns: [
      { id: id(972), business_id: BIZ, period: new Date(Date.now() - 32 * 86400000).toISOString().slice(0, 7), currency: "NGN", vat_minor: 3225000, sales_minor: 43000000, status: "requested", mode: "assisted", consultant_id: id(971), requested_at: daysAgo(1), requested_by_name: "Tolu Adeyemi", request_note: "We had one refund this month", amount_due_minor: null, payment_reference: "", filing_reference: "" },
      { id: id(973), business_id: BIZ, period: new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 7), currency: "NGN", vat_minor: 2810000, sales_minor: 37466700, status: "done", mode: "assisted", consultant_id: id(971), requested_at: daysAgo(35), requested_by_name: "Tolu Adeyemi", filed_at: daysAgo(33), filed_by_name: "Tolu Bello (tax consultant)", amount_due_minor: 2810000, payment_reference: "RRR-2201-8841", filing_reference: "VAT/2026/0917", done_at: daysAgo(32) },
    ],
    vat_return_files: [{ id: id(974), return_id: id(973), business_id: BIZ, kind: "acknowledgement", name: "ack.pdf", content_type: "application/pdf", size_bytes: 1000, storage_key: "k", uploaded_by_name: "Tolu Bello", created_at: daysAgo(33) }],
    // health checks and log, so the admin Health page can be seen
    monitor_state: [
      { check_key: "auth", status: "ok", detail: "Supabase Auth is answering.", changed_at: daysAgo(3), checked_at: daysAgo(0) },
      { check_key: "database", status: "ok", detail: "Answering in 84 ms.", changed_at: daysAgo(3), checked_at: daysAgo(0) },
      { check_key: "email", status: "ok", detail: "Sendbyte is answering · sending as hello@usetally.cc.", changed_at: daysAgo(0), checked_at: daysAgo(0) },
      { check_key: "email_dns", status: "down", detail: "Fix in your DNS (e.g. Namecheap → Advanced DNS): sb._domainkey.usetally.cc doesn't hold Sendbyte's DKIM key (it holds \"v=DMARC1; p=none; rua=mailto:d…\").", changed_at: daysAgo(0), checked_at: daysAgo(0) },
      { check_key: "storage", status: "ok", detail: "Cloudflare R2 is answering.", changed_at: daysAgo(5), checked_at: daysAgo(0) },
      { check_key: "live:email", status: "down", detail: "Couldn't reach Sendhiiv: it took too long to answer.", changed_at: daysAgo(0), checked_at: daysAgo(0), alerted_at: daysAgo(0) },
    ],
    monitor_events: [
      { id: id(961), kind: "check:email_dns", detail: "Broken: sb._domainkey.usetally.cc doesn't hold Sendbyte's DKIM key.", created_at: daysAgo(0) },
      { id: id(962), kind: "email", detail: "Couldn't reach Sendhiiv: it took too long to answer. (to 1 recipient: \"••• ••• is your Usetally sign-up code\")", created_at: daysAgo(0) },
      { id: id(963), kind: "payments", detail: "A customer couldn't start a Flutterwave payment: timeout", created_at: daysAgo(1) },
    ],
    platform_settings: [{ id: true, trial_mode: "days", trial_documents: 2, trial_days: 14, billing_provider: "bachs", billing_key_hint: "9d1e", support_email: "billing@paytrail.app" }],
  };
  const paidMonth = docs.filter((d) => d.kind === "invoice" && d.status === "paid");
  const rpc = (name, args) => {
    if (name === "app_context") {
      const mems = tables.memberships.filter((m) => m.user_id === user.id).map(({ business_id, role, can_view_costs, full_name, email, businesses: b }) =>
        ({ business_id, role, can_view_costs, full_name, email, businesses: { id: b.id, name: b.name, kind: b.kind, logo_path: b.logo_path, brand_color: b.brand_color } }));
      const profile = tables.profiles.find((p) => p.user_id === user.id) || null;
      const active = mems.find((m) => m.business_id === profile?.active_business_id) || mems[0];
      const biz = active ? tables.businesses.find((b) => b.id === active.business_id) : null;
      return { profile, memberships: mems, is_admin: tables.platform_admins.some((a) => a.user_id === user.id), business: biz, allowance: biz ? rpc("business_allowance", { target: biz.id }) : null };
    }
    if (name === "plan_spots_left") return 87;
    if (name === "business_allowance" && process.env.PAYTRAIL_PREVIEW_FREE === "1") return { allowed: true, reason: "free", used: 3, limit: 5, free: true, ended: "trial_used" };
    if (name === "business_allowance") return business.subscription_status === "trialing" ? { allowed: true, reason: "trial", used: 1, limit: 2, mode: "documents" } : { allowed: true, reason: "plan", used: 37, limit: 150 };
    if (name === "business_summary") return {
      outstanding_minor: docs[4].total_minor - 25000000 + docs[5].total_minor, overdue_minor: docs[5].total_minor, overdue_count: 1,
      collected_month_minor: docs[6].total_minor + 25000000, collected_last_month_minor: 32250000, open_quotes_minor: docs[0].total_minor, open_quotes_count: 1,
      awaiting_approval: 1, paid_month_revenue_minor: paidMonth.reduce((s, d) => s + d.subtotal_minor, 0), paid_month_costs_minor: role === "junior_finance" ? null : 3000000,
      monthly: ["May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((m, i) => ({ month: m, collected_minor: [42000000, 61000000, 38000000, 54000000, 32250000, docs[6].total_minor + 25000000][i] })),
    };
    // local preview only: sample totals so the home page section can be seen
    if (name === "public_stats") return { users: 1284, businesses: 412, ngn_minor: 18645000000, usd_minor: 3482500, payments: 2310 };
    if (name === "platform_summary") return { businesses: 128, companies: 41, trialing: 37, active: 79, past_due: 12, documents_month: 2140, subscription_revenue_month: { NGN: 118500000 } };
    return null;
  };
  return { user, tables, rpc };
}
