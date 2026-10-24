import { requirePermission } from "@/lib/context";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/money";
import { testAmountMinor } from "@/lib/payments";
import { PageHeader, Callout } from "@/components/ui";
import { PaymentSetup } from "./setup";

export const metadata = { title: "Payment setup" };

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const ctx = await requirePermission("settings.payments");
  const { data: rows } = await ctx.supabase.from("payment_connections").select("provider, mode, key_hint, enabled, payment_confirmed_at, webhook_confirmed_at, last_test_reference, last_error, last_event_at, updated_at").eq("business_id", ctx.business.id);
  const connections = Object.fromEntries((rows || []).map((r) => [r.provider, r]));
  const webhook = (provider) => `${siteUrl()}/api/webhooks/${provider}/${ctx.business.id}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payment setup" description="Let customers pay quotes and invoices online. Connect Stripe, Paystack, Flutterwave or Bachs. Money goes straight into your own account. PayTrail never holds it." />
      {sp.welcome && <Callout tone="brand" title="Welcome to PayTrail! Let's get you paid.">Connect one provider now, or skip this. Customers can always pay by bank transfer and you record it.</Callout>}
      <PaymentSetup
        connections={connections}
        webhooks={{ stripe: webhook("stripe"), paystack: webhook("paystack"), flutterwave: webhook("flutterwave"), bachs: webhook("bachs") }}
        testAmount={formatMoney(testAmountMinor(ctx.business.currency), ctx.business.currency)}
        currency={ctx.business.currency}
        focus={sp.provider}
        testResult={sp.test}
      />
    </div>
  );
}
