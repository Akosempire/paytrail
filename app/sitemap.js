import { siteUrl } from "@/lib/site";
import { PUBLIC_PAGES } from "@/lib/seo";

export default function sitemap() {
  const base = siteUrl();
  const now = new Date();
  return [
    ...PUBLIC_PAGES.map(([path, priority, changeFrequency]) => ({ url: `${base}${path === "/" ? "" : path}`, lastModified: now, changeFrequency, priority })),
    { url: `${base}/llms.txt`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
  ];
}
