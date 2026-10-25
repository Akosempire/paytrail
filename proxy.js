import { NextResponse } from "next/server";
import { supabaseUrl } from "./lib/supabase/url";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/app", "/admin", "/onboarding", "/print"];

// keeps the Supabase session fresh and sends signed-out visitors to the login page
export async function proxy(request) {
  let response = NextResponse.next({ request });
  if (process.env.PAYTRAIL_PREVIEW === "1" && process.env.NODE_ENV !== "production") {
    // preview: stand in for the auth round trip a real request makes here
    const ms = Number(process.env.PAYTRAIL_PREVIEW_LATENCY_MS || 0);
    if (ms) await new Promise((r) => setTimeout(r, ms));
    return response;
  }
  if (!supabaseUrl() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return response;
  const supabase = createServerClient(supabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getClaims() refreshes the session if needed and verifies the token's
  // signature locally (falls back to a network check on legacy JWT secrets)
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;
  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
