import { BRAND } from "@/lib/brand";
import { supabaseUrl } from "@/lib/supabase/url";

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

// public address of a business image. R2 files are served by this site
// (/media/…, relative, so it works on any domain); older files are in Supabase.
export function logoUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("r2:")) return `/media/${path.slice(3)}`;
  return `${supabaseUrl()}/storage/v1/object/public/logos/${path}`;
}

// the same, always absolute (emails and payment pages are opened elsewhere)
export function absoluteLogoUrl(path) {
  const url = logoUrl(path);
  return url && url.startsWith("/") ? `${siteUrl()}${url}` : url;
}
