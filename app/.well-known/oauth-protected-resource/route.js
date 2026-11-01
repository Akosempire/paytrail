import { protectedResourceMetadata } from "@/lib/ai/oauth-core";
import { aiSite, json, preflight } from "@/lib/ai/http";

// RFC 9728: which authorization server signs people in for /mcp
export const GET = () => json(protectedResourceMetadata(aiSite()), 200, { "cache-control": "public, max-age=3600" });
export const OPTIONS = preflight;
