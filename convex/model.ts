import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { currentMonth } from "./lib/plans";

/** 로그인 사용자 id 강제 확보. */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("로그인이 필요합니다.");
  return userId;
}

export async function getProfile(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function bump(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: { sends?: number; pressReleases?: number },
) {
  const month = currentMonth();
  const row = await ctx.db
    .query("usage")
    .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
    .unique();
  if (!row) {
    await ctx.db.insert("usage", {
      userId,
      month,
      sendsUsed: patch.sends ?? 0,
      pressReleasesUsed: patch.pressReleases ?? 0,
    });
  } else {
    await ctx.db.patch(row._id, {
      sendsUsed: row.sendsUsed + (patch.sends ?? 0),
      pressReleasesUsed: row.pressReleasesUsed + (patch.pressReleases ?? 0),
    });
  }
}

export const bumpSends = (ctx: MutationCtx, userId: Id<"users">, by = 1) =>
  bump(ctx, userId, { sends: by });

export const bumpPressReleases = (ctx: MutationCtx, userId: Id<"users">, by = 1) =>
  bump(ctx, userId, { pressReleases: by });
