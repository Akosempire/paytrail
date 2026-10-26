import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "@/lib/email";
import { claimsDigestEmail } from "@/lib/emails";
import { formatMoney } from "@/lib/money";
import { siteUrl } from "@/lib/site";

// Once a day (with the morning job): one email per business listing the bank
// transfers customers said they sent and nobody has confirmed yet. Each claim
// is included once.
export async function sendClaimDigests() {
  if (!(await emailConfigured())) return { sent: 0, skipped: "email_not_configured" };
  const service = createSupabaseService();
  const { data: claims, error } = await service.from("payment_claims")
    .select("id, business_id, document_id, amount_minor, currency, payer_name, documents(number)")
    .eq("status", "pending").is("digest_sent_at", null).order("created_at").limit(500);
  if (error) return { sent: 0, skipped: "needs_sql" }; // RUN_NEW_2026-10-26c.sql not run yet
  const byBusiness = new Map();
  for (const c of claims || []) byBusiness.set(c.business_id, [...(byBusiness.get(c.business_id) || []), c]);
  let sent = 0;
  for (const [businessId, list] of byBusiness) {
    const [{ data: business }, { data: team }] = await Promise.all([
      service.from("businesses").select("name").eq("id", businessId).maybeSingle(),
      service.from("memberships").select("email").eq("business_id", businessId).in("role", ["owner", "manager", "finance"]),
    ]);
    const to = [...new Set((team || []).map((m) => m.email).filter(Boolean))];
    if (business && to.length) {
      const totals = {};
      for (const c of list) totals[c.currency] = (totals[c.currency] || 0) + Number(c.amount_minor);
      const msg = claimsDigestEmail({
        business, total: Object.entries(totals).map(([cur, v]) => formatMoney(v, cur)).join(" + "),
        claims: list.map((c) => ({ number: c.documents?.number || "Invoice", payer: c.payer_name || "Customer", amount: formatMoney(c.amount_minor, c.currency) })),
        link: list.length === 1 ? `${siteUrl()}/app/documents/${list[0].document_id}` : `${siteUrl()}/app`,
      });
      for (const email of to) { const r = await sendEmail({ to: email, ...msg }).catch(() => ({ sent: false })); if (r.sent) sent++; }
    }
    await service.from("payment_claims").update({ digest_sent_at: new Date().toISOString() }).in("id", list.map((c) => c.id));
  }
  return { sent, businesses: byBusiness.size };
}
