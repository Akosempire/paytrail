import Link from "next/link";
import { LegalLayout, List, Section } from "@/components/legal-layout";
import { legalDetails } from "@/lib/legal";

export const revalidate = 3600;
export const metadata = {
  title: "Support",
  description: "Get help with Usetally: contact support, get help inside the app, and connect AI assistants such as ChatGPT, Claude and Grok.",
  alternates: { canonical: "/support" },
};

const A = ({ href, children }) => <Link href={href} className="font-medium text-brand-ink underline underline-offset-2">{children}</Link>;

// Public support page (also the support URL for app-directory listings)
export default async function Support() {
  const { email, company } = await legalDetails();
  return (
    <LegalLayout title="Support" eyebrow="Help">
      <p>We're here to help with your Usetally account, your quotes, invoices and receipts, payments, and connected AI assistants.</p>

      <Section title="Contact us">
        <List items={[
          <span key="e"><strong className="text-ink">Email:</strong> <a href={`mailto:${email}`} className="font-medium text-brand-ink underline underline-offset-2 select-all">{email}</a>. We'll reply by email.</span>,
          <span key="a"><strong className="text-ink">In the app:</strong> signed in, open <A href="/app/feedback">Ideas &amp; help</A> to message the Usetally team. Replies arrive there and by email.</span>,
          <span key="s">For anything about a payment, include the invoice or receipt number. Never send us passwords or payment provider secret keys.</span>,
        ]} />
      </Section>

      <Section title="AI assistants (ChatGPT, Claude, Grok)">
        <List items={[
          <span key="c"><strong className="text-ink">Connect:</strong> add the Usetally app or connector in your assistant, sign in to Usetally, choose your business, and choose View only or Full access. Step-by-step instructions are in the app under Settings → AI &amp; MCP.</span>,
          <span key="d"><strong className="text-ink">Disconnect:</strong> in Usetally, Settings → AI &amp; MCP → Disconnect. Access ends straight away. You can also remove Usetally in your assistant's own settings.</span>,
          <span key="w"><strong className="text-ink">Can't create or send?</strong> The connection may be View only, or your team role may need approval to send. Disconnect and connect again with Full access, or ask your account owner.</span>,
          <span key="t"><strong className="text-ink">For developers:</strong> server details, sign-in and the full tool list are in the <A href="/docs/mcp">MCP documentation</A>.</span>,
        ]} />
      </Section>

      <Section title="Your account and data">
        <List items={[
          <span key="p">Download a copy of your data, or delete your business or account, in Settings → Privacy &amp; data.</span>,
          <span key="l">Read our <A href="/privacy">Privacy Policy</A>, <A href="/terms">Terms of Service</A>, <A href="/dpa">Data Processing Agreement</A> and <A href="/subprocessors">sub-processors</A>.</span>,
          ...(company && !/^usetally$/i.test(company) ? [<span key="o">Usetally is run by {company}.</span>] : []),
        ]} />
      </Section>
    </LegalLayout>
  );
}
