import "server-only";
import { siteUrl } from "@/lib/site";

// AI apps call these from their servers, and MCP test tools from a browser, so
// they answer any origin. Tokens travel in headers, never cookies.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...headers } });
}
export const preflight = () => new Response(null, { status: 204, headers: CORS });

// the public address apps use; the MCP resource and issuer must match it exactly
export const aiSite = () => siteUrl();

// form-urlencoded (the OAuth standard) or JSON, whichever the app sent
export async function readBody(request) {
  const type = request.headers.get("content-type") || "";
  try {
    if (type.includes("application/json")) return await request.json();
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text));
  } catch { return {}; }
}
