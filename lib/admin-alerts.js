import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "@/lib/email";
import { adminAlertEmail } from "@/lib/emails";
import { siteUrl } from "@/lib/site";

// Emails the platform owner(s) about events worth knowing. Recipients:
// ADMIN_ALERT_EMAILS (comma separated) or, if unset, every platform admin.
// Secret keys are never included, only what changed and who did it.
async function recipients() {
  const fromEnv = String(process.env.ADMIN_ALERT_EMAILS || "").split(/[\s,;]+/).filter((e) => /^\S+@\S+\.\S+$/.test(e));
  if (fromEnv.length) return fromEnv;
  const service = createSupabaseService();
  const { data: admins } = await service.from("platform_admins").select("user_id");
  const emails = [];
  for (const a of admins || []) {
    const { data } = await service.auth.admin.getUserById(a.user_id).catch(() => ({ data: null }));
    if (data?.user?.email) emails.push(data.user.email);
  }
  return emails;
}

export async function notifyAdmins({ subject, heading, lines, link }) {
  if (!emailConfigured()) return { sent: false };
  try {
    const to = await recipients();
    if (!to.length) return { sent: false };
    return await sendEmail({ to: to.join(", "), ...adminAlertEmail({ subject, heading, lines, link: link ? `${siteUrl()}${link}` : null }) });
  } catch (e) {
    console.error("admin_alert.failed", { message: e?.message });
    return { sent: false };
  }
}
