import { BRAND } from "@/lib/brand";

// The address of this Usetally, used in emails, payment links and webhook URLs.
// NEXT_PUBLIC_SITE_URL wins when it's a real address. On the live site a
// localhost value (copied from a .env file by mistake) is ignored, so
// webhooks and email links never point at someone's own computer.
export function siteUrl() {
  const set = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(set);
  const vercel = process.env.VERCEL_ENV; // "production" | "preview" | "development" on Vercel
  if (set && !(local && (vercel === "production" || vercel === "preview"))) return set;
  if (vercel === "production") return `https://${BRAND.domain}`;
  if (vercel === "preview" && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return set || "http://localhost:3000";
}

export function logoUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${path}`;
}
