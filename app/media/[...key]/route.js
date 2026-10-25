import { r2Get, SAFE_KEY } from "@/lib/storage";

// Serves business logos and signatures from the private R2 bucket.
// File names never change (a new upload gets a new name), so browsers and
// Vercel's CDN can keep them for a year.
export async function GET(_request, { params }) {
  const key = (await params).key.join("/");
  if (!SAFE_KEY.test(key)) return new Response("Not found", { status: 404 });
  const file = await r2Get(key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body, {
    headers: {
      "Content-Type": file.headers.get("content-type") || (key.endsWith(".jpg") ? "image/jpeg" : key.endsWith(".webp") ? "image/webp" : "image/png"),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
