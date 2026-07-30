/**
 * 기자 배포 메일 컴플라이언스 게이트 (순수 TS — 결정적·재현 가능).
 *
 * 보도자료 lint(`pressLint`)와 **금칙어·수치 패턴 상수를 공유**하되(`pressGuide`가 정본),
 * 게이트 정책은 도메인별로 다르다:
 *   - 보도자료: warn-only (저장·발송을 막지 않는다. 오탐률 확인 후 게이트화 — 2차)
 *   - 메일: critical 1건이면 **FAIL(발송 차단)**. 발송은 되돌릴 수 없는 행위라 즉시 적용한다.
 *
 * 이 판정은 발송 확정 3경로(즉시·예약·크론 백업) 공통 함수에서 호출된다.
 */

import {
  L1_BANNED_TERMS,
  L2_SUPERLATIVES,
  NUMBER_PATTERN,
  SOURCE_MARKERS,
  type ViolationSeverity,
} from "./pressGuide";
// hasOptOut의 정본은 emailTemplate이다(템플릿 렌더러가 같은 판정으로 문구를 강제하므로
// 두 벌로 나누면 즉시 어긋난다). 여기서는 재사용만 한다.
import { hasOptOut } from "./emailTemplate";

export type ComplianceStatus = "pass" | "warn" | "fail";

export interface ComplianceViolation {
  /** "L1" | "L2" | "L4" | "structure" */
  level: string;
  severity: ViolationSeverity;
  label: string;
  /** 어디가 문제인지 — 기자 PII를 담지 않는다 */
  detail: string;
  suggestion?: string;
}

export interface ComplianceResult {
  status: ComplianceStatus;
  summary: { critical: number; high: number; medium: number };
  violations: ComplianceViolation[];
  /** 승인 화면·초안 레코드에 남길 한글 요약(익명) */
  notes: string[];
}

/** 메일 본문 권장 분량 — 150~200단어 근사 환산. 초과·미달은 WARN 전용(하드블록 금지). */
export const EMAIL_BODY_CHAR_MIN = 600;
export const EMAIL_BODY_CHAR_MAX = 800;

/**
 * ⚠️ 골격(프리셋)별 **절대** 분량 상·하한을 여기 두려는 시도를 하지 말 것. 한 번 했고 틀렸다.
 *
 * 템플릿 출력 길이는 골격이 아니라 **입력 길이**가 결정한다. 실측하면 같은 골격에서도
 * 152자(최소 입력)~708자(긴 헤드라인·수치·인용문·링크 3개·엠바고)까지 벌어지고,
 * 골격 간 차이는 50~80자뿐이다. 절대값 표를 만들면 갓 생성된 초안이 자기 목표를
 * 위반하고, AI 다듬기 결과가 항상 폐기된다.
 *
 * 분량 통제는 **원본 대비 변화폭**으로 봐야 하고, 원본을 아는 지점은 이 게이트가 아니라
 * 다듬기 단계다(`anthropicEnhance.EMAIL_BODY_SCALE`). 발송 게이트는 원본을 모르므로
 * 절대 상한(`EMAIL_BODY_CHAR_MAX`)만 안전망으로 본다.
 */

/**
 * CTA(행동 요청)는 **무엇을 요청하는가**로 센다.
 *
 * "인터뷰를 원하시면 회신 주세요"는 요청 하나(인터뷰)에 응답 방법(회신)이 붙은 것이지
 * 요청 두 개가 아니다. 둘을 같은 층위에서 세면 정상 문장이 "CTA 중복"으로 걸린다
 * (실제로 기본 템플릿이 걸렸다). 그래서 요청 종류와 응답 경로를 분리한다.
 */
const ASK_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "인터뷰·취재 제안", pattern: /인터뷰|취재\s*요청|미팅|통화\s*(가능|원하시|괜찮으시)/ },
  {
    label: "자료 송부 제안",
    pattern: /(자료|이미지|프레스킷|팩트시트|원문)[^.\n]{0,20}(보내|송부|전달)(드리|해\s*드리)?/,
  },
];

/** 응답 경로 — 그 자체로는 요청이 아니지만, 요청이 하나도 없을 때는 CTA로 인정한다. */
const RESPONSE_REQUEST = /(회신|연락)\s*(부탁|주세요|주시면|바랍니다)/;

function countMatches(text: string, pattern: RegExp): number {
  // 전역 정규식을 재사용하면 lastIndex가 남으므로 매번 새로 만든다.
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return (text.match(re) ?? []).length;
}

/** 문장 단위로 쪼갠다(수치-출처 근접 검사용). */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasSourceMarker(text: string): boolean {
  const lower = text.toLowerCase();
  return SOURCE_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

/**
 * L4 — 수치 인근 출처 검사.
 * 수치를 담은 문장 또는 **바로 앞뒤 문장**에 출처 표지가 있으면 통과한다(오탐 완화).
 */
function checkNumberSources(body: string): ComplianceViolation[] {
  const sentences = splitSentences(body);
  const out: ComplianceViolation[] = [];
  for (let i = 0; i < sentences.length; i += 1) {
    const s = sentences[i]!;
    if (countMatches(s, NUMBER_PATTERN) === 0) continue;
    const near = [sentences[i - 1], s, sentences[i + 1]].filter(Boolean).join(" ");
    if (hasSourceMarker(near)) continue;
    out.push({
      level: "L4",
      severity: "high",
      label: "수치에 출처 없음",
      detail: `"${s.slice(0, 40)}${s.length > 40 ? "…" : ""}"`,
      suggestion: "집계 기준·조사 시점·출처를 같은 문장에 병기하세요.",
    });
  }
  return out;
}

/**
 * 메일 초안 컴플라이언스 판정.
 *
 * @param opts.skipLengthCheck 분량 검사 자체를 끈다(팔로업 등 분량 규범이 다른 경로)
 */
export function checkEmailCompliance(
  subject: string,
  body: string,
  opts?: { skipLengthCheck?: boolean },
): ComplianceResult {
  const violations: ComplianceViolation[] = [];
  const text = `${subject}\n${body}`;

  // L1 — 절대적·단정적 표현
  for (const term of L1_BANNED_TERMS) {
    const n = countMatches(text, term.pattern);
    if (n > 0) {
      violations.push({
        level: "L1",
        severity: term.severity,
        label: term.label,
        detail: `${n}회 사용`,
        suggestion: term.replacement,
      });
    }
  }

  // L2 — 최상급·순위
  for (const term of L2_SUPERLATIVES) {
    const n = countMatches(text, term.pattern);
    if (n > 0) {
      violations.push({
        level: "L2",
        severity: term.severity,
        label: term.label,
        detail: `${n}회 사용`,
        suggestion: term.replacement,
      });
    }
  }

  // L4 — 수치-출처 근접
  violations.push(...checkNumberSources(body));

  // 구조 ① 수신거부 — 법적 필수. 누락은 발송 차단 사유.
  if (!hasOptOut(body)) {
    violations.push({
      level: "structure",
      severity: "critical",
      label: "수신거부 안내 없음",
      detail: "본문에 실행 가능한 수신거부 안내가 없습니다.",
      suggestion: "'수신거부'라 회신하면 즉시 제외한다는 문구를 마지막 블록에 넣으세요.",
    });
  }

  // 구조 ② CTA 개수 — 정확히 1개
  const asks = ASK_PATTERNS.filter((c) => c.pattern.test(body));
  const ctaCount = asks.length > 0 ? asks.length : RESPONSE_REQUEST.test(body) ? 1 : 0;
  if (ctaCount === 0) {
    violations.push({
      level: "structure",
      severity: "medium",
      label: "행동 요청(CTA) 없음",
      detail: "기자가 무엇을 하면 되는지 명시되지 않았습니다.",
      suggestion: "인터뷰 제안 또는 자료 송부 중 하나만 넣으세요.",
    });
  } else if (ctaCount > 1) {
    violations.push({
      level: "structure",
      severity: "medium",
      label: "행동 요청(CTA) 중복",
      detail: `${asks.map((c) => c.label).join(", ")} — ${ctaCount}개`,
      suggestion: "요청은 하나만 남기세요. 선택지가 많을수록 회신율이 떨어집니다.",
    });
  }

  // 구조 ③ 분량 — 절대 상한 안전망만. WARN 전용(근사 환산이라 하드블록하지 않는다)
  if (!opts?.skipLengthCheck) {
    const len = body.replace(/\s/g, "").length;
    if (len > EMAIL_BODY_CHAR_MAX) {
      violations.push({
        level: "structure",
        severity: "medium",
        label: "본문이 깁니다",
        detail: `공백 제외 ${len}자 (최대 ${EMAIL_BODY_CHAR_MAX}자)`,
        suggestion: "배경 설명을 줄이고 자료 링크로 넘기세요.",
      });
    }
  }

  const summary = {
    critical: violations.filter((v) => v.severity === "critical").length,
    high: violations.filter((v) => v.severity === "high").length,
    medium: violations.filter((v) => v.severity === "medium").length,
  };

  let status: ComplianceStatus = "pass";
  if (summary.critical >= 1) status = "fail";
  else if (summary.high >= 3 || summary.medium >= 5) status = "warn";

  return {
    status,
    summary,
    violations,
    notes: violations
      .filter((v) => v.severity !== "medium" || status !== "pass")
      .map((v) => `[${v.severity === "critical" ? "차단" : "주의"}] ${v.label} — ${v.detail}`),
  };
}

/** 발송을 막아야 하는가. */
export function blocksSend(result: ComplianceResult): boolean {
  return result.status === "fail";
}
