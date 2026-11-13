import { MessageCircle, MessageSquareText, ShieldCheck, Smartphone } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { formatDate, timeAgo } from "@/lib/format";
import { featuresOf, hasFeature } from "@/lib/entitlements";
import { whatsappConfig } from "@/lib/whatsapp/config";
import { prettyPhone } from "@/lib/whatsapp/core";
import { Badge, Callout, Card, CardHeader, PageHeader } from "@/components/ui";
import { UpgradeNote } from "@/components/upgrade-note";
import { LinkWhatsapp, UnlinkWhatsapp } from "./link";

export const metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

const ASK = [
  "Invoice Ada Obi for 2 logo designs at 150k, due Friday",
  "Who owes me?",
  "INV-0042 has been paid, send her the receipt",
  "Send QT-0007 to Tunde on WhatsApp",
  "Turn QT-0007 into an invoice",
];

// WhatsApp to invoice: link your number, then make, send and chase quotes and
// invoices by chatting with Usetally on WhatsApp. Paid plans.
export default async function Page() {
  const ctx = await requireBusiness();
  const [features, cfg, { data: links, error }] = await Promise.all([
    featuresOf(ctx.supabase, ctx.business.id),
    whatsappConfig(),
    ctx.supabase.from("whatsapp_links").select("id, phone, business_id, linked_at, last_seen_at, businesses(name)").eq("user_id", ctx.user.id).order("linked_at", { ascending: false }),
  ]);
  const paid = hasFeature(features, "whatsapp");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="WhatsApp" description="Make quotes and invoices, see who owes you, mark invoices paid and send them to customers, all by chatting on WhatsApp." />
      {!paid && <UpgradeNote title="WhatsApp to invoice is on paid plans">Upgrade to link your WhatsApp and run your invoicing from a chat. A number you already linked starts working again the moment you upgrade.</UpgradeNote>}
      {error && /whatsapp_links/.test(error.message || "") && <Callout tone="warn" title="Coming soon">WhatsApp needs a database update on Usetally. Check back soon.</Callout>}
      {!cfg.ready && !error && <Callout tone="info" title="Almost here">WhatsApp to invoice is being switched on for Usetally. You'll be able to link your number here soon.</Callout>}

      <Card>
        <CardHeader icon={Smartphone} iconTone="success" title="Your WhatsApp" description="Link the number you'll chat from. It works for you, in the business you're in when you link it, with what your role allows." />
        <div className="flex flex-col gap-4 px-5 pb-5">
          {links?.length ? (
            <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
              {links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-ink"><MessageCircle className="size-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink tabular">{prettyPhone(l.phone)}<Badge size="sm" tone={paid ? "success" : "neutral"}>{paid ? "Linked" : "Paused"}</Badge></p>
                    <p className="text-xs text-ink-3">{l.businesses?.name || "Business"} · linked {formatDate(l.linked_at)} · {l.last_seen_at ? `last message ${timeAgo(l.last_seen_at)}` : "no messages yet"}</p>
                  </div>
                  <UnlinkWhatsapp id={l.id} phone={prettyPhone(l.phone)} />
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-ink-3">No number linked yet.</p>}
          <LinkWhatsapp disabled={!paid || !cfg.ready} bot={cfg.ready ? prettyPhone(cfg.from.replace(/\D/g, "")) : ""} business={ctx.business.name} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={MessageSquareText} title="Things to say" description={cfg.ai ? "Write in your own words, or reply menu for numbered options." : "Reply menu for numbered options, or use these short commands."} />
          <ul className="flex flex-col gap-2 px-5 pb-5">
            {(cfg.ai ? ASK : ["menu", "paid INV-0042 50000", "send INV-0042", "receipt INV-0042", "convert QT-0007"]).map((s) => <li key={s} className="rounded-xl bg-tray px-3.5 py-2.5 text-[13px] text-ink-2">“{s}”</li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader icon={ShieldCheck} title="Safe by design" />
          <ul className="flex list-disc flex-col gap-2 px-5 pb-5 pl-9 text-[13px] leading-relaxed text-ink-2">
            <li>Nothing goes to a customer and no payment is recorded until you reply <strong className="font-medium text-ink">YES</strong>.</li>
            <li>The bot does only what your role allows, and documents it makes are marked “Made by WhatsApp”.</li>
            <li>Customers get your invoice from Usetally's WhatsApp number with your business name, and pay you directly.</li>
            <li>Lost your phone? Remove the number here and it stops working straight away.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
