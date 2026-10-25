"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, HardDrive } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { moveImagesToR2 } from "../actions";

// Where business logos and signatures are kept: Cloudflare R2 once the R2_
// settings are in Vercel, Supabase Storage before that.
export function StorageStatus({ status, waiting }) {
  const router = useRouter();
  const toast = useToast();
  const [moving, startMove] = useTransition();
  const move = () => startMove(async () => {
    const r = await moveImagesToR2();
    if (r.error) return toast.error({ title: "Nothing moved", message: r.error }, { duration: 12000 });
    if (r.failed) toast.warning({ title: `Moved ${r.moved}, ${r.failed} not moved`, message: "Those stay in Supabase and still show. Try again later." });
    else toast.success({ title: r.moved ? `Moved ${r.moved} image${r.moved === 1 ? "" : "s"}` : "Nothing left to move", message: "Logos and signatures are now served from Cloudflare." });
    router.refresh();
  });
  return (
    <Card>
      <CardHeader icon={HardDrive} title="File storage" description="Business logos and signatures, up to 1 MB each."
        actions={status.ready ? <Badge tone="success" size="sm">Cloudflare R2</Badge> : <Badge tone="warn" size="sm">Supabase Storage</Badge>} />
      <div className="flex flex-col gap-3 px-5 pb-5 text-[13px] leading-relaxed text-ink-2">
        <p>{status.note}</p>
        {status.ready ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" icon={CloudUpload} loading={moving} disabled={!waiting} onClick={move}>Move existing images to Cloudflare</Button>
            <span className="text-ink-3">{waiting ? `${waiting} still in Supabase` : "All images are on Cloudflare"}</span>
          </div>
        ) : (
          <p className="text-ink-3">New uploads go to Supabase until R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are set in Vercel.</p>
        )}
      </div>
    </Card>
  );
}
