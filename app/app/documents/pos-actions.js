"use server";
import { requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { underLimit } from "@/lib/guard";
import { searchCatalog } from "@/lib/pos";

// "Add from TrackOja" in the quote/invoice editor: searches the linked store's
// products on the server (the TrackOja key never reaches the browser)
export async function searchTrackOja(q) {
  const ctx = await requireBusiness();
  if (!can(ctx.member, "documents.create")) return { error: "You can't add items here." };
  if (!(await underLimit("poscatalog", ctx.user.id, 60, 60))) return { error: "Too many searches. Wait a moment and try again." };
  try {
    return await searchCatalog(ctx.business.id, String(q ?? "").slice(0, 100));
  } catch {
    return { error: "Couldn't reach TrackOja. Try again." };
  }
}
