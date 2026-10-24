import Script from "next/script";
import "./globals.css";
import { ToastProvider } from "@/components/ui-client";
import { ServiceWorker } from "@/components/pwa";

export const metadata = {
  title: { default: "Usetally — quotes, invoices & payments", template: "%s · Usetally" },
  description: "Send branded quotations, get paid online with Stripe, Paystack, Flutterwave or Bachs, and issue receipts automatically. Track your real costs and profit on every job.",
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
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
