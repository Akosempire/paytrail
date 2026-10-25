import { siteUrl } from "@/lib/site";

// Search engines and AI assistants are welcome on the public pages.
// Signed-in areas and customers' private document links stay out.
const PRIVATE = ["/app", "/admin", "/api/", "/onboarding", "/invite", "/print", "/pay", "/auth", "/d/", "/r/", "/reset", "/offline"];
const AI_BOTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",          // OpenAI / ChatGPT
  "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", // Anthropic / Claude
  "Google-Extended", "Googlebot",                     // Google Search and Gemini
  "Bingbot",                                          // Bing / Copilot
  "PerplexityBot", "Perplexity-User",                 // Perplexity
  "Applebot", "Applebot-Extended",                    // Apple
  "meta-externalagent", "DuckAssistBot", "cohere-ai", "MistralAI-User", "YouBot",
];

export default function robots() {
  const base = siteUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: ["/", "/llms.txt"], disallow: PRIVATE },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
