import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./model";
import { resolveOpenCrabTransport } from "./lib/opencrabClient";

/**
 * 서버 환경변수 배선 상태(불리언만 — 시크릿 값 미노출).
 * 설정 화면·배포 검증용.
 */
export const getStatus = query({
  args: {},
  returns: v.object({
    opencrabConfigured: v.boolean(),
    opencrabTransport: v.union(v.literal("http"), v.literal("mcp"), v.literal("none")),
    gmailOAuthConfigured: v.boolean(),
    gmailOAuthSource: v.union(v.literal("gmail"), v.literal("auth"), v.literal("none")),
    anthropicConfigured: v.boolean(),
    siteUrlSet: v.boolean(),
    /**
     * 자격증명 봉인용 마스터 키.
     *
     * SMTP 비밀번호 **와 BYOK AI API 키**를 모두 이 키로 봉인한다. 없으면 두 저장 모두
     * 실패하므로 설정 화면에서 미리 보여 준다.
     */
    smtpEncryptionKeySet: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireUser(ctx);

    const ocUrl = process.env.OPENCRAB_API_URL?.trim() ?? "";
    const ocKey = process.env.OPENCRAB_API_KEY?.trim() ?? "";
    const opencrabConfigured = Boolean(ocUrl && ocKey);
    let opencrabTransport: "http" | "mcp" | "none" = "none";
    if (opencrabConfigured) {
      opencrabTransport = resolveOpenCrabTransport(ocUrl, ocKey).mode;
    }

    const gmailId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
    const gmailSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
    const authId = process.env.AUTH_GOOGLE_ID?.trim();
    const authSecret = process.env.AUTH_GOOGLE_SECRET?.trim();
    let gmailOAuthSource: "gmail" | "auth" | "none" = "none";
    if (gmailId && gmailSecret) gmailOAuthSource = "gmail";
    else if (authId && authSecret) gmailOAuthSource = "auth";

    return {
      opencrabConfigured,
      opencrabTransport,
      gmailOAuthConfigured: gmailOAuthSource !== "none",
      gmailOAuthSource,
      anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      siteUrlSet: Boolean(process.env.SITE_URL?.trim()),
      // 값이 아니라 존재 여부만. 길이가 맞는지는 실제 저장 시점에 검증한다.
      smtpEncryptionKeySet: Boolean(process.env.SMTP_ENCRYPTION_KEY?.trim()),
    };
  },
});
