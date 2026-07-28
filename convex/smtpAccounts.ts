import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser } from "./model";
import { importMasterKey, sealSecret } from "./lib/secretBox";
import { detectSmtpProvider, smtpPresetById, type SmtpProviderId } from "./lib/smtpProviders";

/**
 * SMTP 발신 계정 — 저장·조회만 한다. **발송은 여기서 하지 않는다.**
 *
 * 발송은 `smtpActions.sendCampaign`이 `drafts.selectForExternalSend` →
 * `drafts.confirmExternalSent` 게이트를 통과해서 한다. 계정 파일에 확정 로직을
 * 두면 게이트를 우회하는 두 번째 경로가 생긴다(gmailAccounts에서 실제로 그랬다).
 *
 * ⚠️ 비밀번호는 봉인해서 저장하고, 클라이언트로 나가는 쿼리에는 **어떤 형태로도**
 *    포함하지 않는다. 마스킹된 별표조차 내보내지 않는다 — 길이도 정보다.
 */

const providerValidator = v.union(
  v.literal("gmail"),
  v.literal("naver"),
  v.literal("daum"),
  v.literal("outlook"),
  v.literal("custom"),
);

/** 봉인에 쓸 마스터 키. 없으면 저장 자체를 막는다 — 평문으로 흘려보내지 않는다. */
async function masterKey() {
  return importMasterKey(process.env.SMTP_ENCRYPTION_KEY ?? "");
}

function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("올바른 이메일 주소가 아닙니다.");
  }
  return email;
}

/**
 * 설정 화면용 연결 상태.
 *
 * `lastStatus`를 함께 준다 — 저장됐다는 것과 실제로 붙는다는 것은 다르다.
 * 저장만 하고 "연결됨"이라고 단정하면 사용자는 발송이 실패할 때까지 모른다.
 */
export const getConnection = query({
  args: {},
  returns: v.union(
    v.object({
      connected: v.literal(true),
      email: v.string(),
      fromName: v.optional(v.string()),
      provider: providerValidator,
      providerLabel: v.string(),
      host: v.string(),
      port: v.number(),
      secure: v.boolean(),
      username: v.optional(v.string()),
      lastStatus: v.optional(v.union(v.literal("ok"), v.literal("error"))),
      lastError: v.optional(v.string()),
      lastCheckedAt: v.optional(v.number()),
      lastUsedAt: v.optional(v.number()),
    }),
    v.object({ connected: v.literal(false) }),
  ),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("smtpAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return { connected: false as const };
    return {
      connected: true as const,
      email: account.email,
      fromName: account.fromName,
      provider: account.provider,
      providerLabel: smtpPresetById(account.provider).label,
      host: account.host,
      port: account.port,
      secure: account.secure,
      username: account.username,
      lastStatus: account.lastStatus,
      lastError: account.lastError,
      lastCheckedAt: account.lastCheckedAt,
      lastUsedAt: account.lastUsedAt,
    };
  },
});

/**
 * 계정 저장(신규·수정 공통).
 *
 * 서버 접속 정보는 **이메일 도메인으로 판별**한다. 사용자가 host·port를 몰라도 되게
 * 하는 것이 이 기능의 목적이므로, 명시적으로 넘어온 값이 있을 때만 그것을 쓴다.
 *
 * 비밀번호는 수정 시 생략할 수 있다 — 표시명만 바꾸려고 앱 비밀번호를 다시 발급받게
 * 하면 안 된다. 다만 **신규 저장에는 반드시 필요하다.**
 */
export const saveAccount = mutation({
  args: {
    email: v.string(),
    password: v.optional(v.string()),
    fromName: v.optional(v.string()),
    // 아래는 자동 판별이 틀렸을 때만 채운다(회사 메일 등).
    provider: v.optional(providerValidator),
    host: v.optional(v.string()),
    port: v.optional(v.number()),
    secure: v.optional(v.boolean()),
    username: v.optional(v.string()),
  },
  returns: v.object({ provider: providerValidator, host: v.string(), port: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const email = normalizeEmail(args.email);

    const existing = await ctx.db
      .query("smtpAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const password = args.password?.trim();
    if (!password && !existing) {
      throw new Error("비밀번호를 입력하세요.");
    }
    // 봉인 실패(=마스터 키 미설정)면 여기서 멈춘다. 평문으로 대체 저장하지 않는다.
    const passwordSealed = password
      ? await sealSecret(password, await masterKey())
      : existing!.passwordSealed;

    // 자동 판별 → 명시값이 있으면 덮어쓴다.
    const detected = detectSmtpProvider(email);
    const provider: SmtpProviderId = args.provider ?? detected.id;
    const preset = args.provider ? smtpPresetById(args.provider) : detected;
    const host = (args.host ?? preset.host).trim();
    const port = args.port ?? preset.port;
    const secure = args.secure ?? preset.secure;

    if (!host) {
      throw new Error("SMTP 서버 주소를 입력하세요. 회사 메일은 자동으로 알아내지 못합니다.");
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("포트 번호가 올바르지 않습니다.");
    }

    const fields = {
      email,
      fromName: args.fromName?.trim() || undefined,
      provider,
      host,
      port,
      secure,
      username: args.username?.trim() || undefined,
      passwordSealed,
      updatedAt: Date.now(),
      // 접속 정보가 바뀌었으므로 이전 테스트 결과는 더 이상 유효하지 않다.
      lastStatus: undefined,
      lastError: undefined,
      lastCheckedAt: undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("smtpAccounts", {
        userId,
        ...fields,
        createdAt: Date.now(),
      });
    }
    return { provider, host, port };
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("smtpAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (account) await ctx.db.delete(account._id);
    return null;
  },
});

/**
 * 발송·연결 테스트용 내부 조회 — **봉인된** 비밀번호를 준다.
 * 복호화는 실제로 SMTP에 접속하는 액션에서만 한다.
 */
export const getAccountInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("smtpAccounts"),
      email: v.string(),
      fromName: v.optional(v.string()),
      provider: providerValidator,
      host: v.string(),
      port: v.number(),
      secure: v.boolean(),
      username: v.optional(v.string()),
      passwordSealed: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const a = await ctx.db
      .query("smtpAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!a) return null;
    return {
      _id: a._id,
      email: a.email,
      fromName: a.fromName,
      provider: a.provider,
      host: a.host,
      port: a.port,
      secure: a.secure,
      username: a.username,
      passwordSealed: a.passwordSealed,
    };
  },
});

/**
 * 연결 테스트·발송 결과 기록.
 *
 * 실패 원문이 아니라 **번역된 문구**를 받는다. `EAUTH`를 그대로 저장해 두면
 * 설정 화면이 사용자에게 할 일을 알려 주지 못한다.
 */
export const recordCheck = internalMutation({
  args: {
    accountId: v.id("smtpAccounts"),
    ok: v.boolean(),
    error: v.optional(v.string()),
    used: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { accountId, ok, error, used }) => {
    await ctx.db.patch(accountId, {
      lastStatus: ok ? ("ok" as const) : ("error" as const),
      lastError: ok ? undefined : error,
      lastCheckedAt: Date.now(),
      ...(used && ok ? { lastUsedAt: Date.now() } : {}),
    });
    return null;
  },
});
