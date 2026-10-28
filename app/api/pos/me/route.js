import { authenticate, json } from "@/lib/pos";

// who this key belongs to
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { conn, response } = await authenticate(request);
  if (response) return response;
  const b = conn.businesses || {};
  return json({ business: { id: b.id, name: b.name, currency: b.currency }, connected_at: conn.created_at });
}
