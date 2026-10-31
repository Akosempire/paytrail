import "server-only";
import { documentForEmail, withDocument } from "@/lib/email-document";
import { createSupabaseService } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "@/lib/email";
import { invoiceReminderEmail } from "@/lib/emails";
import { absoluteLogoUrl, siteUrl } from "@/lib/site";
import { fillTemplate, reminderVars } from "@/lib/reminders-core";

// Daily: emails every invoice reminder that's due (Settings → Reminders).
// due_reminders() lists them; each one is logged before the next run so it
// is sent once. Never throws: returns a short summary for the cron response.
export async function runReminders({ limit = 200 } = {}) {
  try {
    if (!(await emailConfigured())) return { skipped: "email not configured" };
    const service = createSupabaseService();
    const { data: due, error } = await service.rpc("due_reminders", { max_rows: limit });
    if (error) return /due_reminders/.test(error.message || "") ? { skipped: "run RUN_NEW_2026-11-01c.sql" } : { error: error.message.slice(0, 200) };
    let sent = 0, failed = 0;
    const businesses = new Map();
    for (const row of due || []) {
      const [{ data: doc }, { data: rule }] = await Promise.all([
        service.from("documents").select("*").eq("id", row.document_id).maybeSingle(),
        service.from("reminder_rules").select("id, subject, message, enabled").eq("id", row.rule_id).maybeSingle(),
      ]);
      if (!doc || !rule?.enabled || !doc.customer_email) continue;
      if (!businesses.has(doc.business_id)) {
        const { data: b } = await service.from("businesses").select("id, name, email, brand_color, logo_path, subscription_status").eq("id", doc.business_id).maybeSingle();
        businesses.set(doc.business_id, b);
      }
      const b = businesses.get(doc.business_id);
      if (!b || b.subscription_status === "suspended") continue;
      // claim it first, so two runs at once can't both send it
      const { error: claimError } = await service.from("reminder_log").insert({ document_id: doc.id, rule_id: rule.id, business_id: doc.business_id });
      if (claimError) continue;
      const link = `${siteUrl()}/d/${doc.access_token}`;
      const vars = reminderVars(doc, b, link);
      const extra = await documentForEmail(service, doc, b);
      const r = await sendEmail({
        to: doc.customer_email, replyTo: b.email || undefined, fromName: b.name,
        ...withDocument(({ color, attached }) => invoiceReminderEmail({ business: b, logo: absoluteLogoUrl(b.logo_path), doc, link, color, attached, subject: fillTemplate(rule.subject, vars), message: fillTemplate(rule.message, vars) }), extra),
      });
      if (r.sent) {
        sent++;
        await service.from("activity").insert({ business_id: doc.business_id, document_id: doc.id, actor_label: "Usetally", action: "document.reminder_sent", detail: { offset_days: row.offset_days } });
      } else {
        failed++;
        await service.from("reminder_log").update({ status: "failed", detail: String(r.detail || r.reason || "").slice(0, 300) }).eq("document_id", doc.id).eq("rule_id", rule.id);
      }
    }
    return { due: (due || []).length, sent, failed };
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 200) };
  }
}
