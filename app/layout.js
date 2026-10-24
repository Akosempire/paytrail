import Script from "next/script";
import "./globals.css";
import { ToastProvider } from "@/components/ui-client";

export const metadata = {
  title: { default: "PayTrail — quotes, invoices & receipts", template: "%s · PayTrail" },
  description: "Send branded quotations, get paid online with Stripe, Paystack, Flutterwave or Bachs, and issue receipts automatically. Track your real costs and profit on every job.",
};

export const viewport = { themeColor: "#1570EF", width: "device-width", initialScale: 1 };

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
      </body>
    </html>
  );
}
