import "server-only";
import { sendEmail } from "@/lib/email";
import { upgradeRetryEmail } from "@/lib/emails";
import { formatMoney } from "@/lib/money";
import { siteUrl } from "@/lib/site";
import { failureWords, looksNigerian, shouldFollowUp } from "@/lib/subscription-recovery-core";

// Someone started paying for a plan and didn't finish. Called once per attempt,
// at the moment it's marked failed (lib/payments confirmAttempt):
//   - the business owner gets one friendly email with a fresh link and ways to pay
//   - the Usetally team gets an alert, so a person can follow up
// Never throws: a follow-up must not break payment handling.
export async function subscriptionNotPaid(service, attempt) {
  try {
    const [{ data: later }, { data: business }, { data: plan }, { data: settings }] = await Promise.all([
      service.from("payment_attempts").select("status").eq("business_id", attempt.business_id).eq("purpose", "subscription").gt("created_at", attempt.created_at).limit(5),
      service.from("businesses").select("id, name, email, phone, country, currency, subscription_status, plan_id").eq("id", attempt.business_id).maybeSingle(),
      service.from("plans").select("id, name, billing_interval").eq("id", attempt.plan_id).maybeSingle(),
      service.from("platform_settings").select("support_email").eq("id", true).maybeSingle(),
    ]);
    const check = shouldFollowUp({ attempt, laterAttempts: later || [], business });
    if (!check.ok || !business) return { sent: false, why: check.why || "no_business" };

    const { data: owner } = await service.from("memberships").select("email, full_name").eq("business_id", business.id).eq("role", "owner").limit(1).maybeSingle();
    const to = owner?.email || business.email;
    const amount = formatMoney(Number(attempt.amount_minor), attempt.currency);
    const nairaHint = attempt.currency !== "NGN" && looksNigerian(business);
    const reason = failureWords(attempt.failure_reason);
    const link = `${siteUrl()}/app/settings/billing`;

    let emailed = false;
    if (to) {
      const r = await sendEmail({
        to, replyTo: settings?.support_email || undefined,
        ...upgradeRetryEmail({ name: owner?.full_name || "", business: business.name, plan: plan?.name || "your plan", amount, link, nairaHint, settingsLink: `${siteUrl()}/app/settings` }),
      }).catch(() => ({ sent: false }));
      emailed = Boolean(r?.sent);
    }

    const { notifyAdmins } = await import("@/lib/admin-alerts");
    await notifyAdmins({
      subject: `Upgrade not paid: ${business.name}`.slice(0, 90),
      heading: "Someone started an upgrade and didn't finish",
      lines: [
        `${business.name} started ${plan?.name || "a plan"} (${amount}), but ${reason}.`,
        emailed ? `We emailed ${to} a fresh link.` : "We couldn't email them, so reach out yourself.",
        ...(nairaHint ? ["They look Nigerian but were charged in dollars. Their business country may be missing or wrong; naira cards often can't pay in dollars."] : []),
        `Reference: ${attempt.reference}`,
      ],
      link: `/admin/businesses/${business.id}`,
    }).catch(() => null);
    return { sent: emailed, nairaHint };
  } catch (e) {
    console.error("subscription_recovery.failed", { reference: attempt?.reference, message: e?.message });
    return { sent: false, why: "error" };
  }
}
