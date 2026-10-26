import { OfflineApp } from "./offline-app";

export const metadata = { title: "Offline", robots: { index: false, follow: false } };
export const dynamic = "force-static";

// The whole app, working from the copy saved on this device. The service worker
// keeps this page and its scripts, and opens it whenever /app can't be reached.
export default function Page() {
  return <OfflineApp />;
}
