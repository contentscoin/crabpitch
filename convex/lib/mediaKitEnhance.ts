/**
 * 미디어킷 AI 생성·보강 — 프롬프트/파서 (순수 TS, 키 없이도 테스트 가능).
 * 실호출은 aiActions.ts ("use node")에서만 수행한다.
 *
 * 규칙의 근거는 `pressGuide`(팩 정본)다 — 숫자·목록을 여기서 새로 만들지 않는다.
 */

import {
  ASSET_POLICY_ITEMS,
  GEO_ASSET_RULES,
  PRESS_KIT_CHECKLIST,
  PRESS_KIT_PHILOSOPHY,
  PRESS_KIT_SECTIONS,
  WRITING_RULES,
} from "./pressGuide";
import { pressKitSection } from "./mediaKitCompleteness";
import type {
  MediaKitAssetPolicy,
  MediaKitCoverageItem,
  MediaKitVisual,
} from "./mediaKitCompleteness";
import { parseJsonObject } from "./anthropicEnhance";

/**
 * AI가 주고받는 미디어킷 필드.
 * ⚠️ v2 신규 4필드는 **optional**이다 — 액션(`aiActions.ts`)의 `EMPTY_KIT`·`kitValidator`가
 *    7필드만 다루므로, 필수로 바꾸면 그 파일이 깨진다.
 */
export interface MediaKitDraft {
  boilerplate: string;
  keyMessages: string[];
  factSheet: Array<{ label: string; value: string; source?: string }>;
  narrative: string;
  spokesperson: string;
  quotes: string[];
  contact: string;
  oneLiner?: string;
  visuals?: MediaKitVisual[];
  assetPolicy?: MediaKitAssetPolicy;
  coverage?: MediaKitCoverageItem[];
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

/**
 * v2 신규 4필드 규칙. 파일명·Alt·캡션·규정 4항은 팩 상수를 그대로 인용한다.
 * 비주얼 URL과 최근 보도는 **모델이 확인할 수 없는 사실**이라 창작을 명시적으로 금지한다.
 */
const KIT_V2_RULES = [
  `- oneLiner: "${pressKitSection("①")}" — 회사를 한 문장으로 정의한다.`,
  `- visuals: 필요한 자산의 label을 제안하고, 파일명은 "${GEO_ASSET_RULES.filenamePattern}" 형식으로 적는다. **실제 파일 주소를 모르면 url을 비운다.**`,
  `- visuals[].alt: ${GEO_ASSET_RULES.alt}`,
  `- visuals[].caption: ${GEO_ASSET_RULES.caption}`,
  `- assetPolicy: 4항(${ASSET_POLICY_ITEMS.join(" / ")})을 각각 usageScope·modificationLimits·credit·trademarkContact에 채운다. 회사 정책을 모르면 "${WRITING_RULES.unverifiablePlaceholder}"로 남기고 지어내지 않는다.`,
  `- coverage: 입력에 근거가 있는 보도만 옮긴다. 매체명·기사 제목·링크를 **추측하지 말고**, 근거가 없으면 빈 배열([])로 둔다.`,
];

const OUTPUT_SCHEMA =
  '{"oneLiner":"...","boilerplate":"...","keyMessages":["..."],"factSheet":[{"label":"...","value":"...","source":"..."}],' +
  '"narrative":"...","spokesperson":"...","quotes":["..."],' +
  '"visuals":[{"label":"...","url":"...","alt":"...","caption":"..."}],' +
  '"assetPolicy":{"usageScope":"...","modificationLimits":"...","credit":"...","trademarkContact":"..."},' +
  '"coverage":[{"outlet":"...","title":"...","url":"...","publishedAtText":"..."}],"contact":"..."}';

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
    ...KIT_V2_RULES,
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
    ...KIT_V2_RULES,
    "- 사용자가 쓴 사실을 임의로 바꾸지 않는다. 표현만 다듬고, 없는 정보는 갭으로 보고한다.",
    "- 입력에 없는 섹션(한 문장 정의·비주얼 자산·자산 사용 규정·최근 보도)은 비었다고 갭으로 보고한다.",
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
        // 신규 4필드는 값이 있을 때만 넣는다 — 빈 키를 보여 주면 모델이 채우려고 지어낸다.
        ...(input.oneLiner ? { oneLiner: input.oneLiner } : {}),
        boilerplate: input.boilerplate,
        keyMessages: input.keyMessages,
        factSheet: input.factSheet,
        narrative: input.narrative,
        spokesperson: input.spokesperson,
        quotes: input.quotes,
        ...(input.visuals?.length ? { visuals: input.visuals } : {}),
        ...(input.assetPolicy ? { assetPolicy: input.assetPolicy } : {}),
        ...(input.coverage?.length ? { coverage: input.coverage } : {}),
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

/** 비주얼 자산 — label이 없으면 어떤 자산인지 알 수 없으므로 버린다. */
function asVisuals(v: unknown): MediaKitVisual[] {
  if (!Array.isArray(v)) return [];
  const out: MediaKitVisual[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const label = asStr(o.label);
    if (!label) continue;
    const url = asStr(o.url);
    const alt = asStr(o.alt);
    const caption = asStr(o.caption);
    out.push({ label, ...(url ? { url } : {}), ...(alt ? { alt } : {}), ...(caption ? { caption } : {}) });
    if (out.length >= 8) break;
  }
  return out;
}

/** 자산 사용 규정 — 4항 중 채워진 것만. 하나도 없으면 undefined(빈 객체를 저장하지 않는다). */
function asAssetPolicy(v: unknown): MediaKitAssetPolicy | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const policy: MediaKitAssetPolicy = {};
  const usageScope = asStr(o.usageScope);
  const modificationLimits = asStr(o.modificationLimits);
  const credit = asStr(o.credit);
  const trademarkContact = asStr(o.trademarkContact);
  if (usageScope) policy.usageScope = usageScope;
  if (modificationLimits) policy.modificationLimits = modificationLimits;
  if (credit) policy.credit = credit;
  if (trademarkContact) policy.trademarkContact = trademarkContact;
  return Object.keys(policy).length > 0 ? policy : undefined;
}

/** 최근 보도 — 매체명·제목이 모두 있어야 기자가 확인할 수 있다. */
function asCoverage(v: unknown): MediaKitCoverageItem[] {
  if (!Array.isArray(v)) return [];
  const out: MediaKitCoverageItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const outlet = asStr(o.outlet);
    const title = asStr(o.title);
    if (!outlet || !title) continue;
    const url = asStr(o.url);
    const publishedAtText = asStr(o.publishedAtText);
    out.push({
      outlet,
      title,
      ...(url ? { url } : {}),
      ...(publishedAtText ? { publishedAtText } : {}),
    });
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * 모델 출력 → 미디어킷 초안.
 * ⚠️ placeholder는 **그대로 보존**한다. 지우면 사용자가 확인해야 할 항목이 사라지고,
 *    완성도 채점도 이 값을 미완성으로 인식해야 한다.
 * ⚠️ 신규 4필드는 모델이 안 주면 fallback(현재 킷) 값을 유지한다 — 보강 왕복에서 사용자가
 *    직접 채운 비주얼·보도 목록이 지워지면 안 된다.
 */
export function parseMediaKitDraft(
  raw: string,
  fallback: MediaKitDraft,
): MediaKitDraft | null {
  const obj = parseJsonObject(raw);
  if (!obj) return null;
  const source = (obj.kit && typeof obj.kit === "object" ? obj.kit : obj) as Record<string, unknown>;

  const visuals = asVisuals(source.visuals);
  const coverage = asCoverage(source.coverage);
  const assetPolicy = asAssetPolicy(source.assetPolicy) ?? fallback.assetPolicy;
  const oneLiner = asStr(source.oneLiner) || fallback.oneLiner;

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
    ...(oneLiner ? { oneLiner } : {}),
    ...(visuals.length ? { visuals } : fallback.visuals?.length ? { visuals: fallback.visuals } : {}),
    ...(assetPolicy ? { assetPolicy } : {}),
    ...(coverage.length ? { coverage } : fallback.coverage?.length ? { coverage: fallback.coverage } : {}),
  };

  const anyContent =
    draft.boilerplate ||
    draft.narrative ||
    draft.oneLiner ||
    draft.keyMessages.length ||
    draft.factSheet.length;
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
