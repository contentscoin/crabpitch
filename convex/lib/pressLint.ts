/**
 * 보도자료 결정적 lint — `pressGuide` 상수를 소비한다(값 복제 금지).
 *
 * ⚠️ 게이트 정책은 메일과 다르다. **1차는 warn-only**로, 저장·발송을 막지 않는다.
 *    보도자료는 사용자가 계속 고쳐 쓰는 작업물이라 오탐 1건이 작업을 막으면 비용이 크고,
 *    실제 오탐률을 확인하기 전에는 차단 근거가 없다. 게이트화는 2차(S7).
 *    (반대로 메일은 발송이 비가역이라 critical을 즉시 차단한다 — `emailCompliance`.)
 */

import {
  GATE_THRESHOLDS,
  L1_BANNED_TERMS,
  L2_SUPERLATIVES,
  NUMBER_PATTERN,
  SOURCE_MARKERS,
  WRITING_RULES,
  type ViolationSeverity,
} from "./pressGuide";

export interface PressViolation {
  level: string;
  severity: ViolationSeverity;
  /** 규칙 식별자 — 팩의 명명 규약을 따른다(ADV-*, STYLE-*) */
  ruleId: string;
  label: string;
  /** 문제가 된 부분(그대로 붙여 넣지 않고 잘라서) */
  span: string;
  suggestion: string;
}

export interface PressLintResult {
  /** warn-only 단계에서도 상태는 계산한다 — 2차 게이트화 시 그대로 쓴다 */
  status: "pass" | "warn" | "fail";
  summary: { critical: number; high: number; medium: number };
  violations: PressViolation[];
}

function matchAll(text: string, pattern: RegExp): string[] {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return text.match(re) ?? [];
}

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

function clip(s: string, n = 40): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * 보도자료 제목·본문 검사.
 * L1 금칙어 / L2 최상급 / L4 수치-출처 근접 / 문장 길이(STYLE-LEN-001).
 */
export function lintPressRelease(title: string, body: string): PressLintResult {
  const violations: PressViolation[] = [];
  const text = `${title}\n${body}`;

  for (const term of L1_BANNED_TERMS) {
    const hits = matchAll(text, term.pattern);
    if (hits.length === 0) continue;
    violations.push({
      level: "L1",
      severity: term.severity,
      ruleId: "ADV-001",
      label: term.label,
      span: clip(hits[0]!),
      suggestion: term.replacement,
    });
  }

  for (const term of L2_SUPERLATIVES) {
    const hits = matchAll(text, term.pattern);
    if (hits.length === 0) continue;
    // 같은 문장에 출처 표지가 있으면 근거 있는 최상급으로 보고 넘어간다(팩 L2 조건).
    const sentence = splitSentences(text).find((s) => new RegExp(term.pattern.source).test(s));
    if (sentence && hasSourceMarker(sentence)) continue;
    violations.push({
      level: "L2",
      severity: term.severity,
      ruleId: "ADV-002",
      label: term.label,
      span: clip(hits[0]!),
      suggestion: term.replacement,
    });
  }

  const sentences = splitSentences(body);
  for (let i = 0; i < sentences.length; i += 1) {
    const s = sentences[i]!;

    // L4 — 수치 인근 출처. 앞뒤 문장까지 보고 판단한다(오탐 완화).
    if (matchAll(s, NUMBER_PATTERN).length > 0) {
      const near = [sentences[i - 1], s, sentences[i + 1]].filter(Boolean).join(" ");
      if (!hasSourceMarker(near)) {
        violations.push({
          level: "L4",
          severity: "medium",
          ruleId: "ADV-004",
          label: "수치에 출처 없음",
          span: clip(s),
          suggestion: "조사기관·연도 또는 집계 기준을 같은 문장에 병기하세요.",
        });
      }
    }

    // 문장 길이 — 팩의 STYLE-LEN-001
    if (s.length > WRITING_RULES.sentenceCharMax) {
      violations.push({
        level: "style",
        severity: "medium",
        ruleId: "STYLE-LEN-001",
        label: `문장이 ${WRITING_RULES.sentenceCharMax}자를 넘습니다`,
        span: clip(s),
        suggestion: `${WRITING_RULES.sentenceCharTarget}~${WRITING_RULES.sentenceCharMax}자로 나누세요.`,
      });
    }
  }

  // placeholder 잔존 — 배포본에 남으면 안 된다
  if (text.includes(WRITING_RULES.unverifiablePlaceholder) || /\bTBD\b|확정 필요/.test(text)) {
    violations.push({
      level: "structure",
      severity: "high",
      ruleId: "STYLE-TBD-001",
      label: "확인이 끝나지 않은 항목이 남아 있습니다",
      span: WRITING_RULES.unverifiablePlaceholder,
      suggestion: "근거 자료를 확인해 실제 값으로 바꾸거나 해당 문장을 지우세요.",
    });
  }

  const summary = {
    critical: violations.filter((v) => v.severity === "critical").length,
    high: violations.filter((v) => v.severity === "high").length,
    medium: violations.filter((v) => v.severity === "medium").length,
  };

  let status: PressLintResult["status"] = "pass";
  if (summary.critical >= GATE_THRESHOLDS.failCritical) status = "fail";
  else if (summary.high >= GATE_THRESHOLDS.warnHigh || summary.medium >= GATE_THRESHOLDS.warnMedium)
    status = "warn";

  return { status, summary, violations };
}
