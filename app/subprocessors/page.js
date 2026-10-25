import Link from "next/link";
import { LegalLayout, Section } from "@/components/legal-layout";
import { legalDetails, subprocessors } from "@/lib/legal";

export const revalidate = 3600;
export const metadata = { title: "Sub-processors" };

export default async function Subprocessors() {
  const { email, updated } = await legalDetails();
  const list = await subprocessors();
  return (
    <LegalLayout title="Sub-processors" updated={updated}>
      <p>
        These are the outside services Usetally uses that may store or process personal data, including the customer details businesses
        put into Usetally. Each one is bound by a data protection agreement with us or, for payment providers, with the business that connects them.
        This list forms part of our <Link href="/dpa" className="font-medium text-brand-ink underline underline-offset-2">Data Processing Agreement</Link>.
      </p>
      <div className="overflow-hidden rounded-xl ring-1 ring-line">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-subtle text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
            <tr><th className="px-4 py-3">Service</th><th className="px-4 py-3">What it does</th><th className="hidden px-4 py-3 sm:table-cell">Where</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((s) => (
              <tr key={s.name} className="align-top">
                <td className="px-4 py-3 font-medium text-ink">{s.site ? <a href={s.site} target="_blank" rel="noopener noreferrer" className="hover:underline">{s.name}</a> : s.name}</td>
                <td className="px-4 py-3">{s.purpose}{s.note && <span className="mt-1 block text-[13px] text-ink-3">{s.note}</span>}<span className="mt-1 block text-[13px] text-ink-3 sm:hidden">Where: {s.location}</span></td>
                <td className="hidden px-4 py-3 sm:table-cell">{s.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Section title="Changes to this list">
        <p>
          We'll update this page and tell account owners by email at least 30 days before adding a new sub-processor that handles
          customer data, so you can object. Questions: <span className="font-medium text-ink select-all">{email}</span>.
        </p>
      </Section>
    </LegalLayout>
  );
}
