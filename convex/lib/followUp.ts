/**
 * 팔로업(무회신 재접촉) 초안 — 순수 로직.
 *
 * ⚠️ 이 규칙은 **팩 근거가 없는 자체 표준**이다(오픈크랩 PR 팩에 팔로업 간격·시간대
 *    데이터가 없다). 그래서 "권장"으로만 제시하고, 서버가 강제하는 것은 두 가지뿐이다:
 *      ① 최소 간격 — 쿨다운과 같은 7일
 *      ② 새 정보 필수 — 같은 내용을 다시 보내는 것은 스팸이다
 *
 * 발송 자체의 게이트(수신거부·쿨다운·표현 규정·상한)는 팔로업도 예외 없이
 * `finalizeCampaignSend`를 통과한다.
 */

import { COOLDOWN_DAYS } from "./sendGuard";
import { textSimilarity } from "./textSimilarity";

export const FOLLOW_UP_MIN_DAYS = COOLDOWN_DAYS;

/** 팔로업 가능 여부 판정 결과. */
export interface FollowUpEligibility {
  eligible: boolean;
  reason?: string;
  daysSinceSent?: number;
}

export function checkFollowUpEligibility(
  sentAt: number | undefined,
  hasReply: boolean,
  now: number,
): FollowUpEligibility {
  if (sentAt === undefined) {
    return { eligible: false, reason: "아직 발송되지 않은 초안입니다." };
  }
  if (hasReply) {
    return { eligible: false, reason: "이미 회신을 받은 기자입니다. 회신 스레드에서 이어가세요." };
  }
  const days = Math.floor((now - sentAt) / (24 * 60 * 60 * 1000));
  if (days < FOLLOW_UP_MIN_DAYS) {
    return {
      eligible: false,
      reason: `발송 후 ${days}일 — ${FOLLOW_UP_MIN_DAYS}일은 기다립니다.`,
      daysSinceSent: days,
    };
  }
  return { eligible: true, daysSinceSent: days };
}

/* ── 복붙 검증 ──────────────────────────────────────────────── */

/** 두 본문의 유사도(0~1) — 척도 정의는 `textSimilarity`가 단일 소스다. */
export function bodySimilarity(a: string, b: string): number {
  return textSimilarity(a, b);
}

/**
 * 복붙으로 간주하는 임계값.
 * 팔로업은 인사·서명·수신거부 문구를 원본과 공유하므로 어느 정도 겹치는 게 정상이다.
 * 0.7을 넘으면 "새 정보를 담았다"고 보기 어렵다.
 */
export const COPY_PASTE_THRESHOLD = 0.7;

export function isCopyPaste(original: string, followUp: string): boolean {
  return bodySimilarity(original, followUp) >= COPY_PASTE_THRESHOLD;
}

/* ── 초안 생성 ──────────────────────────────────────────────── */

const OPT_OUT =
  "본 메일 수신을 원치 않으시면 회신으로 '수신거부'라 남겨주세요. 즉시 명단에서 제외하겠습니다.";

export interface FollowUpInput {
  senderName: string;
  companyName: string;
  /** 원본 메일 제목 — 같은 건임을 알 수 있게 참조만 한다 */
  originalSubject: string;
  /** 지난 발송 이후 생긴 **새 정보**. 없으면 팔로업하지 않는다. */
  newsUpdate: string;
  daysSinceSent: number;
  /** 매체 유형별 행동 요청 1개 */
  cta: string;
  links?: string[];
}

/**
 * 팔로업 본문.
 * 원본을 되풀이하지 않고 **새 정보 한 덩어리 + 행동 요청 1개**로 짧게 간다.
 * 재촉하는 인상을 주지 않도록 "지난 메일을 못 보셨을 수도" 같은 표현은 쓰지 않는다.
 */
export function buildFollowUpDraft(input: FollowUpInput): { subject: string; body: string } {
  const subject = `[${input.companyName}] ${truncate(input.originalSubject.replace(/^\[[^\]]*\]\s*/, ""), 18)} — 새 소식`;

  const linkBlock =
    input.links && input.links.length ? input.links.map((l) => `· ${l}`).join("\n") : "";

  const body = [
    `기자님, 안녕하세요. ${input.companyName} ${input.senderName}입니다.`,
    `${input.daysSinceSent}일 전 보내드린 '${truncate(input.originalSubject, 24)}' 건에 새로 확정된 내용이 있어 짧게 전해드립니다.`,
    "",
    input.newsUpdate,
    linkBlock,
    "",
    input.cta,
    "",
    `${input.senderName} 드림`,
    input.companyName,
    "",
    "──",
    OPT_OUT,
  ]
    .filter((line) => line !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { subject, body };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
