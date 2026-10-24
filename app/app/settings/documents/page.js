import { requirePermission } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { DocumentDefaults } from "./defaults";

export const metadata = { title: "Documents & printing" };

const ITEM_COLS = "description, details, quantity, unit_price_minor";

async function latest(ctx, kind) {
  const { data: doc } = await ctx.supabase.from("documents").select("*").eq("business_id", ctx.business.id).eq("kind", kind).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!doc) return null;
  const { data: items } = await ctx.supabase.from("document_items").select(ITEM_COLS).eq("document_id", doc.id).order("sort_order");
  return { doc, items: items || [] };
}

export default async function DocumentsSettings() {
  const ctx = await requirePermission("settings.business");
  const [quote, invoice, receiptRow] = await Promise.all([
    latest(ctx, "quote"), latest(ctx, "invoice"),
    ctx.supabase.from("receipts").select("*").eq("business_id", ctx.business.id).order("issued_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data),
  ]);
  let receipt = null;
  if (receiptRow) {
    const [{ data: payment }, { data: doc }, { data: items }] = await Promise.all([
      ctx.supabase.from("payments").select("method, reference, paid_at").eq("id", receiptRow.payment_id).maybeSingle(),
      ctx.supabase.from("documents").select("*").eq("id", receiptRow.document_id).maybeSingle(),
      ctx.supabase.from("document_items").select(ITEM_COLS).eq("document_id", receiptRow.document_id).order("sort_order"),
    ]);
    if (doc) receipt = { doc, items: items || [], receipt: receiptRow, payment };
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Documents & printing" description="Default template and paper size for each document type. You can still change them on any document. Documents already sent keep the look and branding they were sent with." />
      <DocumentDefaults business={ctx.business} samples={{ quote, invoice, receipt }} />
    </div>
  );
}
