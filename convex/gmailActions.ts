"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { buildRawEmail, GMAIL_PR_LABEL, GMAIL_SCOPES } from "./lib/gmailMime";
import { personalizeForSend } from "./lib/emailTemplate";
import { pilotGateMessage } from "./lib/pilotGate";
import { requireGoogleOAuthClient } from "./lib/googleOAuthEnv";
// 제외 사유 문구는 SMTP 경로와 공유한다 — 게이트가 같은데 설명이 다르면 안 된다.
import { excludedSummary } from "./lib/sendOutcome";
import { gmailOAuthUpgradeMessage } from "./lib/plans";

function requireGmailOAuthEnv() {
  return requireGoogleOAuthClient();
}

function callbackUrl() {
  const base = process.env.CONVEX_SITE_URL?.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("CONVEX_SITE_URL 이 필요합니다 (Gmail OAuth 콜백).");
  }
  return `${base}/gmail/callback`;
}

type TokenAccount = {
  _id: Id<"gmailAccounts">;
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
};

type ActionRunner = {
  runMutation: (
    ref: typeof internal.gmailAccounts.patchTokens,
    args: {
      accountId: Id<"gmailAccounts">;
      accessToken: string;
      expiryDate?: number;
    },
  ) => Promise<null>;
};

/**
 * 설정 화면: Gmail 연결 OAuth URL 발급.
 *
 * ⚠️ Agency 전용이다. 화면에서 감추는 것과 별개로 여기서도 막는다 — 액션을 직접
 *    부르는 경로가 있고, 화면 조건은 클라이언트가 바꿀 수 있다.
 */
export const getConnectUrl = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");
    const access = await ctx.runQuery(internal.gmailAccounts.checkOAuthAccess, { userId });
    if (!access.allowed) throw new Error(gmailOAuthUpgradeMessage());
    const { clientId } = requireGmailOAuthEnv();
    const state = crypto.randomUUID();
    await ctx.runMutation(internal.gmailAccounts.createOauthState, { userId, state });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl(),
      response_type: "code",
      scope: GMAIL_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  },
});

async function refreshAccessToken(
  ctx: ActionRunner,
  account: TokenAccount,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (account.expiryDate && account.expiryDate > Date.now() + 60_000) {
    return account.accessToken;
  }
  if (!account.refreshToken) return account.accessToken;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Gmail 토큰 갱신 실패: ${res.status}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  const expiryDate = data.expires_in ? Date.now() + data.expires_in * 1000 : undefined;
  await ctx.runMutation(internal.gmailAccounts.patchTokens, {
    accountId: account._id,
    accessToken: data.access_token,
    expiryDate,
  });
  return data.access_token;
}

async function ensureLabelId(accessToken: string, labelName: string): Promise<string | null> {
  const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) return null;
  const list = (await listRes.json()) as { labels?: Array<{ id: string; name: string }> };
  const found = list.labels?.find((l) => l.name === labelName);
  if (found) return found.id;

  const createRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  if (!createRes.ok) return null;
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

async function createGmailDraft(
  accessToken: string,
  opts: { to: string; from: string; subject: string; body: string; labelId: string | null },
): Promise<string | null> {
  const raw = buildRawEmail({
    to: opts.to,
    from: opts.from,
    subject: opts.subject,
    body: opts.body,
  });
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: { raw, labelIds: opts.labelId ? [opts.labelId] : undefined },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail 초안 생성 실패: ${res.status} ${text.slice(0, 180)}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

/**
 * 승인 게이트 통과 후: Gmail `언론홍보` 라벨에 초안 생성 + sent 기록.
 * 실명·이메일은 이 시점에만 Gmail API로 전달한다.
 *
 * ⚠️ 이 경로도 다른 세 경로와 **같은 선별 게이트**를 통과한다. 외부 API 호출이 중간에
 *    끼어 있어 한 트랜잭션에 담을 수 없으므로 선별 → 호출 → 확정 3단계로 나눈다.
 */
export const pushCampaignToGmail = action({
  args: { campaignId: v.id("campaigns") },
  handler: async (
    ctx,
    { campaignId },
  ): Promise<{
    sent: number;
    mode: "gmail_drafts";
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    // ⚠️ 연결 시점이 아니라 **발송 시점**에 다시 묻는다. Agency에서 내려온 사용자의
    //    계정 문서는 그대로 남아 있어서, 연결 시점 검사만으로는 계속 발송된다.
    const access = await ctx.runQuery(internal.gmailAccounts.checkOAuthAccess, { userId });
    if (!access.allowed) throw new Error(gmailOAuthUpgradeMessage());

    const { clientId, clientSecret } = requireGmailOAuthEnv();
    const account = await ctx.runQuery(internal.gmailAccounts.getAccountInternal, { userId });
    if (!account) {
      throw new Error("Gmail이 연결되지 않았습니다. 설정에서 Google 계정을 연결하세요.");
    }

    // ① 선별 — 다른 세 경로와 **같은 게이트**를 통과한다(파일럿·수신거부·쿨다운·
    //    표현 규정·캠페인당 상한·월 한도). 제외분은 사유를 남긴 채 초안으로 남는다.
    const { drafts: pending, counts, queuedTotal } = await ctx.runMutation(
      internal.drafts.selectForExternalSend,
      { campaignId, userId },
    );

    // 파일럿 보류는 "제외"가 아니라 사용자가 할 일이 있는 상태다 — 조용히 0건으로 끝내지 않는다.
    if (counts.blockedPilot) throw new Error(pilotGateMessage(queuedTotal));
    if (pending.length === 0) {
      return {
        sent: 0,
        mode: "gmail_drafts",
        message: `초안을 만들 수 있는 건이 없습니다.${excludedSummary(counts)}`,
      };
    }

    const accessToken = await refreshAccessToken(ctx, account, clientId, clientSecret);
    const labelId = await ensureLabelId(accessToken, GMAIL_PR_LABEL);

    // ② 외부 호출 — 여기서 실패하면 초안은 그대로 남는다(확정 전이다).
    const updates: Array<{
      draftId: Id<"emailDrafts">;
      gmailDraftId?: string;
    }> = [];
    for (const d of pending) {
      const body = personalizeForSend(d.body, d.journalistName);
      const gmailDraftId = await createGmailDraft(accessToken, {
        to: d.journalistEmail,
        from: account.email,
        subject: d.subject,
        body,
        labelId,
      });
      updates.push({ draftId: d.draftId, gmailDraftId: gmailDraftId ?? undefined });
    }

    // ③ 확정 — 실제로 만들어진 것만. 사용량도 이 건수만큼만 올라간다.
    const sent: number = await ctx.runMutation(internal.drafts.confirmExternalSent, {
      campaignId,
      userId,
      updates,
    });

    return {
      sent,
      mode: "gmail_drafts",
      message: `Gmail '${GMAIL_PR_LABEL}' 라벨에 초안 ${sent}건을 생성했습니다. Gmail에서 검토 후 발송하세요.${excludedSummary(counts)}`,
    };
  },
});
