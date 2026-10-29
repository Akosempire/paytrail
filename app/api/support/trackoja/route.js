import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseService } from "@/lib/supabase/server";
import { checkExternalUser, checkNewThread, checkReply } from "@/lib/feedback-core";
import { alertTeam } from "@/lib/feedback";

// TrackOja's support-messages Edge Function calls this for its signed-in user,
// with Authorization: Bearer <TRACKOJA_SUPPORT_SECRET> (Vercel env; the same
// value is USETALLY_SUPPORT_SECRET in TrackOja). One JSON body per call:
//   { action: "list" | "get" | "start" | "reply", user: { id, email, name }, store: { name }, ... }
export const dynamic = "force-dynamic";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(request) {
  const secret = process.env.TRACKOJA_SUPPORT_SECRET || "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") || "");
  if (secret.length < 32 || !m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function dbError(error) {
  const m = /FB(\d{3}):\s*([^\n]*)/.exec(String(error?.message || ""));
  if (m) return json({ error: m[2].trim() }, Number(m[1]));
  if (/feedback_external|feedback_threads/.test(error?.message || "")) return json({ error: "Messages aren't switched on yet. Try again later." }, 503);
  console.error("support.trackoja_failed", { message: String(error?.message || "").slice(0, 200) });
  return json({ error: "Something went wrong. Try again." }, 500);
}

export async function POST(request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = JSON.parse((await request.text()).slice(0, 20000)); } catch { return json({ error: "Send valid JSON" }, 400); }
  const user = checkExternalUser(body?.user);
  if (!user) return json({ error: "Unknown user" }, 400);
  const service = createSupabaseService();
  const mine = () => service.from("feedback_threads").select("*").eq("source", "trackoja").eq("external_user_id", user.id);

  if (body.action === "list") {
    const { data, error } = await mine().order("last_message_at", { ascending: false }).limit(50);
    if (error) return dbError(error);
    return json({ threads: (data || []).map((t) => ({ id: t.id, kind: t.kind, subject: t.subject, status: t.status, unread: t.unread_user, last_message_at: t.last_message_at })) });
  }

  if (body.action === "get") {
    if (!UUID.test(String(body.thread_id || ""))) return json({ error: "Conversation not found" }, 404);
    const { data: t, error } = await mine().eq("id", body.thread_id).maybeSingle();
    if (error) return dbError(error);
    if (!t) return json({ error: "Conversation not found" }, 404);
    const { data: messages } = await service.from("feedback_messages").select("id, body, from_team, created_at").eq("thread_id", t.id).order("created_at");
    if (t.unread_user) await service.rpc("feedback_external_read", { thread: t.id, ext_user: user.id });
    return json({ thread: { id: t.id, kind: t.kind, subject: t.subject, status: t.status, created_at: t.created_at }, messages: messages || [] });
  }

  if (body.action === "start") {
    const v = checkNewThread({ kind: body.kind, subject: body.subject, body: body.body, page: body.page });
    if (!v.ok) return json({ error: v.error }, 400);
    const store = String(body.store?.name || "").slice(0, 120);
    const { data: id, error } = await service.rpc("feedback_external_start", {
      ext_user: user.id, name: user.name, email: user.email, store, kind: v.value.kind, subject: v.value.subject, body: v.value.body, page: v.value.page,
    });
    if (error) return dbError(error);
    after(() => alertTeam({ threadId: id, ...v.value, name: user.name, email: user.email, business: `TrackOja${store ? ` · ${store}` : ""}`, isNew: true }));
    return json({ id }, 201);
  }

  if (body.action === "reply") {
    const v = checkReply(body.body);
    if (!v.ok) return json({ error: v.error }, 400);
    if (!UUID.test(String(body.thread_id || ""))) return json({ error: "Conversation not found" }, 404);
    const { data, error } = await service.rpc("feedback_external_reply", { thread: body.thread_id, ext_user: user.id, body: v.value });
    if (error) return dbError(error);
    after(() => alertTeam({ threadId: body.thread_id, subject: data?.subject || "", body: v.value, name: data?.name, email: data?.email, business: `TrackOja${data?.store ? ` · ${data.store}` : ""}`, isNew: false }));
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
}
