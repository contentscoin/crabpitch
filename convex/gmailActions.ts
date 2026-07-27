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

/** 설정 화면: Gmail 연결 OAuth URL 발급. */
export const getConnectUrl = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");
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

    const { clientId, clientSecret } = requireGmailOAuthEnv();
    const account = await ctx.runQuery(internal.gmailAccounts.getAccountInternal, { userId });
    if (!account) {
      throw new Error("Gmail이 연결되지 않았습니다. 설정에서 Google 계정을 연결하세요.");
    }

    const pending = await ctx.runQuery(internal.gmailAccounts.listPendingDraftsInternal, {
      campaignId,
      userId,
    });
    if (pending.length === 0) {
      return { sent: 0, mode: "gmail_drafts", message: "발송할 초안이 없습니다." };
    }

    // 파일럿 게이트 — Gmail 연결 사용자에게는 이 경로가 기본이라 여기서도 반드시 막는다.
    const pilot = await ctx.runQuery(internal.drafts.pilotGateStatus, { campaignId, userId });
    if (pilot.needsApproval) throw new Error(pilotGateMessage(pilot.total));

    const accessToken = await refreshAccessToken(ctx, account, clientId, clientSecret);
    const labelId = await ensureLabelId(accessToken, GMAIL_PR_LABEL);

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

    const sent: number = await ctx.runMutation(internal.gmailAccounts.markDraftsSentWithGmail, {
      campaignId,
      updates,
      sendCount: updates.length,
      userId,
    });

    return {
      sent,
      mode: "gmail_drafts",
      message: `Gmail '${GMAIL_PR_LABEL}' 라벨에 초안 ${sent}건을 생성했습니다. Gmail에서 검토 후 발송하세요.`,
    };
  },
});
