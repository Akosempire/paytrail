import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { AI_DEFAULT_MODEL, webhookUrl, whatsappConfig } from "@/lib/whatsapp/config";
import { Callout } from "@/components/ui";
import { IntegrationHeader } from "../shared";
import { WhatsappSettings } from "./settings";

export const metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

// WhatsApp to invoice: Twilio (the messages), the customer templates, the AI
// key (chatting in your own words) and the on/off switch. Paid plans only.
export default async function WhatsappPage() {
  await requirePlatformAdmin();
  const cfg = await whatsappConfig();
  const service = createSupabaseService();
  const week = new Date(Date.now() - 7 * 86400_000).toISOString();
  const count = async (q) => { try { const { count: n, error } = await q; return error ? null : n || 0; } catch { return null; } };
  const [linked, inbound, customer] = await Promise.all([
    count(service.from("whatsapp_links").select("id", { count: "exact", head: true })),
    count(service.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("direction", "in").gte("created_at", week)),
    count(service.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("direction", "customer").gte("created_at", week)),
  ]);
  const host = (() => { try { return new URL(siteUrl()).host; } catch { return "usetally.cc"; } })();
  return (
    <div className="flex flex-col gap-6">
      <IntegrationHeader title="WhatsApp" description="WhatsApp to invoice: businesses on paid plans make quotes and invoices, check who owes them, mark invoices paid and send documents to customers by chatting with your WhatsApp number." />
      {cfg.missingSql && <Callout tone="warn" title="Database update needed">Run supabase/RUN_NEW_2026-11-14a.sql in Supabase → SQL Editor, then reload this page.</Callout>}
      <WhatsappSettings
        saved={cfg.saved || {}}
        connected={cfg.connected}
        webhook={webhookUrl()}
        host={host}
        defaults={AI_DEFAULT_MODEL}
        stats={{ linked, inbound, customer }}
      />
    </div>
  );
}
