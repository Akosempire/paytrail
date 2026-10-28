import { platformConfig } from "@/lib/platform-config";
import { marketingSettings } from "@/lib/meta";

// Public, non-secret settings the browser needs: which analytics to load.
// Set in Admin → Integrations → Analytics; cached for 5 minutes.
export const dynamic = "force-dynamic";

export async function GET() {
  const [{ analytics }, mk] = await Promise.all([platformConfig(), marketingSettings().catch(() => null)]);
  // the Meta Pixel ID is public (it's in every page's source anyway)
  return Response.json({ analytics, meta: mk?.pixelId ? { pixel: mk.pixelId } : null }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } });
}
