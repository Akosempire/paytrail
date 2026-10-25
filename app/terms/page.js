import Link from "next/link";
import { LegalLayout, List, Section } from "@/components/legal-layout";
import { legalDetails } from "@/lib/legal";

export const revalidate = 3600;
export const metadata = { title: "Terms of Service" };

export default async function Terms() {
  const { company, address, email, updated, law, courts } = await legalDetails();
  return (
    <LegalLayout title="Terms of Service" updated={updated}>
      <p>
        These terms are an agreement between you and {company}{address ? ` (${address})` : ""}, which runs Usetally. They apply when you create an account
        or use Usetally to prepare quotations, invoices and receipts. If you use Usetally for a business, you accept these terms for that
        business. If you don't agree, please don't use Usetally.
      </p>

      <Section title="1. What Usetally does">
        <p>
          Usetally is software for preparing and sending quotations, invoices and receipts, tracking your own costs, and recording payments.
          If you connect a payment provider (such as Stripe, Paystack, Flutterwave or Bachs), your customers pay you through that provider's
          page, and the money goes into your own account with that provider.
        </p>
        <p>
          <strong className="text-ink">Usetally does not hold, move or receive your customers' money.</strong> We are not a bank, a payment
          provider or a party to your sale. Your use of a payment provider is governed by your own agreement with that provider, including
          its fees, refunds, chargebacks and payouts.
        </p>
      </Section>

      <Section title="2. Your account">
        <List items={[
          "Give accurate information when you sign up, and keep it up to date.",
          "Keep your password private. You're responsible for what happens under your account and for the people you invite to your team.",
          "The account owner controls the business account, its plan and its team. Managers and other roles have the permissions described in the app.",
          "You must be at least 18 and able to enter into a contract.",
        ]} />
      </Section>

      <Section title="3. Free trial, plans and payment">
        <List items={[
          "New businesses get a free trial (currently 14 days). After it ends you need a paid plan to send new quotations and invoices. Your existing records stay available.",
          "Paid plans are billed monthly or yearly in advance, at the price shown when you pay. Plans do not renew automatically: you renew from Plan & billing before your period ends.",
          "Each plan has limits, such as documents per month and team members. If you reach a limit, you can upgrade or wait for the next month.",
          "We may change public prices. Changes apply from your next renewal, and we'll show the new price before you pay. Founding-customer prices stay as agreed.",
          "Payments for Usetally plans are not refundable, except where the law requires a refund or we decide otherwise in a specific case.",
        ]} />
      </Section>

      <Section title="4. Your responsibilities">
        <List items={[
          "You're responsible for the content of your quotations, invoices and receipts, including prices, taxes (such as VAT), and the goods or services you provide.",
          "You're responsible for meeting your own legal, tax and record-keeping obligations. Usetally is a tool, not tax or legal advice.",
          "You must have the right to use the customer details you enter, and you must use them lawfully (see our Privacy Policy).",
          "Keep your payment provider keys secure and tell us straight away if you think they've been exposed.",
        ]} />
      </Section>

      <Section title="5. Things you must not do">
        <List items={[
          "Use Usetally for fraud, money laundering, scams, illegal goods or services, or anything your payment provider forbids.",
          "Send misleading or fake invoices, or invoices in someone else's name without their permission.",
          "Try to access other businesses' data, get around plan limits, or interfere with Usetally's security or operation.",
          "Copy, resell or reverse-engineer Usetally except as the law allows.",
        ]} />
      </Section>

      <Section title="6. Your data">
        <p>
          The business information, customers, documents and costs you put into Usetally belong to you. You give us permission to store and
          process them only to run Usetally for you, as described in our <Link href="/privacy" className="font-medium text-brand-ink underline underline-offset-2">Privacy Policy</Link> and our <Link href="/dpa" className="font-medium text-brand-ink underline underline-offset-2">Data Processing Agreement</Link>, which is part of these terms. You can download all of it at any time.
          Hidden cost lines are shown only to your team members who are allowed to see them, never to your customers.
        </p>
      </Section>

      <Section title="7. Availability and changes">
        <p>
          We work to keep Usetally available and secure, but we can't promise it will always be uninterrupted or error-free. We may improve,
          change or remove features. If we make a change that significantly reduces what you've paid for, we'll tell you in advance.
        </p>
      </Section>

      <Section title="8. Suspension and closing your account">
        <p>
          We may suspend or close an account that breaks these terms, puts others at risk, or is required to be suspended by law or a payment
          provider. Where reasonable, we'll tell you first and give you a chance to fix the problem. You can stop using Usetally at any time. The owner can
          delete the business in Settings → Privacy &amp; data: it is permanently deleted 30 days later, and can be cancelled until then.
        </p>
      </Section>

      <Section title="9. Liability">
        <p>
          Usetally is provided "as is". To the extent the law allows, we aren't liable for indirect or consequential losses, lost profits, or
          losses caused by payment providers, your customers or events outside our reasonable control. Our total liability to you for any
          claim is limited to the amount you paid us for Usetally in the 12 months before the claim. Nothing in these terms limits liability
          that cannot be limited by law.
        </p>
      </Section>

      <Section title="10. Governing law">
        <p>
          These terms are governed by the laws of {law || `the country where ${company} is registered`}. Disputes will be handled by{" "}
          {courts || "the courts of that country"}, unless the law where you live gives you the right to bring a claim there.
        </p>
      </Section>

      <Section title="11. Changes to these terms">
        <p>We may update these terms. If a change is significant, we'll tell you by email or in the app before it takes effect.</p>
      </Section>

      <Section title="12. Contact">
        <p>Questions about these terms: <span className="font-medium text-ink select-all">{email}</span>.</p>
      </Section>
    </LegalLayout>
  );
}
