import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "@/lib/email";
import { communityInviteEmail } from "@/lib/emails";
import { siteUrl } from "@/lib/site";
import { reminderDue } from "@/lib/community";

// The WhatsApp community: settings, the email with the group link, and the
// daily reminders (after 1, 3 and 7 days) until the join link is clicked.

export async function communitySettings(service = createSupabaseService()) {
  const { data, error } = await service.from("platform_settings").select("community_enabled, community_link, community_batches, community_rules").eq("id", true).maybeSingle();
  if (error) return { ready: false, missingSql: /community|column|schema cache/i.test(error.message || "") };
  return { ready: Boolean(data?.community_enabled && data?.community_link), enabled: Boolean(data?.community_enabled), link: data?.community_link || "", batches: data?.community_batches || [], rules: data?.community_rules || "" };
}

// the group link email (first one or a reminder); records when it went
export async function sendCommunityEmail(service, row, { reminder = 0, rules = "" } = {}) {
  if (!(await emailConfigured())) return { sent: false, error: "Email isn't set up." };
  const site = siteUrl();
  const r = await sendEmail({
    to: row.email,
    ...communityInviteEmail({ name: row.name, joinUrl: `${site}/community/join/${row.token}`, stopUrl: `${site}/community/stop/${row.token}`, reminder, rules }),
  }).catch((e) => ({ sent: false, error: String(e?.message || e) }));
  if (!r?.sent) return { sent: false, error: r?.error || "The email didn't send." };
  const now = new Date().toISOString();
  await service.from("community_signups").update(reminder ? { reminders: reminder, last_reminded_at: now, updated_at: now } : { emailed_at: now, updated_at: now }).eq("id", row.id);
  return { sent: true };
}

// daily job: remind people who haven't clicked the join link yet
export async function runCommunityReminders() {
  const service = createSupabaseService();
  const cfg = await communitySettings(service);
  if (!cfg.ready) return { skipped: cfg.missingSql ? "run the community SQL" : "community is off" };
  const since = new Date(Date.now() - 10 * 86400_000).toISOString();
  const { data: rows, error } = await service.from("community_signups").select("id, name, email, token, created_at, emailed_at, reminders, clicked_at, stopped_at")
    .is("clicked_at", null).is("stopped_at", null).gte("created_at", since).limit(500);
  if (error) return { error: error.message };
  let sent = 0, failed = 0;
  for (const row of rows || []) {
    // the first email didn't go when they signed up: send it now
    if (!row.emailed_at) { const r = await sendCommunityEmail(service, row, { rules: cfg.rules }); r.sent ? sent++ : failed++; continue; }
    if (!reminderDue(row)) continue;
    const r = await sendCommunityEmail(service, row, { reminder: Number(row.reminders || 0) + 1, rules: cfg.rules });
    r.sent ? sent++ : failed++;
  }
  return { sent, failed };
}
