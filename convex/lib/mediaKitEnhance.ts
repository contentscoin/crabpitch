/**
 * 미디어킷 AI 생성·보강 — 프롬프트/파서 (순수 TS, 키 없이도 테스트 가능).
 * 실호출은 aiActions.ts ("use node")에서만 수행한다.
 *
 * 규칙의 근거는 `pressGuide`(팩 정본)다 — 숫자·목록을 여기서 새로 만들지 않는다.
 */

import {
  ASSET_POLICY_ITEMS,
  PRESS_KIT_CHECKLIST,
  PRESS_KIT_PHILOSOPHY,
  PRESS_KIT_SECTIONS,
  WRITING_RULES,
} from "./pressGuide";
import { parseJsonObject } from "./anthropicEnhance";

export interface MediaKitDraft {
  boilerplate: string;
  keyMessages: string[];
  factSheet: Array<{ label: string; value: string; source?: string }>;
  narrative: string;
  spokesperson: string;
  quotes: string[];
  contact: string;
}

export interface GenerateMediaKitInput {
  companyName: string;
  industry?: string;
  oneLiner?: string;
  numbers?: string;
  contact?: string;
}

export interface EnhanceMediaKitInput extends MediaKitDraft {
  companyName: string;
}

/** 갭 리포트 1항목 — 문구는 완성도 채점(mediaKitCompleteness)과 같은 어휘를 쓴다. */
export interface MediaKitGap {
  field: string;
  issue: string;
  suggestion: string;
}

const SHARED_RULES = [
  `- 검증할 수 없는 수치는 만들지 말고 "${WRITING_RULES.unverifiablePlaceholder}"로 남긴다.`,
  `- 회사 소개문은 ${WRITING_RULES.boilerplateWordMin}~${WRITING_RULES.boilerplateWordMax}단어로 쓴다.`,
  `- 핵심 메시지는 ${WRITING_RULES.keyMessagesMax}개 이내.`,
  "- 홍보성 형용사(혁신적·최고의·완벽한)를 쓰지 않고 검증 가능한 사실로 쓴다.",
  "- 근거 없는 '업계 최초·세계 최초', '100%', '절대 보장' 표현은 쓰지 않는다.",
  "- 팩트시트의 수치 항목에는 source(출처·기준 시점)를 채운다. 모르면 비워 두고 지어내지 않는다.",
  "- 인용문은 실명·직책을 전제로 쓰되, 입력에 없으면 직책 자리를 비워 둔다.",
];

const OUTPUT_SCHEMA =
  '{"boilerplate":"...","keyMessages":["..."],"factSheet":[{"label":"...","value":"...","source":"..."}],"narrative":"...","spokesperson":"...","quotes":["..."],"contact":"..."}';

export function mediaKitGenerateSystemPrompt(): string {
  return [
    "당신은 한국 스타트업 미디어킷(프레스킷) 작성자다.",
    `${PRESS_KIT_PHILOSOPHY}`,
    "",
    "권장 목차:",
    ...PRESS_KIT_SECTIONS.map((s) => `- ${s}`),
    "",
    "규칙:",
    ...SHARED_RULES,
    "",
    `JSON만 출력: ${OUTPUT_SCHEMA}`,
  ].join("\n");
}

export function mediaKitGenerateUserPrompt(input: GenerateMediaKitInput): string {
  return [
    `회사: ${input.companyName}`,
    `업종: ${input.industry ?? "(미지정)"}`,
    `한 줄 설명: ${input.oneLiner ?? "(미지정)"}`,
    `보유 수치: ${input.numbers ?? "(없음)"}`,
    `언론 문의처: ${input.contact ?? "(미지정)"}`,
  ].join("\n");
}

export function mediaKitEnhanceSystemPrompt(): string {
  return [
    "당신은 한국 스타트업 미디어킷을 검수·보강하는 편집자다.",
    "현재 킷을 읽고 ① 개선안 ② 갭 리포트를 만든다.",
    "",
    "검수 기준:",
    ...PRESS_KIT_CHECKLIST.map((c) => `- ${c}`),
    "",
    "자산 사용 규정 필수 항목:",
    ...ASSET_POLICY_ITEMS.map((a) => `- ${a}`),
    "",
    "규칙:",
    ...SHARED_RULES,
    "- 사용자가 쓴 사실을 임의로 바꾸지 않는다. 표현만 다듬고, 없는 정보는 갭으로 보고한다.",
    "",
    `JSON만 출력: {"kit":${OUTPUT_SCHEMA},"gaps":[{"field":"...","issue":"...","suggestion":"..."}]}`,
  ].join("\n");
}

export function mediaKitEnhanceUserPrompt(input: EnhanceMediaKitInput): string {
  return [
    `회사: ${input.companyName}`,
    "현재 미디어킷(JSON):",
    JSON.stringify(
      {
        boilerplate: input.boilerplate,
        keyMessages: input.keyMessages,
        factSheet: input.factSheet,
        narrative: input.narrative,
        spokesperson: input.spokesperson,
        quotes: input.quotes,
        contact: input.contact,
      },
      null,
      2,
    ),
  ].join("\n");
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asStrList(v: unknown, limit: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asStr(x)).filter(Boolean).slice(0, limit);
}

function asFactSheet(v: unknown): MediaKitDraft["factSheet"] {
  if (!Array.isArray(v)) return [];
  const out: MediaKitDraft["factSheet"] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = asStr(o.label);
    const value = asStr(o.value);
    if (!label || !value) continue;
    const source = asStr(o.source);
    out.push({ label, value, ...(source ? { source } : {}) });
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * 모델 출력 → 미디어킷 초안.
 * ⚠️ placeholder는 **그대로 보존**한다. 지우면 사용자가 확인해야 할 항목이 사라지고,
 *    완성도 채점도 이 값을 미완성으로 인식해야 한다.
 */
export function parseMediaKitDraft(
  raw: string,
  fallback: MediaKitDraft,
): MediaKitDraft | null {
  const obj = parseJsonObject(raw);
  if (!obj) return null;
  const source = (obj.kit && typeof obj.kit === "object" ? obj.kit : obj) as Record<string, unknown>;

  const draft: MediaKitDraft = {
    boilerplate: asStr(source.boilerplate) || fallback.boilerplate,
    keyMessages: asStrList(source.keyMessages, WRITING_RULES.keyMessagesMax) .length
      ? asStrList(source.keyMessages, WRITING_RULES.keyMessagesMax)
      : fallback.keyMessages,
    factSheet: asFactSheet(source.factSheet).length
      ? asFactSheet(source.factSheet)
      : fallback.factSheet,
    narrative: asStr(source.narrative) || fallback.narrative,
    spokesperson: asStr(source.spokesperson) || fallback.spokesperson,
    quotes: asStrList(source.quotes, 5).length ? asStrList(source.quotes, 5) : fallback.quotes,
    contact: asStr(source.contact) || fallback.contact,
  };

  const anyContent =
    draft.boilerplate || draft.narrative || draft.keyMessages.length || draft.factSheet.length;
  return anyContent ? draft : null;
}

/** 모델이 보고한 갭 목록. 없으면 빈 배열. */
export function parseMediaKitGaps(raw: string): MediaKitGap[] {
  const obj = parseJsonObject(raw);
  if (!obj || !Array.isArray(obj.gaps)) return [];
  const out: MediaKitGap[] = [];
  for (const item of obj.gaps) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const field = asStr(o.field);
    const issue = asStr(o.issue);
    if (!field || !issue) continue;
    out.push({ field, issue, suggestion: asStr(o.suggestion) });
    if (out.length >= 12) break;
  }
  return out;
}
