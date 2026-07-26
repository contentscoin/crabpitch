/**
 * Anthropic 개인화 — 프롬프트/응답 파싱 (순수 TS, 키 없이도 테스트 가능).
 * 실호출은 aiActions.ts ("use node") 에서만 수행.
 */

import { ctaLine, embargoLine, hasOptOut } from "./emailTemplate";
import { checkEmailCompliance } from "./emailCompliance";
import {
  CRABPITCH_FORM_BODY_CHARS,
  compactRulesForPrompt,
  WRITING_RULES,
} from "./pressGuide";
import { EMAIL_BODY_CHAR_MAX, EMAIL_BODY_CHAR_MIN } from "./emailCompliance";
import type { OutletCategory } from "./packSync";

export interface EnhanceEmailInput {
  subject: string;
  body: string;
  companyName: string;
  senderName: string;
  headline: string;
  beatPrimary: string;
  topReferenceTitle?: string;
  /** 팩 동기화로 채워지는 확장 컨텍스트 — 없으면 기존 동작 그대로 */
  beatSecondary?: string[];
  beatDistribution?: Array<{ beat: string; weight: number }>;
  outletCategory?: OutletCategory;
  referenceArticles?: Array<{ title: string; publishedAtText?: string; publishedAt?: number }>;
  embargoAt?: number;
}

export interface EnhanceEmailResult {
  subject: string;
  body: string;
}

export interface PolishPressInput {
  title: string;
  who?: string;
  newsValue?: string;
  numbers?: string;
  quote?: string;
  topicTags: string[];
  bodyHint?: string;
  /** 미디어킷에서 불러온 표준 회사 소개문 — 보도자료 하단과 단일 소스 */
  boilerplate?: string;
}

export interface PolishPressResult {
  title: string;
  headlines: string[];
  body: string;
}

/**
 * 메일 개인화 시스템 프롬프트 — 7규칙.
 * 규칙은 발송 게이트(`emailCompliance`)가 실제로 검사하는 항목과 일치시킨다.
 * 프롬프트와 게이트가 어긋나면 모델이 매번 차단당하는 초안을 만든다.
 */
export function emailEnhanceSystemPrompt(): string {
  return [
    "당신은 한국 스타트업 언론 홍보 카피라이터다.",
    "기자 배포용 메일을 더 자연스럽고 개인화되게 다듬는다.",
    "규칙:",
    "1) 수신자 호칭은 '기자님'만 쓰고, 본문은 반드시 '기자님,'으로 시작한다. 실명·이메일을 넣지 않는다.",
    "2) 본문 마지막 블록의 수신거부 안내를 반드시 그대로 유지한다.",
    "3) 개인화 없는 도입부(‘안녕하세요, 보도자료를 보냅니다’류)를 쓰지 않는다. 첫 문단에서 해당 기자의 관심사를 짚는다.",
    "4) 행동 요청(CTA)은 정확히 1개만 남긴다. 인터뷰와 자료 송부를 동시에 요청하지 않는다.",
    `5) 본문은 공백 제외 ${EMAIL_BODY_CHAR_MIN}~${EMAIL_BODY_CHAR_MAX}자로 유지한다.`,
    "6) 과장 형용사(혁신적·최고의·완벽한)를 쓰지 않고, 없는 수치를 지어내지 않는다. 수치를 쓰면 출처를 함께 적는다.",
    "7) 근거 없는 '업계 최초·세계 최초', '100%', '절대 보장' 표현은 쓰지 않는다.",
    "8) 매체 유형에 맞는 어투를 쓰되 기자마다 문구를 다르게 한다(동일 문안 복제 금지).",
    '9) JSON만 출력: {"subject":"...","body":"..."}',
  ].join("\n");
}

function articleLines(input: EnhanceEmailInput): string {
  const list = input.referenceArticles ?? [];
  if (list.length === 0) {
    return `최근 기사: ${input.topReferenceTitle ?? "(없음)"}`;
  }
  return [
    "최근 기사:",
    ...list.slice(0, 3).map((a) => {
      const when =
        a.publishedAt !== undefined
          ? `${new Date(a.publishedAt).getMonth() + 1}월 ${new Date(a.publishedAt).getDate()}일`
          : (a.publishedAtText ?? "날짜 미상");
      return `- ${a.title} (${when})`;
    }),
    "※ 날짜가 '날짜 미상'인 기사는 '지난 O월 O일' 같은 시점 주장을 하지 말 것.",
  ].join("\n");
}

const OUTLET_TONE: Record<OutletCategory, string> = {
  newswire: "통신사 — 사실과 자료 제공 가능 여부를 앞세운다. 서사보다 속도.",
  it: "IT 전문지 — 기술 구조·성능 수치·사용성 관점을 앞세운다.",
  economy: "경제지 — 시장 규모·성장률·재무 지표 관점을 앞세운다.",
  general: "일반 매체 — 왜 지금 중요한지 맥락을 먼저 설명한다.",
};

export function emailEnhanceUserPrompt(input: EnhanceEmailInput): string {
  const beats = [input.beatPrimary, ...(input.beatSecondary ?? [])].filter(Boolean).join(", ");
  const dist = input.beatDistribution?.length
    ? input.beatDistribution.map((b) => `${b.beat}(${b.weight})`).join(" ")
    : undefined;
  return [
    `회사: ${input.companyName}`,
    `발신: ${input.senderName}`,
    `헤드라인: ${input.headline}`,
    `기자 beat: ${beats}`,
    dist ? `beat 분포: ${dist}` : undefined,
    `매체 유형: ${OUTLET_TONE[input.outletCategory ?? "general"]}`,
    input.embargoAt ? `엠바고: ${embargoLine(input.embargoAt)} — 최상단 표기를 유지할 것` : undefined,
    `권장 행동 요청: ${ctaLine(input.outletCategory)}`,
    articleLines(input),
    "",
    `현재 제목: ${input.subject}`,
    "현재 본문:",
    input.body,
  ]
    .filter((l): l is string => l !== undefined)
    .join("\n");
}

/**
 * 보도자료 다듬기 시스템 프롬프트 v2.
 *
 * ⚠️ 규칙은 **요약형만** 주입한다(`compactRulesForPrompt`). 전체 가이드는 MCP 도구
 *    `crabpitch_press_guide`로 분리한다 — 프롬프트가 비대해지면 모델이 규칙을 놓친다.
 * ⚠️ 출력 JSON 스키마와 산출 규격(300~500자)은 1차에서 유지한다. 폼·파서·DB가 이 규격을
 *    전제로 동작하고, 8단 풀 템플릿은 스킬 경로의 산출물이다.
 */
export function pressPolishSystemPrompt(): string {
  return [
    "당신은 한국 보도자료 에디터다. 역피라미드·5W1H 표준 보도문을 작성한다.",
    "",
    "[작성 규범]",
    compactRulesForPrompt(),
    "",
    "[출력 규격]",
    "1) headlines는 서로 다른 앵글 3개(사실/수치/트렌드).",
    `2) body는 ${CRABPITCH_FORM_BODY_CHARS.min}~${CRABPITCH_FORM_BODY_CHARS.max}자 내외로 쓰되, 리드 ${WRITING_RULES.leadSentences}문장 → 배경 → 인용 → 회사 소개 순서를 지킨다.`,
    "3) 입력에 없는 사실·수치를 지어내지 않는다.",
    '4) JSON만 출력: {"title":"...","headlines":["...","...","..."],"body":"..."}',
  ].join("\n");
}

export function pressPolishUserPrompt(input: PolishPressInput): string {
  return [
    `가제: ${input.title}`,
    `주체: ${input.who ?? ""}`,
    `뉴스가치: ${input.newsValue ?? ""}`,
    `수치: ${input.numbers ?? ""}`,
    `인용: ${input.quote ?? ""}`,
    `태그: ${input.topicTags.join(", ")}`,
    `초안 힌트: ${input.bodyHint ?? ""}`,
    input.boilerplate ? `회사 소개(그대로 사용): ${input.boilerplate}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 모델 응답에서 JSON 객체 추출. */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fence?.[1]?.trim() ?? trimmed;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseEnhanceEmailResult(
  raw: string,
  fallback: EnhanceEmailResult,
): EnhanceEmailResult {
  const obj = parseJsonObject(raw);
  if (!obj) return fallback;
  const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";
  const body = typeof obj.body === "string" ? obj.body.trim() : "";
  if (!subject || !body) return fallback;

  // 컴플라이언스 ①: 수신거부 — 기능하는 안내 문구 기준(emailTemplate.hasOptOut)
  let safeBody = hasOptOut(body)
    ? body
    : `${body}\n\n──\n본 메일 수신을 원치 않으시면 회신으로 '수신거부'라 남겨주세요. 즉시 명단에서 제외하겠습니다.`;

  // 컴플라이언스 ②: 호칭 — 발송 시점 실명 주입 앵커(`personalizeForSend`)와 동일한 패턴이어야
  // 한다. "기자님의"처럼 부분 문자열만 있으면 앵커가 없어 실명이 주입되지 않는다.
  if (!/(^|\n)기자님,/.test(safeBody)) {
    safeBody = `기자님, 안녕하세요.\n\n${safeBody}`;
  }

  const trimmedSubject = subject.slice(0, 80);

  // 컴플라이언스 ③: LLM 출력이 발송 차단 수준이면 **템플릿 원본으로 되돌린다**.
  // 다듬기 때문에 초안이 발송 불가가 되는 편보다, 다듬지 않은 안전한 초안이 낫다.
  const check = checkEmailCompliance(trimmedSubject, safeBody);
  if (check.status === "fail") return fallback;

  return { subject: trimmedSubject, body: safeBody };
}

export function parsePolishPressResult(
  raw: string,
  fallback: PolishPressResult,
): PolishPressResult {
  const obj = parseJsonObject(raw);
  if (!obj) return fallback;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const body = typeof obj.body === "string" ? obj.body.trim() : "";
  const headlines = Array.isArray(obj.headlines)
    ? obj.headlines.map((h) => String(h).trim()).filter(Boolean).slice(0, 3)
    : [];
  if (!title || !body || headlines.length === 0) return fallback;
  while (headlines.length < 3) headlines.push(title);
  return { title, headlines, body };
}
