import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getProfile } from "../model";
import { planAllowsMcp, type Plan } from "./plans";
import { sha256Hex } from "./agencyAuth";

export function generateMcpKey(): { raw: string; prefix: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const raw = `cp_mcp_${hex}`;
  return { raw, prefix: raw.slice(0, 16) };
}

export async function requireMcpPlan(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles">> {
  const profile = await getProfile(ctx, userId);
  if (!profile) throw new Error("프로필이 없습니다.");
  if (!planAllowsMcp(profile.plan as Plan)) {
    throw new Error(
      "내 AI 연결은 Solo·Growth·Agency에서만 사용할 수 있습니다. 설정에서 플랜을 바꿔 주세요.",
    );
  }
  return profile;
}

export async function resolveUserMcpKey(
  ctx: QueryCtx | MutationCtx,
  bearer: string,
): Promise<{
  userId: Id<"users">;
  keyId: Id<"userMcpKeys">;
  plan: Plan;
} | null> {
  const token = bearer.trim();
  if (!token.startsWith("cp_mcp_")) return null;
  const keyHash = await sha256Hex(token);
  const row = await ctx.db
    .query("userMcpKeys")
    .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
    .unique();
  if (!row || row.revoked) return null;
  const profile = await getProfile(ctx, row.userId);
  if (!profile || !planAllowsMcp(profile.plan as Plan)) return null;
  return {
    userId: row.userId,
    keyId: row._id,
    plan: profile.plan as Plan,
  };
}

/** Claude Desktop / Cursor mcp.json 스니펫 */
export function buildUserMcpSnippet(siteUrl: string, apiKey: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return JSON.stringify(
    {
      mcpServers: {
        crabpitch: {
          url: `${base}/api/mcp/${apiKey}`,
        },
      },
    },
    null,
    2,
  );
}
