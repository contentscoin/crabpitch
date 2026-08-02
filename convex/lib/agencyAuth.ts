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


/**
 * 캠페인 조회 축을 확정한다 — 클라이언트 축이면 그 id, 사용자 축이면 null.
 *
 * `profiles.activeClientId`가 **있어도** 클라이언트 축이라고 단정할 수 없다. 클라이언트
 * 문서가 삭제되거나 멤버십이 박탈되면(둘 다 `activeClientId`를 지우지 않는다) 조회는
 * 사용자 축으로 떨어진다.
 *
 * ⚠️ `campaigns.list`와 `onboarding.getMyChecklist`가 **반드시 같은 판정**을 써야 한다.
 *    각자 구현하면 "(이 클라이언트) n/3"이라고 적힌 진행률 아래에서 계정 전체 캠페인이
 *    계산된다 — 숫자가 틀리는 게 아니라 **무엇을 센 것인지가 라벨과 달라진다**.
 */
export async function resolveActiveClientScope(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  profile: Doc<"profiles"> | null,
): Promise<Id<"agencyClients"> | null> {
  if (!profile?.activeClientId) return null;
  const client = await ctx.db.get(profile.activeClientId);
  if (!client) return null;
  const membership = await getMembership(ctx, client.agencyId, userId);
  return membership ? profile.activeClientId : null;
}
