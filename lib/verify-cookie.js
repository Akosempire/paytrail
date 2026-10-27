import "server-only";
import { cookies } from "next/headers";

// "We sent you a code": remembered for an hour in a cookie, so the code screen
// is still there when someone comes back from their email app (phones often
// reload the tab). Kept out of the URL so emails never reach analytics.
const NAME = "ut_verify";

export async function rememberVerify({ email, next, codeLength }) {
  const v = Buffer.from(JSON.stringify({ e: email, n: next || "", l: codeLength || null })).toString("base64url");
  (await cookies()).set(NAME, v, { maxAge: 3600, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
}

export async function pendingVerify() {
  try {
    const raw = (await cookies()).get(NAME)?.value;
    if (!raw) return null;
    const { e, n, l } = JSON.parse(Buffer.from(raw, "base64url").toString());
    return /^\S+@\S+\.\S+$/.test(e || "") ? { email: e, next: n || "/onboarding", codeLength: Number(l) || null } : null;
  } catch { return null; }
}

export async function clearVerify() {
  (await cookies()).delete(NAME);
}
