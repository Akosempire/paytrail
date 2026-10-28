import { authenticate, dbError } from "@/lib/pos";

// TrackOja disconnected: the key stops working at once
export const dynamic = "force-dynamic";

export async function POST(request) {
  const { conn, service, response } = await authenticate(request);
  if (response) return response;
  const { error } = await service.rpc("pos_revoke", { conn_id: conn.id });
  if (error) return dbError(error);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
