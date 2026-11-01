import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { DRAFT } from "@/lib/announcements-core";
import { formatDate } from "@/lib/format";
import { Callout, PageHeader } from "@/components/ui";
import { AnnouncementEditor } from "./editor";

export const metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePlatformAdmin();
  const service = createSupabaseService();
  const [{ data: list, error }, { data: owners }] = await Promise.all([
    service.from("announcements").select("*").order("created_at", { ascending: false }).limit(20),
    service.from("memberships").select("email").eq("role", "owner").limit(10000),
  ]);
  const ownerCount = new Set((owners || []).map((o) => String(o.email || "").toLowerCase()).filter(Boolean)).size;
  const latest = list?.[0];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Announcements" description="News for every Usetally user: a banner on their dashboard, and one email to each business owner." />
      {error && <Callout tone="warn" title="Database update needed">Run RUN_NEW_2026-11-02a.sql in Supabase, then refresh this page.</Callout>}
      {!error && <AnnouncementEditor key={latest?.id || "new"} initial={latest || { ...DRAFT, id: null }} ownerCount={ownerCount} />}
      {list?.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[14px] font-semibold text-ink">Earlier</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
            {list.slice(1).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px]">
                <span className="font-medium text-ink">{a.title}</span>
                <span className="text-ink-3">{a.published_at ? `Published ${formatDate(a.published_at)}` : "Draft"}{a.emailed_at ? ` · emailed ${a.email_sent} owners` : ""}{a.active ? " · on dashboards" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
