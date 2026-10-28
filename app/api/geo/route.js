import { visitorCountry } from "@/lib/geo";

// The visitor's country, for the cookie choice (shown only where the law
// asks for it). Never cached: it's per visitor.
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ country: await visitorCountry() }, { headers: { "Cache-Control": "private, no-store" } });
}
