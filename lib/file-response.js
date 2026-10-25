import "server-only";
import { r2Get } from "@/lib/storage";
import { typeOfMime } from "@/lib/file-types";

// Streams an attached file from R2. PDFs and photos open in the browser;
// everything else downloads. Never sniffed, never run as a page.
export async function fileResponse(file, { download = false } = {}) {
  const res = await r2Get(file.storage_key);
  if (!res) return new Response("This file is no longer available.", { status: 404 });
  const type = typeOfMime(file.content_type);
  const inline = !download && type?.inline;
  const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  const headers = {
    "Content-Type": file.content_type,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=300",
    "X-Robots-Tag": "noindex",
  };
  if (type?.image) headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
  return new Response(res.body, { headers });
}
