import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// email confirmation, password reset and invite links all land here
export async function GET(request) {
  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next") || "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";
  const supabase = await createSupabaseServer();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  let error = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else error = new Error("missing code");
  if (error) return NextResponse.redirect(new URL("/login?link=expired", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
