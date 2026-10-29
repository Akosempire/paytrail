import "server-only";
import { notifyAdmins } from "@/lib/admin-alerts";
import { emailConfigured, sendEmail } from "@/lib/email";
import { teamReplyEmail } from "@/lib/emails";
import { siteUrl } from "@/lib/site";
import { KINDS, preview, trackojaThreadUrl } from "@/lib/feedback-core";

// Ideas & help emails. Never throw: a failed email must not lose the message.

// a new thread, or the person wrote again → the platform team
export async function alertTeam({ threadId, kind, subject, body, name, email, business, isNew }) {
  try {
    await notifyAdmins({
      subject: `${isNew ? KINDS[kind]?.label || "Message" : "Reply"}: ${subject}`,
      heading: isNew ? `${KINDS[kind]?.label || "New message"} from ${name || email || "a user"}` : `${name || email || "A user"} replied`,
      lines: [
        `“${subject}”`,
        preview(body, 600),
        [business && `Business: ${business}`, email && `Email: ${email}`].filter(Boolean).join(" · "),
      ].filter(Boolean),
      link: `/admin/inbox/${threadId}`,
    });
  } catch (e) {
    console.error("feedback.alert_failed", { message: String(e?.message || e).slice(0, 200) });
  }
}

// the team replied → the person who wrote
export async function emailPerson({ threadId, to, name, subject, reply, source }) {
  try {
    if (!to || !(await emailConfigured())) return;
    await sendEmail({ to, ...teamReplyEmail({ name, subject, reply: preview(reply, 1500), app: source === "trackoja" ? "TrackOja" : undefined, link: source === "trackoja" ? trackojaThreadUrl(threadId, process.env.TRACKOJA_URL) : `${siteUrl()}/app/feedback/${threadId}` }) });
  } catch (e) {
    console.error("feedback.reply_email_failed", { message: String(e?.message || e).slice(0, 200) });
  }
}
