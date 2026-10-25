import Script from "next/script";
import "./globals.css";
import { Suspense } from "react";
import { ToastProvider } from "@/components/ui-client";
import { UrlToasts } from "@/components/url-toasts";
import { ServiceWorker } from "@/components/pwa";
import { Analytics } from "@/components/analytics";
import { SEO } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

export const metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SEO.title, template: "%s · Usetally" },
  description: SEO.short,
  keywords: SEO.keywords,
  openGraph: { type: "website", siteName: "Usetally", title: SEO.title, description: SEO.short, locale: "en" },
  twitter: { card: "summary_large_image", title: SEO.title, description: SEO.short },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" } },
  applicationName: "Usetally",
  appleWebApp: { capable: true, title: "Usetally", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f7fa" }, { media: "(prefers-color-scheme: dark)", color: "#0c111d" }], width: "device-width", initialScale: 1, viewportFit: "cover" };

// sets the saved theme before the page paints, so there is no flash
// customer links (/d, /r) are always light: they show the business's own branding
const themeScript = `try{if(/^\\/(d|r)\\//.test(location.pathname)){document.documentElement.dataset.theme='light'}else{var t=localStorage.getItem('pt-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <Script id="pt-theme" strategy="beforeInteractive">{themeScript}</Script>
      </head>
      <body>
        <ToastProvider>{children}<Suspense fallback={null}><UrlToasts /></Suspense></ToastProvider>
        <ServiceWorker />
        {/* analytics from Admin → Integrations → Analytics, live site only */}
        {process.env.VERCEL_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
