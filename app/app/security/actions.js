"use server";
import { requireBusiness, requirePlatformAdmin } from "@/lib/context";
import { PURPOSES, sendStepUpCode, verifyStepUpCode } from "@/lib/step-up";

// scope "platform" is the platform owner changing Usetally's own billing keys
async function scoped(scope) {
  if (scope === "platform") return { ctx: await requirePlatformAdmin(), businessId: null, name: "Usetally billing" };
  const ctx = await requireBusiness();
  return { ctx, businessId: ctx.business.id, name: ctx.business.name };
}

export async function requestSecurityCode(purpose, scope = "business") {
  if (!PURPOSES[purpose]) return { error: "Unknown action." };
  const { ctx, businessId, name } = await scoped(scope);
  return sendStepUpCode(ctx, purpose, businessId, name);
}

export async function confirmSecurityCode(purpose, code, scope = "business") {
  if (!PURPOSES[purpose]) return { error: "Unknown action." };
  const { ctx, businessId } = await scoped(scope);
  return verifyStepUpCode(ctx, purpose, businessId, code);
}
