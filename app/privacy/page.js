import Link from "next/link";
import { LegalLayout, List, Section } from "@/components/legal-layout";
import { legalDetails } from "@/lib/legal";

export const revalidate = 3600;
export const metadata = { title: "Privacy Policy" };

export default async function Privacy() {
  const { company, address, email, updated } = await legalDetails();
  return (
    <LegalLayout title="Privacy Policy" updated={updated}>
      <p>
        This policy explains what personal data {company} ({address}) collects through PayTrail, why, and the choices you have. We follow
        the Nigeria Data Protection Act 2023 and, where it applies to you, other data protection laws such as the UK and EU GDPR.
      </p>

      <Section title="1. Two kinds of data, two roles">
        <List items={[
          <span key="a"><strong className="text-ink">Your account data</strong>: your name, email, password and business details. We decide how this is used, so we are the data controller.</span>,
          <span key="b"><strong className="text-ink">Your customers' data</strong>: the names, emails, phone numbers and addresses you put on quotations and invoices. You decide how this is used, so your business is the controller and we process it on your behalf, only to provide PayTrail, under our <Link href="/dpa" className="font-medium text-brand-ink underline underline-offset-2">Data Processing Agreement</Link>.</span>,
        ]} />
      </Section>

      <Section title="2. What we collect">
        <List items={[
          "Account details: name, email address, password (stored securely by our login provider; we never see it in plain text).",
          "Business details: business name, address, phone, tax ID, logo, brand colour, bank details you choose to print on invoices.",
          "Documents and records: quotations, invoices, receipts, line items, hidden cost lines, payments and activity history.",
          "Customer details you enter, and a customer's name if they accept a quote.",
          "Payment provider connection details: your secret keys are encrypted before storage and are never shown back to anyone.",
          "Payment results from providers (amount, currency, reference, status). We do not receive or store card numbers; customers enter those on the provider's own page.",
          "Basic technical data such as IP address and browser type, used for security, preventing abuse and fixing problems.",
        ]} />
      </Section>

      <Section title="3. Why we use it">
        <List items={[
          "To provide PayTrail: create your documents, send them, show your customers their link, and record payments (to perform our contract with you).",
          "To bill you for your PayTrail plan (contract).",
          "To keep PayTrail secure and prevent fraud (legitimate interests and legal obligations).",
          "To send service emails such as sign-up confirmation, password resets, invitations and documents you choose to send (contract).",
          "To answer support requests (legitimate interests).",
        ]} />
        <p>We don't sell personal data, and we don't use your customers' data for our own marketing.</p>
      </Section>

      <Section title="4. Who we share it with">
        <p>Only with service providers who help us run PayTrail, under agreements that protect the data. The full, current list is on our <Link href="/subprocessors" className="font-medium text-brand-ink underline underline-offset-2">sub-processors page</Link>.</p>
        <List items={[
          "Hosting and database (for example Supabase and Vercel), which store and serve the app and its data.",
          "Email delivery providers, to send account emails and the documents you choose to email.",
          "Payment providers you connect (Stripe, Paystack, Flutterwave or Bachs), to take payments for you, and the provider we use to bill PayTrail plans.",
          "Authorities, where the law requires it.",
        ]} />
      </Section>

      <Section title="5. International transfers">
        <p>
          Some of our providers store or process data outside Nigeria (for example in the EU or the US). When that happens we rely on
          safeguards permitted by the Nigeria Data Protection Act, such as contractual protections and providers with recognised security standards.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <p>
          We keep your account and business records while your account is open, so your documents and receipts remain available. When an
          owner deletes a business, it and everything in it (customers, documents, payments, receipts, logo) is permanently deleted 30 days
          later; backups expire shortly after. When you delete your own account, your login and profile are removed immediately. We keep
          records of payments made to PayTrail for plans for 6 years, as Nigerian tax law requires.
        </p>
      </Section>

      <Section title="7. How we protect it">
        <List items={[
          "Each business's data is separated at the database level, so one business can't read another's records.",
          "Hidden cost lines are only visible to team members allowed to see them.",
          "Payment provider keys are encrypted at rest, and all traffic uses HTTPS.",
          "Customer document links use long random codes that can't be guessed.",
        ]} />
      </Section>

      <Section title="8. Your rights">
        <p>
          You can ask to access, correct, delete or receive a copy of your personal data, object to or restrict how we use it, and withdraw
          consent where we rely on it. Most of this you can do yourself: edit your details in the app, and in <strong className="text-ink">Settings → Privacy &amp; data</strong> download
          a complete copy of your data or delete your business or account. For anything else, email us and we'll reply within 30 days. If you're
          one of our users' customers, contact that business first; we'll help them respond. You can also complain to the Nigeria Data
          Protection Commission (or your local data protection authority).
        </p>
      </Section>

      <Section title="9. Cookies">
        <p>
          PayTrail uses only essential cookies, to keep you signed in and secure. Your light or dark display choice is saved in your browser.
          We don't use advertising cookies.
        </p>
      </Section>

      <Section title="10. Children">
        <p>PayTrail is for businesses and isn't meant for anyone under 18.</p>
      </Section>

      <Section title="11. Changes">
        <p>We may update this policy. If a change is significant, we'll tell you by email or in the app.</p>
      </Section>

      <Section title="12. Contact">
        <p>Privacy questions or requests: <span className="font-medium text-ink select-all">{email}</span>.</p>
      </Section>
    </LegalLayout>
  );
}
