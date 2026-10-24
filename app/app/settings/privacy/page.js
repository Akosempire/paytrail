import Link from "next/link";
import { AlertTriangle, Download, ShieldCheck, Trash2, UserX } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { accountDeletionBlocker } from "@/lib/privacy";
import { formatDate } from "@/lib/format";
import { Callout, Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { CancelDeletionButton, DeleteAccountForm, DeleteBusinessForm } from "./forms";

export const metadata = { title: "Privacy & data" };

export default async function PrivacyData() {
  const ctx = await requireBusiness();
  const b = ctx.business;
  const owner = ctx.member.role === "owner";
  const pending = Boolean(b.deletion_requested_at);
  const blocking = await accountDeletionBlocker(ctx);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Privacy & data" description="Download a copy of your data, or delete it. Your rights under the Nigeria Data Protection Act and GDPR." />

      {pending && (
        <Callout tone="danger" icon={AlertTriangle} title={`${b.name} will be permanently deleted on ${formatDate(b.deletion_scheduled_for)}`}
          action={owner && <CancelDeletionButton />}>
          Sending is switched off until then. Customers can still open and pay invoices already sent. Download anything you need before that date.
        </Callout>
      )}

      <Card>
        <CardHeader icon={Download} title="Download your data" description="A complete copy in JSON, a standard format other software can read." />
        <div className="flex flex-col gap-4 p-5">
          {owner && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-md text-[13px] text-ink-2"><span className="font-medium text-ink">Everything in {b.name}</span>: business details, team, customers, quotes, invoices with hidden costs, payments, receipts and activity. Payment keys are never included.</p>
              <a href="/app/settings/privacy/export?scope=business" download className={buttonClass()}><Download className="size-4" />Business data</a>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-[13px] text-ink-2"><span className="font-medium text-ink">Your personal data</span>: your account, the businesses you belong to and what you've done in them.</p>
            <a href="/app/settings/privacy/export?scope=me" download className={buttonClass()}><Download className="size-4" />My data</a>
          </div>
        </div>
      </Card>

      {owner && !pending && (
        <Card>
          <CardHeader icon={Trash2} iconTone="danger" title="Delete this business" description="For when you stop using Usetally for good." />
          <div className="flex flex-col gap-4 p-5">
            <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-ink-2 marker:text-ink-3">
              <li>Sending stops straight away. After <strong className="text-ink">30 days</strong>, {b.name} and all its customers, quotes, invoices, receipts, payments, logo and team access are permanently deleted.</li>
              <li>You can cancel at any time in those 30 days. After that it can't be undone, so download your data first: you may need your invoices for tax.</li>
              <li>Usetally keeps only the record of what you paid Usetally for your plan, as the tax law requires.</li>
            </ul>
            <DeleteBusinessForm name={b.name} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader icon={UserX} iconTone="danger" title="Delete my account" description={`Removes your login (${ctx.user.email}) and your access to every business.`} />
        <div className="flex flex-col gap-4 p-5">
          {blocking ? (
            <p className="text-[13px] text-ink-2">You own <span className="font-medium text-ink">{blocking.join(", ")}</span>. Delete the business above first. Once it's scheduled for deletion you can delete your account.</p>
          ) : (
            <>
              <p className="text-[13px] text-ink-2">This happens immediately and can't be undone. The businesses you worked for keep their own records, such as documents you created, which they need for their accounts.</p>
              <DeleteAccountForm email={ctx.user.email} />
            </>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" />
          <div className="text-[13px] text-ink-2">
            <p className="font-medium text-ink">How Usetally handles data</p>
            <p className="mt-1">Read our <Link className="font-medium text-brand-ink hover:underline" href="/privacy">Privacy Policy</Link>, the <Link className="font-medium text-brand-ink hover:underline" href="/dpa">Data Processing Agreement</Link> that covers your customers' data, and the <Link className="font-medium text-brand-ink hover:underline" href="/subprocessors">services we use</Link>. To correct something you can't edit yourself, or for any other request, contact support.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
