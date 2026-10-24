import Link from "next/link";
import { LegalLayout, List, Section } from "@/components/legal-layout";
import { legalDetails } from "@/lib/legal";

export const revalidate = 3600;
export const metadata = { title: "Data Processing Agreement" };

const a = "font-medium text-brand-ink underline underline-offset-2";

export default async function Dpa() {
  const { company, address, email, updated } = await legalDetails();
  return (
    <LegalLayout title="Data Processing Agreement" updated={updated}>
      <p>
        This agreement is part of the <Link href="/terms" className={a}>Terms of Service</Link> between {company} ({address}) ("Usetally",
        "we") and each business that uses Usetally ("you"). It applies when we process personal data on your behalf, mainly the details of
        your customers. It is written to meet section 29 of the Nigeria Data Protection Act 2023 and Article 28 of the EU and UK GDPR.
        You accept it by using Usetally; no signature is needed. If it conflicts with the Terms on data protection, this agreement wins.
      </p>

      <Section title="1. Roles">
        <p>
          For the personal data you put into Usetally about your customers and team, <strong className="text-ink">you are the controller</strong> and
          <strong className="text-ink"> Usetally is your processor</strong>. You're responsible for having a lawful basis to use that data and for
          telling your customers how you use it. For our own account and billing data, Usetally is the controller, as described in
          our <Link href="/privacy" className={a}>Privacy Policy</Link>.
        </p>
      </Section>

      <Section title="2. What we process (details of processing)">
        <List items={[
          "Subject matter and purpose: providing Usetally, which means storing, displaying, sending and collecting payment on your quotations, invoices and receipts.",
          "Duration: while your account is open, plus up to 30 days after you delete your business.",
          "Types of people: your customers and their contacts, and your team members.",
          "Types of data: names, company names, email addresses, phone numbers, postal addresses, tax IDs if you add them, what you sold and for how much, payment status and references, and anything you type into notes.",
          "Sensitive data: Usetally isn't designed for it (for example health or religious information). Please don't put it in documents.",
        ]} />
      </Section>

      <Section title="3. What we promise">
        <List items={[
          "We only process the data to provide Usetally and to follow your instructions, which are your use of the app and these terms. We tell you if we think an instruction breaks data protection law.",
          "We don't sell your customers' data or use it for our own marketing.",
          "Everyone at Usetally who can access the data is bound to keep it confidential.",
          "We keep appropriate security in place, including: each business's data separated in the database, encryption in transit (HTTPS) and of payment keys at rest, access limited by role, and hidden cost lines visible only to permitted team members.",
          "We help you respond to your customers' requests to see, correct, export or delete their data. You can edit and delete customers yourself, and download all your data in Settings → Privacy & data.",
          "We help you with data protection impact assessments and with questions from the Nigeria Data Protection Commission or another regulator, where they concern Usetally.",
        ]} />
      </Section>

      <Section title="4. Sub-processors">
        <p>
          You allow us to use the services listed on our <Link href="/subprocessors" className={a}>sub-processors page</Link>. We give each one
          data protection terms at least as protective as these, and we remain responsible for them. We'll tell account owners by email at
          least 30 days before adding a new one that handles customer data. If you object on reasonable data protection grounds and we can't
          resolve it, you may close your account and we'll refund any unused prepaid period.
        </p>
      </Section>

      <Section title="5. Data breaches">
        <p>
          If we become aware of a breach affecting your customers' data, we'll tell you without undue delay and within 48 hours, so you can
          meet the 72-hour deadline to notify the regulator. We'll explain what happened, what data was affected and what we're doing about it,
          and keep you updated.
        </p>
      </Section>

      <Section title="6. International transfers">
        <p>
          Some sub-processors store or handle data outside Nigeria and the EU/UK. Where that happens we rely on safeguards the law accepts,
          such as adequacy decisions or standard contractual clauses, and on the providers' own security certifications.
        </p>
      </Section>

      <Section title="7. When you leave">
        <p>
          You can download all your data at any time. When you delete your business, it is permanently deleted 30 days later, including backups
          as they expire in the normal cycle. We keep only the records of what you paid Usetally, which the tax law requires us to keep.
        </p>
      </Section>

      <Section title="8. Audits">
        <p>
          We'll answer reasonable written questions about how we protect your data and share summaries of our security measures. If a regulator
          requires an audit, we'll cooperate with it at a mutually agreed time, with reasonable notice and confidentiality.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>Data protection questions or breach reports: <span className="font-medium text-ink select-all">{email}</span>.</p>
      </Section>
    </LegalLayout>
  );
}
