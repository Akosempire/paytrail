"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { absoluteLink, checkAnnouncement, ownerRecipients } from "@/lib/announcements-core";
import { sendEmail } from "@/lib/email";
import { announcementEmail } from "@/lib/emails";
import { siteUrl } from "@/lib/site";

const SQL_MSG = "Announcements need a quick database update: run RUN_NEW_2026-11-02a.sql in Supabase.";
const AUDIENCE_SQL = "Sending to chosen businesses needs a quick database update: run RUN_NEW_2026-11-03a.sql in Supabase.";
const noAudience = (e) => /audience|business_ids/.test(e?.message || "");
const refresh = () => { revalidatePath("/admin/announcements"); revalidatePath("/app"); };

// save (create or update); publishing shows it on every dashboard
export async function saveAnnouncement(id, input, { publish } = {}) {
  const ctx = await requirePlatformAdmin();
  const v = checkAnnouncement(input);
  if (v.error) return { error: v.error };
  const service = createSupabaseService();
  const now = new Date().toISOString();
  const row = { ...v.value, updated_at: now, ...(publish === true ? { active: true, published_at: now } : publish === false ? { active: false } : {}) };
  const write = (r) => (id ? service.from("announcements").update(r).eq("id", id) : service.from("announcements").insert({ ...r, created_by: ctx.user.id })).select("id").single();
  let { data, error } = await write(row);
  if (error && noAudience(error)) {
    // before RUN_NEW_2026-11-03a.sql: "everyone" still works, a chosen list doesn't
    if (row.audience === "selected") return { error: AUDIENCE_SQL };
    const { audience, business_ids, ...rest } = row;
    ({ data, error } = await write(rest));
  }
  if (error) return { error: /announcements/.test(error.message || "") ? SQL_MSG : "Couldn't save it. Try again." };
  refresh();
  const who = row.audience === "selected" ? `the ${row.business_ids.length} business${row.business_ids.length === 1 ? "" : "es"} you picked` : "everyone";
  return { id: data.id, message: publish === true ? `Published. It's on the dashboard for ${who}.` : publish === false ? "Taken down from dashboards." : "Saved." };
}

// every owner, or only the owners of the chosen businesses
async function owners(service, a) {
  let q = service.from("memberships").select("email, full_name, businesses(deletion_requested_at)").eq("role", "owner");
  if (a?.audience === "selected") q = q.in("business_id", a.business_ids?.length ? a.business_ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q.limit(10000);
  return ownerRecipients(data || []);
}

export async function recipientCount() {
  await requirePlatformAdmin();
  return { count: (await owners(createSupabaseService())).length };
}

// a copy to yourself first, to check how it looks
export async function sendTest(input) {
  const ctx = await requirePlatformAdmin();
  const v = checkAnnouncement(input);
  if (v.error) return { error: v.error };
  const to = ctx.user.email;
  const r = await sendEmail({ to, ...announcementEmail({ ...v.value, link: v.value.link_href && absoluteLink(siteUrl(), v.value.link_href), label: v.value.link_label, name: ctx.profile?.full_name }) }).catch(() => ({ sent: false }));
  return r?.sent ? { message: `Test sent to ${to}.` } : { error: "The test email couldn't be sent. Check Admin → Settings → Email." };
}

// one email to every business owner, once per announcement
export async function emailOwners(id) {
  await requirePlatformAdmin();
  const service = createSupabaseService();
  // claim it first, so a double click can't send twice
  const { data: claimed, error } = await service.from("announcements").update({ emailed_at: new Date().toISOString() }).eq("id", id).is("emailed_at", null).select("*");
  if (error) return { error: /announcements/.test(error.message || "") ? SQL_MSG : "Couldn't start sending. Try again." };
  const a = claimed?.[0];
  if (!a) return { error: "This announcement has already been emailed." };
  const list = await owners(service, a);
  const { data: settings } = await service.from("platform_settings").select("support_email").eq("id", true).maybeSingle();
  const link = a.link_href ? absoluteLink(siteUrl(), a.link_href) : "";
  after(async () => {
    let sent = 0;
    for (let i = 0; i < list.length; i += 5) {
      const batch = list.slice(i, i + 5);
      const results = await Promise.all(batch.map((r) => sendEmail({ to: r.email, replyTo: settings?.support_email || undefined,
        ...announcementEmail({ title: a.title, body: a.body, link, label: a.link_label, name: r.name }) }).catch(() => ({ sent: false }))));
      sent += results.filter((x) => x?.sent).length;
    }
    await service.from("announcements").update({ email_sent: sent }).eq("id", a.id);
  });
  refresh();
  return { message: `Sending to ${list.length} business owner${list.length === 1 ? "" : "s"}${a.audience === "selected" ? " you picked" : ""}. The count updates here when it's done.` };
}
