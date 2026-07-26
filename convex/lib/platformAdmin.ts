import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getProfile, requireUser } from "../model";

/** Convex env: ADMIN_EMAILS=a@x.com,b@y.com */
export function adminEmailAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAILS?.trim() ?? "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function isPlatformAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const profile = await getProfile(ctx, userId);
  if (profile?.isPlatformAdmin) return true;

  const user = await ctx.db.get(userId);
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  return adminEmailAllowlist().has(email);
}

export async function requirePlatformAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<{
  userId: Id<"users">;
  profile: Doc<"profiles">;
}> {
  const userId = await requireUser(ctx);
  const allowed = await isPlatformAdmin(ctx, userId);
  if (!allowed) {
    throw new Error("플랫폼 관리자만 접근할 수 있습니다.");
  }
  const profile = await getProfile(ctx, userId);
  if (!profile) throw new Error("프로필이 없습니다.");
  return { userId, profile };
}
