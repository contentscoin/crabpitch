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

/** CTA(행동 요청) 신호 — 정확히 1개여야 한다. */
const CTA_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "인터뷰 제안", pattern: /인터뷰(를)?\s*(원하시|필요하시|가능하시|제안)/ },
  { label: "자료 요청 안내", pattern: /(자료|보도자료|프레스킷)(를)?\s*(바로\s*)?(보내|송부|전달)(드리|해\s*드리)/ },
  { label: "회신 요청", pattern: /회신\s*(부탁|주세요|주시면)/ },
  { label: "연락 요청", pattern: /연락\s*(부탁|주세요|주시면)/ },
  { label: "통화 제안", pattern: /통화\s*(가능|원하시|괜찮으시)/ },
];

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
 * @param opts.hasNumberWithComparison 타사 비교 맥락에서 무출처 수치를 쓴 경우 critical 승격
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
  const ctaHits = CTA_PATTERNS.filter((c) => c.pattern.test(body));
  if (ctaHits.length === 0) {
    violations.push({
      level: "structure",
      severity: "medium",
      label: "행동 요청(CTA) 없음",
      detail: "기자가 무엇을 하면 되는지 명시되지 않았습니다.",
      suggestion: "인터뷰 제안 또는 자료 송부 중 하나만 넣으세요.",
    });
  } else if (ctaHits.length > 1) {
    violations.push({
      level: "structure",
      severity: "medium",
      label: "행동 요청(CTA) 중복",
      detail: `${ctaHits.map((c) => c.label).join(", ")} — ${ctaHits.length}개`,
      suggestion: "요청은 하나만 남기세요. 선택지가 많을수록 회신율이 떨어집니다.",
    });
  }

  // 구조 ③ 분량 — WARN 전용(근사 환산이라 하드블록하지 않는다)
  if (!opts?.skipLengthCheck) {
    const len = body.replace(/\s/g, "").length;
    if (len > EMAIL_BODY_CHAR_MAX) {
      violations.push({
        level: "structure",
        severity: "medium",
        label: "본문이 깁니다",
        detail: `공백 제외 ${len}자 (권장 ${EMAIL_BODY_CHAR_MIN}~${EMAIL_BODY_CHAR_MAX}자)`,
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
