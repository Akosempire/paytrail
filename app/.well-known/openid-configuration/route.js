import { authServerMetadata } from "@/lib/ai/oauth-core";
import { aiSite, json, preflight } from "@/lib/ai/http";

// RFC 8414: where AI apps sign people in, register, and get tokens
export const GET = () => json(authServerMetadata(aiSite()), 200, { "cache-control": "public, max-age=3600" });
export const OPTIONS = preflight;
