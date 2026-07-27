/**
 * BYOK 회신 분류 폴백(S11) — 프롬프트·PII 마스킹·응답 파서. 순수 TS라 키 없이 테스트된다.
 * 실호출은 aiActions.ts("use node")에서만 한다.
 *
 * 이 모듈은 규칙 분류기(`replyClassifier.classifyReply`)가 **아무 신호도 잡지 못한 회신에
 * 한해서만** 쓰인다. 규칙이 잡은 회신까지 LLM에 태우면 (a) 같은 입력이 매번 같은 결과를
 * 내는 결정적 동작이 깨지고, (b) 회신 1건마다 사용자 키로 호출 비용이 나간다.
 *
 * 최종 판정은 이 모듈이 아니라 서버(`replies.applyAiClassification`)가 한다 — 여기서 만든
 * 결과는 어디까지나 "제안"이며, 키워드 우선·억제 등록은 DB 트랜잭션 안에서 강제된다.
 */

import { parseJsonObject } from "./anthropicEnhance";
import {
  classifyQuestionSubtype,
  classifyReply,
  type ClassifyResult,
  type QuestionSubtype,
  type ReplyType,
} from "./replyClassifier";

/** 스키마 `replyTypeValidator`와 동일한 7유형. 이 밖의 값은 LLM이 뭐라 하든 버린다. */
export const REPLY_TYPES: readonly ReplyType[] = [
  "interview",
  "materials",
  "question",
  "published",
  "hold",
  "unsubscribe",
  "complaint",
] as const;

/**
 * 유형별 한국어 표시명. `replyClassifier`의 RULES는 모듈 밖으로 나오지 않으므로
 * 사용자 안내 문구에 필요한 최소본만 여기 둔다.
 */
export const REPLY_TYPE_LABELS: Record<ReplyType, string> = {
  interview: "인터뷰 요청",
  materials: "자료 요청",
  question: "확인 질문",
  published: "게재 통보",
  hold: "보류/거절",
  unsubscribe: "수신거부",
  complaint: "부정/컴플레인",
};

export const QUESTION_SUBTYPES: readonly QuestionSubtype[] = [
  "numbers",
  "competitor",
  "intent",
  "roadmap",
  "negative",
] as const;

export function isReplyType(value: unknown): value is ReplyType {
  return typeof value === "string" && (REPLY_TYPES as readonly string[]).includes(value);
}

export function isQuestionSubtype(value: unknown): value is QuestionSubtype {
  return (
    typeof value === "string" && (QUESTION_SUBTYPES as readonly string[]).includes(value)
  );
}

/* ── PII 마스킹 ─────────────────────────────────────────────── */

/** `packSync.maskEmailsInText`와 동일 패턴 — 마스킹 대상 정의를 두 곳에서 다르게 두지 않는다. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * 한국 휴대폰·유선번호(+82 국가번호 포함).
 * 앞뒤 숫자 경계를 둬서 회신에 흔한 매출·조회수 같은 긴 수치를 전화번호로 오인하지 않는다.
 */
const PHONE_RE = /(?<![0-9])(?:\+?82[-.\s]?|0)\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?![0-9])/g;

export const EMAIL_PLACEHOLDER = "[이메일]";
export const PHONE_PLACEHOLDER = "[전화번호]";

/** LLM 입력 상한. 회신 서명·인용 꼬리가 길어도 분류 판단에는 앞부분이면 충분하다(비용 상한). */
export const REPLY_LLM_INPUT_MAX_CHARS = 2000;

/**
 * 회신 원문 → LLM 입력용 마스킹.
 *
 * 이메일 패턴은 `packSync.maskEmailsInText` 선례를 따르되, 그쪽처럼 앞 2글자·도메인을 남기지
 * 않고 통째로 자리표시자로 바꾼다. packSync의 마스킹 결과는 운영자가 보는 동기화 오류 로그라
 * 도메인 단서가 디버깅에 필요하지만, **여기 출력은 외부 LLM 제공자에게 전송**되고 매체 도메인
 * 하나만으로도 기자가 좁혀진다. 게다가 이메일·전화는 7유형 판단에 아무 정보도 주지 않는다.
 */
export function maskReplyForLlm(text: string): string {
  return text
    .replace(EMAIL_RE, EMAIL_PLACEHOLDER)
    .replace(PHONE_RE, PHONE_PLACEHOLDER)
    .slice(0, REPLY_LLM_INPUT_MAX_CHARS);
}

/* ── 프롬프트 ───────────────────────────────────────────────── */

/**
 * 규칙이 놓친 회신만 들어오므로 신호어가 없는 완곡한 문장이 대부분이다.
 * 그래서 "애매하면 question"을 명시한다 — 규칙 기본값과 같은 안전한 착지점이다.
 */
export function replyClassifySystemPrompt(): string {
  return [
    "당신은 한국 기업 홍보 담당자의 기자 회신 분류 보조기다. 회신 1건을 아래 7유형 중 하나로 분류한다.",
    "- interview: 인터뷰·통화·미팅·취재 일정을 요청",
    "- materials: 이미지·원본 파일·추가 자료를 요청",
    "- question: 사실·수치·배경을 확인하는 질문",
    "- published: 기사 게재·송고를 알림",
    "- hold: 이번에는 다루기 어렵다는 보류·거절",
    "- unsubscribe: 앞으로 메일을 보내지 말라는 요청",
    "- complaint: 사실관계 오류 지적·항의",
    "",
    "규칙:",
    "1) 입력은 키워드 규칙이 아무 신호도 잡지 못한 회신이다. 완곡하거나 애매하면 question으로 답한다.",
    `2) 입력의 ${EMAIL_PLACEHOLDER}·${PHONE_PLACEHOLDER}는 개인정보를 지운 자리표시자다. 무엇이었는지 추측하지 않는다.`,
    "3) 본문에 없는 사실을 상상해 유형을 만들지 않는다. 근거는 본문 표현에서만 찾는다.",
    "4) type이 question이면 questionSubtype을 numbers|competitor|intent|roadmap|negative 중 하나로 함께 답한다.",
    '5) JSON만 출력: {"type":"...","questionSubtype":"...","reason":"근거 한 문장"}',
  ].join("\n");
}

export function replyClassifyUserPrompt(maskedBody: string): string {
  return ["기자 회신 본문:", maskedBody].join("\n");
}

/* ── 응답 파싱·병합 ─────────────────────────────────────────── */

export interface LlmReplyClassification {
  type: ReplyType;
  questionSubtype?: QuestionSubtype;
  /** 모델이 밝힌 근거 — 사용자에게 "왜 이렇게 분류됐는지" 보여주는 용도로만 쓴다. */
  reason?: string;
}

/**
 * 모델 응답 → 분류 제안. 7유형 밖이거나 JSON이 아니면 null.
 * null은 "LLM 결과를 쓰지 않는다"는 뜻이고, 호출부는 규칙 결과를 그대로 유지해야 한다.
 */
export function parseReplyClassification(raw: string): LlmReplyClassification | null {
  const obj = parseJsonObject(raw);
  if (!obj) return null;
  if (!isReplyType(obj.type)) return null;
  const questionSubtype = isQuestionSubtype(obj.questionSubtype)
    ? obj.questionSubtype
    : undefined;
  const reasonText = typeof obj.reason === "string" ? obj.reason.trim().slice(0, 200) : "";
  return {
    type: obj.type,
    ...(questionSubtype ? { questionSubtype } : {}),
    ...(reasonText ? { reason: reasonText } : {}),
  };
}

export interface ResolvedReplyClassification {
  type: ReplyType;
  questionSubtype?: QuestionSubtype;
  needsEscalation?: boolean;
  /** 무엇이 최종 판정했는지 — 규칙이 잡았거나 제안을 버렸으면 "rule" */
  source: "rule" | "llm";
}

/** 규칙이 아무 신호도 못 잡았을 때만 LLM을 부른다(결정적 동작 보존 + 호출 비용). */
export function needsLlmFallback(result: ClassifyResult): boolean {
  return result.matched === undefined;
}

function toResolved(result: ClassifyResult): ResolvedReplyClassification {
  return {
    type: result.type,
    ...(result.questionSubtype ? { questionSubtype: result.questionSubtype } : {}),
    ...(result.needsEscalation ? { needsEscalation: true } : {}),
    source: "rule",
  };
}

/**
 * 규칙 결과 + LLM 제안 → 최종 분류.
 *
 * 컴플라이언스 ①: 키워드가 잡힌 회신은 **제안을 읽지도 않고** 규칙 결과를 쓴다. 수신거부
 *   키워드가 걸렸는데 모델이 "hold"라고 우기는 상황을 코드 구조 자체로 불가능하게 만든다.
 * 컴플라이언스 ②: 반대 방향(규칙 미매칭 + 모델이 unsubscribe)은 허용한다 — 그게 이 폴백의
 *   목적이고, 억제 리스트 등록은 호출부(서버 뮤테이션)가 유형만 보고 강제하므로 안전하다.
 * 컴플라이언스 ③: 제안이 null(파싱 실패·7유형 밖)이면 규칙 결과로 되돌아간다.
 */
export function resolveReplyClassification(
  rawBody: string,
  proposal: LlmReplyClassification | null,
): ResolvedReplyClassification {
  const rule = classifyReply(rawBody);
  if (!needsLlmFallback(rule) || !proposal) return toResolved(rule);

  if (proposal.type !== "question") {
    return {
      type: proposal.type,
      // 컴플레인은 규칙 경로와 동일하게 항상 담당자 확인 대상이다.
      ...(proposal.type === "complaint" ? { needsEscalation: true } : {}),
      source: "llm",
    };
  }

  // 모델이 하위 유형을 빠뜨리면 키워드 기반 하위 분류로 메운다 — 규칙 경로와 같은 결과가 되도록.
  const questionSubtype = proposal.questionSubtype ?? classifyQuestionSubtype(rawBody);
  return {
    type: "question",
    ...(questionSubtype ? { questionSubtype } : {}),
    ...(questionSubtype === "negative" ? { needsEscalation: true } : {}),
    source: "llm",
  };
}
