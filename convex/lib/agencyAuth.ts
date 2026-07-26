import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getProfile } from "../model";
import type { Plan } from "./plans";

export type AgencyRole = "owner" | "admin" | "member";

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateApiKey(): { raw: string; prefix: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const raw = `cp_live_${hex}`;
  return { raw, prefix: raw.slice(0, 16) };
}

export async function requireAgencyPlan(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles">> {
  const profile = await getProfile(ctx, userId);
  if (!profile) throw new Error("프로필이 없습니다.");
  const plan = profile.plan as Plan;
  if (plan !== "agency") {
    throw new Error(
      "Agency 플랜에서만 멀티 클라이언트·API를 사용할 수 있습니다. 설정에서 플랜을 Agency로 바꾸세요.",
    );
  }
  return profile;
}

export async function getMembership(
  ctx: QueryCtx | MutationCtx,
  agencyId: Id<"agencies">,
  userId: Id<"users">,
) {
  return ctx.db
    .query("agencyMembers")
    .withIndex("by_agency_user", (q) => q.eq("agencyId", agencyId).eq("userId", userId))
    .unique();
}

export async function requireAgencyMember(
  ctx: QueryCtx | MutationCtx,
  agencyId: Id<"agencies">,
  userId: Id<"users">,
  minRole: AgencyRole = "member",
) {
  const membership = await getMembership(ctx, agencyId, userId);
  if (!membership) throw new Error("에이전시에 대한 권한이 없습니다.");
  const rank: Record<AgencyRole, number> = { member: 1, admin: 2, owner: 3 };
  if (rank[membership.role] < rank[minRole]) {
    throw new Error("권한이 부족합니다.");
  }
  return membership;
}

export async function resolveApiKeyAgency(
  ctx: QueryCtx | MutationCtx,
  bearer: string,
): Promise<{ agency: Doc<"agencies">; keyId: Id<"agencyApiKeys"> } | null> {
  const token = bearer.trim();
  if (!token.startsWith("cp_live_")) return null;
  const keyHash = await sha256Hex(token);
  const row = await ctx.db
    .query("agencyApiKeys")
    .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
    .unique();
  if (!row || row.revoked) return null;
  const agency = await ctx.db.get(row.agencyId);
  if (!agency) return null;
  return { agency, keyId: row._id };
}

/** 본인 소유이거나, agencyClient에 속한 에이전시 멤버면 접근 가능. */
export async function canAccessClientScoped(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  ownerUserId: Id<"users">,
  agencyClientId: Id<"agencyClients"> | undefined,
): Promise<boolean> {
  if (ownerUserId === userId) return true;
  if (!agencyClientId) return false;
  const client = await ctx.db.get(agencyClientId);
  if (!client) return false;
  const membership = await getMembership(ctx, client.agencyId, userId);
  return membership !== null;
}
