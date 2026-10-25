import { requirePlatformAdmin } from "@/lib/context";
import { emailStatus } from "@/lib/email";
import { EmailStatus } from "../../settings/email-status";
import { IntegrationHeader } from "../shared";

export const metadata = { title: "Email" };

export default async function EmailPage() {
  await requirePlatformAdmin();
  return (
    <div className="flex flex-col gap-6">
      <IntegrationHeader title="Email" description="The service that sends every Usetally email. Paste a Sendhiiv or Brevo key; it's checked before it's saved." />
      <EmailStatus status={await emailStatus()} />
    </div>
  );
}
