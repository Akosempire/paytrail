import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// the preview card shown when usetally.cc is shared in chats and on social media
export const alt = "Usetally: quotes, invoices, payments and receipts in one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/icons/icon-512.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f4f1ea", color: "#16140f", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={logo} width={72} height={72} style={{ borderRadius: 18 }} alt="" />
          <span style={{ fontSize: 44, fontWeight: 700 }}>Usetally</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>Quotes. Invoices.</span>
          <span style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: "#175cd3" }}>Payments. Receipts.</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 28, color: "#5d5b53" }}>
          <span style={{ maxWidth: 820 }}>Get paid into your own Paystack, Stripe, Flutterwave or Bachs account. See real profit on every job.</span>
          <span style={{ color: "#175cd3", fontWeight: 700 }}>usetally.cc</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
