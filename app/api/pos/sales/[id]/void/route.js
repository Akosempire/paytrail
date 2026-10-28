import { authenticate, dbError, fail, json, readJson } from "@/lib/pos";
import { cleanText } from "@/lib/pos-core";

// a sale voided in TrackOja: void its invoice here (idempotent)
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { conn, service, response } = await authenticate(request);
  if (response) return response;
  const { id } = await params;
  if (!/^[0-9A-Za-z-]{1,64}$/.test(String(id || ""))) return fail(404, "Sale not found");
  const { body, response: bad } = await readJson(request, 8_000);
  if (bad) return bad;
  const { data, error } = await service.rpc("pos_void_sale", { conn_id: conn.id, ext: id, reason: cleanText(body?.reason, 500) });
  if (error) return dbError(error);
  if (!data) return fail(404, "Sale not found");
  return json({ document_id: data.document_id, number: data.number, status: data.status });
}
