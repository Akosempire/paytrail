import { requireAdminSection } from "@/lib/context";

// Admin → Community → Download CSV
export async function GET() {
  const ctx = await requireAdminSection("marketing");
  const { data } = await ctx.supabase.from("community_signups").select("created_at, name, email, phone, batch, business_name, stage, clicked_at, reminders, stopped_at").order("created_at", { ascending: false }).limit(10000);
  const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
  const rows = [["Signed up", "Name", "Email", "Phone", "Batch", "Business", "Stage", "Opened group link", "Reminders sent", "Stopped reminders"],
    ...(data || []).map((r) => [r.created_at, r.name, r.email, r.phone, r.batch, r.business_name, r.stage, r.clicked_at || "", r.reminders, r.stopped_at || ""])];
  return new Response(rows.map((r) => r.map(cell).join(",")).join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="community-signups.csv"` } });
}
