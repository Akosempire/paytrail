import { authenticate, dbError, json, fail, readJson } from "@/lib/pos";
import { normalizeSale } from "@/lib/pos-core";

// one completed TrackOja sale → a sent invoice with its receipts. Idempotent
// on the sale id: 201 the first time, 200 with the same body after that.
export const dynamic = "force-dynamic";

export async function POST(request) {
  const { conn, service, response } = await authenticate(request);
  if (response) return response;
  const { body, response: bad } = await readJson(request);
  if (bad) return bad;
  const v = normalizeSale(body, { currency: conn.businesses?.currency });
  if (!v.ok) return fail(422, v.error);
  const { data, error } = await service.rpc("pos_import_sale", { conn_id: conn.id, sale: v.sale });
  if (error) return dbError(error);
  return json({ document_id: data.document_id, number: data.number, status: data.status }, data.created ? 201 : 200);
}
