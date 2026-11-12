import { requireAdminSection } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { DRAFT, audienceLabel } from "@/lib/announcements-core";
import { formatDate } from "@/lib/format";
import { Callout, PageHeader } from "@/components/ui";
import { AnnouncementEditor } from "./editor";

export const metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminSection("announcements");
  const service = createSupabaseService();
  const [{ data: list, error }, { data: owners }, { data: bizRows }] = await Promise.all([
    service.from("announcements").select("*").order("created_at", { ascending: false }).limit(20),
    service.from("memberships").select("email, full_name, business_id").eq("role", "owner").limit(10000),
    service.from("businesses").select("id, name, kind, subscription_status, created_at, deletion_requested_at, plans(name)").order("created_at", { ascending: false }).limit(5000),
  ]);
  // the picker: each business with its owner, newest first, skipping ones being deleted
  const ownerOf = new Map((owners || []).map((o) => [o.business_id, o]));
  const businesses = (bizRows || []).filter((b) => !b.deletion_requested_at).map((b) => ({
    id: b.id, name: b.name || "Unnamed business", kind: b.kind, owner: ownerOf.get(b.id)?.full_name || "", email: ownerOf.get(b.id)?.email || "",
    plan: b.plans?.name || (b.subscription_status === "trialing" ? "Trial" : b.subscription_status === "active" ? "Plan" : b.subscription_status || ""),
  }));
  const ownerCount = new Set((owners || []).map((o) => String(o.email || "").toLowerCase()).filter(Boolean)).size;
  const latest = list?.[0];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Announcements" description="News from the Usetally team: a banner on their dashboard and an email to the owner. Send it to everyone, or pick the businesses." />
      {error && <Callout tone="warn" title="Database update needed">Run RUN_NEW_2026-11-02a.sql in Supabase, then refresh this page.</Callout>}
      {!error && <AnnouncementEditor key={latest?.id || "new"} initial={latest || { ...DRAFT, id: null }} ownerCount={ownerCount} businesses={businesses} />}
      {list?.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[14px] font-semibold text-ink">Earlier</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
            {list.slice(1).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px]">
                <span className="font-medium text-ink">{a.title}</span>
                <span className="text-ink-3">{audienceLabel(a)} · {a.published_at ? `Published ${formatDate(a.published_at)}` : "Draft"}{a.emailed_at ? ` · emailed ${a.email_sent} owners` : ""}{a.active ? " · on dashboards" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
