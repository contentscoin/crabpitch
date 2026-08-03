"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { personalizeForSend } from "./lib/emailTemplate";
import { pilotGateMessage } from "./lib/pilotGate";
import { openSecret, importMasterKey } from "./lib/secretBox";
import { explainSmtpError, type SmtpProviderId } from "./lib/smtpProviders";
import { excludedSummary, fromHeader } from "./lib/sendOutcome";

/**
 * SMTP 직접 발송 — Gmail OAuth를 쓸 수 없는 사용자의 발송 경로.
 *
 * ⚠️ 이 경로도 Gmail 경로와 **같은 게이트**를 통과한다
 *    (`drafts.selectForExternalSend` → `drafts.confirmExternalSent`).
 *    전송 수단이 다를 뿐 규칙은 하나다. 여기에 선별·확정을 따로 두면 파일럿 승인·
 *    수신거부·쿨다운·표현 규정·상한이 통째로 새는 두 번째 경로가 된다.
 *
 * ⚠️ Gmail과 결정적으로 다른 점: **되돌릴 수 없다.** Gmail 경로는 초안까지만 만들고
 *    사용자가 Gmail에서 최종 발송하지만, 여기서는 즉시 상대 메일함으로 나간다.
 */

type SmtpSendResult = {
  sent: number;
  failed: number;
  mode: "smtp";
  message?: string;
};

type SmtpAccount = {
  _id: Id<"smtpAccounts">;
  email: string;
  fromName?: string;
  provider: SmtpProviderId;
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  passwordSealed: string;
};

async function openTransport(account: SmtpAccount) {
  const key = await importMasterKey(process.env.SMTP_ENCRYPTION_KEY ?? "");
  const password = await openSecret(account.passwordSealed, key);
  return nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.username ?? account.email, pass: password },
    // 한 연결로 순차 발송한다. 동시에 여러 연결을 열면 제공자가 스팸으로 본다.
    pool: true,
    maxConnections: 1,
    // 기본값(무제한 대기)이면 방화벽에 막혔을 때 액션이 끝까지 매달린다.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** nodemailer 오류에서 사용자에게 보여줄 실마리를 뽑는다. */
function rawErrorText(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    const response = (err as { response?: string }).response;
    return [code, err.message, response].filter(Boolean).join(" ");
  }
  return String(err);
}

/**
 * 인증·연결 단계 실패는 이어지는 수신자에게도 똑같이 실패한다.
 * 50명에게 50번 같은 오류를 내는 대신 첫 건에서 멈춘다.
 */
function isFatal(raw: string): boolean {
  const e = raw.toUpperCase();
  return (
    e.includes("EAUTH") ||
    e.includes("ECONNREFUSED") ||
    e.includes("ENOTFOUND") ||
    e.includes("ETIMEDOUT") ||
    e.includes("ESOCKET") ||
    e.includes("535")
  );
}

/**
 * 연결 테스트 — **메일을 보내지 않는다.** 인증까지만 확인한다.
 *
 * 저장됐다는 것과 실제로 붙는다는 것은 다르다. 테스트 없이 "연결됨"이라고 표시하면
 * 사용자는 캠페인 발송이 실패할 때까지 잘못된 설정을 모른다.
 */
export const testConnection = action({
  args: {},
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx): Promise<{ ok: boolean; message: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");
    const account = await ctx.runQuery(internal.smtpAccounts.getAccountInternal, { userId });
    if (!account) throw new Error("메일 계정이 설정되지 않았습니다.");

    try {
      const transport = await openTransport(account);
      await transport.verify();
      transport.close();
      await ctx.runMutation(internal.smtpAccounts.recordCheck, {
        accountId: account._id,
        ok: true,
      });
      return { ok: true, message: `${account.email} 로 발송할 준비가 됐습니다.` };
    } catch (err) {
      const message = explainSmtpError(rawErrorText(err), account.provider);
      // 실패도 기록한다 — 설정 화면이 "연결됨"으로 남아 있으면 안 된다.
      await ctx.runMutation(internal.smtpAccounts.recordCheck, {
        accountId: account._id,
        ok: false,
        error: message,
      });
      return { ok: false, message };
    }
  },
});

/**
 * 승인 게이트 통과분을 SMTP로 발송한다.
 *
 * 선별 → 발송 → 확정 3단계. 외부 호출이 중간에 있어 한 트랜잭션에 담을 수 없다.
 * 실패한 건은 **확정하지 않는다** — 초안으로 남아 사용자가 다시 보낼 수 있다.
 */
export const sendCampaign = action({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }): Promise<SmtpSendResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");
    return await sendCampaignForUser(ctx, campaignId, userId);
  },
});

/**
 * 예약 실행용 — 인증 컨텍스트 없이 userId를 받아 같은 본문을 수행한다.
 *
 * 스케줄러 실행 시점에는 `getAuthUserId`가 쓸 수 없으므로 public action을 그대로
 * 예약할 수 없다. 발송 로직을 복제하면 게이트가 한쪽에서만 갱신되므로,
 * 본문은 `sendCampaignForUser` 하나만 두고 진입점만 셋으로 나눈다
 * (화면 즉시 발송 · 예약 실행 · MCP).
 *
 * ⚠️ 실패를 throw로 끝내지 않는다 — 예약 실행 시점에는 사용자가 화면에 없어서
 *    아무도 그 예외를 보지 못한다. 사유를 캠페인에 남긴다.
 *
 * ⚠️ MCP 발송은 이것이 아니라 `sendCampaignForMcp`다. 이름이 비슷하지만 하는 일이
 *    다르다 — 이쪽은 **예약 잡을 클레임**하고 결과를 캠페인에 기록한다. MCP가 이걸
 *    부르면 예약도 없는데 클레임에 실패해 아무것도 보내지 않고 조용히 끝난다.
 */
export const sendCampaignInternal = internalAction({
  args: {
    campaignId: v.id("campaigns"),
    userId: v.id("users"),
    scheduledSendAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, userId, scheduledSendAt }) => {
    // 클레임에 실패하면 이 잡은 무효다 — 이미 다른 경로가 실행 중이거나, 즉시 발송으로
    // 앞질렀거나, 시각을 바꿔 재예약했거나, 취소됐다. 아무것도 하지 않는다.
    const claimed = await ctx.runMutation(internal.drafts.claimScheduledSend, {
      campaignId,
      userId,
      scheduledSendAt,
    });
    if (claimed !== "smtp") return null;

    try {
      await sendCampaignForUser(ctx, campaignId, userId);
    } catch (e) {
      await ctx.runMutation(internal.drafts.recordScheduledSendFailure, {
        campaignId,
        userId,
        error: e instanceof Error ? e.message : "예약 발송 실패",
      });
    }
    return null;
  },
});

/**
 * 발송 본문 — **화면·예약·MCP가 공유하는 단일 구현.**
 *
 * 경로마다 사본을 두면 파일럿 승인·수신거부·쿨다운·표현 규정·월 한도가 한쪽에서만
 * 걸린다. 진입점은 인증 방식만 다르고, 여기서부터는 같은 길을 간다.
 */
async function sendCampaignForUser(
  ctx: ActionCtx,
  campaignId: Id<"campaigns">,
  userId: Id<"users">,
): Promise<SmtpSendResult> {
  {
    const account = await ctx.runQuery(internal.smtpAccounts.getAccountInternal, { userId });
    if (!account) {
      throw new Error("메일 계정이 설정되지 않았습니다. 설정에서 발신 메일을 먼저 연결하세요.");
    }

    // ① 선별 — Gmail 경로와 **같은 게이트**(파일럿 승인·수신거부 재대조·7일 쿨다운·
    //    표현 규정·캠페인당 상한·월 한도). 제외분은 사유를 남긴 채 초안으로 남는다.
    const { drafts: pending, counts, queuedTotal, attachment } = await ctx.runMutation(
      internal.drafts.selectForExternalSend,
      { campaignId, userId },
    );

    // 파일럿 보류는 "제외"가 아니라 사용자가 할 일이 있는 상태다 — 조용히 0건으로 끝내지 않는다.
    if (counts.blockedPilot) throw new Error(pilotGateMessage(queuedTotal));
    if (pending.length === 0) {
      return {
        sent: 0,
        failed: 0,
        mode: "smtp",
        message: `발송할 수 있는 건이 없습니다.${excludedSummary(counts)}`,
      };
    }

    // ② 외부 호출 — 여기서 실패한 건은 확정하지 않으므로 초안으로 남는다.
    const transport = await openTransport(account);
    const from = fromHeader(account.email, account.fromName);
    const updates: Array<{ draftId: Id<"emailDrafts"> }> = [];
    let fatal: string | null = null;

    try {
      for (const d of pending) {
        try {
          await transport.sendMail({
            from,
            to: d.journalistEmail,
            subject: d.subject,
            text: personalizeForSend(d.body, d.journalistName),
            // 보도자료 전문 — 본문은 판단할 근거만 주고 실체는 이 파일이 맡는다.
            // 수신자마다 같은 파일이라 선별 단계에서 한 번 만들어 돌려 쓴다.
            ...(attachment
              ? {
                  attachments: [
                    {
                      filename: attachment.filename,
                      content: attachment.text,
                      contentType: "text/plain; charset=utf-8",
                    },
                  ],
                }
              : {}),
          });
          updates.push({ draftId: d.draftId });
        } catch (err) {
          const raw = rawErrorText(err);
          if (isFatal(raw)) {
            // 계정 문제다. 남은 수신자에게 같은 실패를 반복하지 않는다.
            fatal = explainSmtpError(raw, account.provider);
            break;
          }
          // 수신자 하나가 거부된 경우 — 나머지는 계속 보낸다.
        }
      }
    } finally {
      transport.close();
    }

    // ③ 확정 — 실제로 나간 것만. 사용량도 이 건수만큼만 올라간다.
    const sent: number = await ctx.runMutation(internal.drafts.confirmExternalSent, {
      campaignId,
      userId,
      updates,
    });
    const failed = pending.length - sent;

    await ctx.runMutation(internal.smtpAccounts.recordCheck, {
      accountId: account._id,
      ok: fatal === null,
      error: fatal ?? undefined,
      used: sent > 0,
    });

    if (fatal && sent === 0) {
      // 한 통도 못 나갔고 원인이 계정이면, 숫자만 돌려주면 사용자는 이유를 모른다.
      throw new Error(fatal);
    }

    const failNote = failed > 0 ? ` 실패 ${failed}건은 초안으로 남았습니다.` : "";
    const fatalNote = fatal ? ` 중단 사유: ${fatal}` : "";
    return {
      sent,
      failed,
      mode: "smtp",
      message: `${account.email} 에서 ${sent}건을 발송했습니다.${failNote}${fatalNote}${excludedSummary(counts)}`,
    };
  }
}

/**
 * MCP 발송 — **웹앱과 같은 함수**를 부른다.
 *
 * ⚠️ MCP용 발송 경로를 따로 만들면 게이트가 하나 더 생긴다. 여기서는 사용자 확인만
 *    한 겹 더 얹고(도구 쪽 `confirm` 인자), 실제 발송은 위와 동일한 경로로 간다.
 *
 * ⚠️ 예약 실행용 `sendCampaignInternal`과 다르다. 이쪽은 사용자가 채팅에서 "지금
 *    보내"라고 한 것이므로 클레임 없이 즉시 보내고 결과를 그대로 돌려준다.
 */
export const sendCampaignForMcp = internalAction({
  args: { userId: v.id("users"), campaignId: v.id("campaigns") },
  handler: async (ctx, { userId, campaignId }): Promise<SmtpSendResult> =>
    sendCampaignForUser(ctx, campaignId, userId),
});
