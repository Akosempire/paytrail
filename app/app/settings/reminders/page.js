import { requirePermission } from "@/lib/context";
import { Alert, PageHeader } from "@/components/ui";
import { RemindersSettings } from "./reminders-form";
import { featuresOf, hasFeature } from "@/lib/entitlements";

export const metadata = { title: "Emails & reminders" };

export default async function Reminders() {
  const ctx = await requirePermission("settings.business");
  const [{ data: rules, error }, { data: log }] = await Promise.all([
    ctx.supabase.from("reminder_rules").select("id, offset_days, enabled, subject, message").eq("business_id", ctx.business.id).order("offset_days"),
    ctx.supabase.from("reminder_log").select("sent_at, status").eq("business_id", ctx.business.id).gte("sent_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(1000),
  ]);
  const locked = !hasFeature(await featuresOf(ctx.supabase, ctx.business.id), "auto_reminders");
  const ready = !error && "reminders_enabled" in ctx.business;
  const sent30 = (log || []).filter((l) => l.status === "sent").length;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Emails & reminders" description="The email that goes with each invoice, and the reminders Usetally sends for you when an invoice is due or late. Reminders stop as soon as the invoice is paid." />
      {!ready ? (
        <Alert intent="warning" title="One database update needed">Run <code>supabase/RUN_NEW_2026-11-01c.sql</code> in the Supabase SQL editor to turn on reminders and the invoice email.</Alert>
      ) : (
        <RemindersSettings business={{ name: ctx.business.name, currency: ctx.business.currency, reminders_enabled: ctx.business.reminders_enabled, email_template_invoice: ctx.business.email_template_invoice || "" }}
          rules={rules || []} sent30={sent30} locked={locked} />
      )}
    </div>
  );
}
