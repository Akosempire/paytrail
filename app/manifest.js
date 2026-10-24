// Web app manifest: lets Tally be installed on phones and desktops.
export default function manifest() {
  return {
    name: "Tally: quotes, invoices & payments",
    short_name: "Tally",
    description: "Send branded quotations and invoices, get paid online and issue receipts.",
    id: "/app",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7fa",
    theme_color: "#f5f7fa",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New quote", url: "/app/quotes/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "New invoice", url: "/app/invoices/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
