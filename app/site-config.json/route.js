import { platformConfig } from "@/lib/platform-config";

// Public, non-secret settings the browser needs: which analytics to load.
// Set in Admin → Integrations → Analytics; cached for 5 minutes.
export const dynamic = "force-dynamic";

export async function GET() {
  const { analytics } = await platformConfig();
  return Response.json({ analytics }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } });
}
