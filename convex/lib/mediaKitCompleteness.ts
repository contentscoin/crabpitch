/**
 * 미디어킷 완성도 **가중 배점 v2**.
 *
 * v1이 푼 문제(그대로 유지)
 *  ① 무게 구분 — 핵심 메시지와 연락처가 같은 값이던 동일가중을 없앴다.
 *  ② 안내 — 항목별 배점과 함께 **미충족 사유(`reason`)를 항상 동반 반환**한다. 배점 개편으로
 *    기존 킷의 표시 % 가 떨어지는 체감(로드맵 리스크 12)을 상쇄하는 건 이 사유 문구다.
 *
 * v2가 더한 것 — 스키마 확장(`oneLiner`·`visuals[]`·`assetPolicy`·`coverage[]`)으로 팩 목차
 * ①·⑥·⑦·⑨를 처음 채점한다. 총점은 100을 유지한다.
 *
 * ⚠️ **기존 점수 하락 완화** — 신규 4항목은 합계 {@link V2_COMPLETENESS_MAX}점만 가져간다.
 *  · 기존 11항목은 합계 {@link LEGACY_COMPLETENESS_MAX}점을 유지하고, **항목당 감점은 최대 3점**이다.
 *    연락처·이메일 형식(각 5점)은 감점 0 — 기자 회신 경로라 무게를 낮출 이유가 없다.
 *  · 균형 보정은 **기존 7축만** 본다. 신규 섹션을 축에 넣으면 배점 감소 + 보정 상실의 이중 감점이 된다.
 *  · 신규 4항목은 전부 부분 점수다 — 비주얼 1개, 규정 1항, 보도 1건만 채워도 즉시 오른다.
 *  · 화면은 {@link LEGACY_COMPLETENESS_MAX}를 근거로 "기존 항목만 채운 킷의 상한"을 안내한다.
 *
 * 설계 원칙
 *  · 부분 점수 — 개수·충족률 기준 항목은 목표치 대비 비례 배점이다. 전부-아니면-0은
 *    "1개 채워도 그대로 0"이라 사용자가 다음 행동을 잡지 못한다.
 *  · placeholder는 미완성 — 팩 규범상 배포본에 미확정 표기가 남으면 위반이다. 저장만 하고
 *    점수를 챙기는 우회를 막는다.
 *  · 규범 수치는 `pressGuide`가 정본 — 단어 수·목차 문구·자산 규칙·규정 항목을 여기서 복제하지 않는다.
 *
 * DB에는 여전히 `completeness: number` 하나만 저장하고, 항목별 사유는 화면이 이 순수 함수를
 * 직접 호출해 얻는다.
 */

import { ASSET_POLICY_ITEMS, GEO_ASSET_RULES, PRESS_KIT_SECTIONS, WRITING_RULES } from "./pressGuide";

/* ── 입출력 타입 ─────────────────────────────────────────────── */

export interface MediaKitFactItem {
  label: string;
  value: string;
  source?: string;
}

/** 비주얼 자산 1건 — 스키마 `mediaKits.visuals[]`와 같은 모양. */
export interface MediaKitVisual {
  label: string;
  url?: string;
  alt?: string;
  caption?: string;
}

/** 자산 사용 규정 — 4개 키가 {@link ASSET_POLICY_ITEMS} 4항과 순서대로 대응한다. */
export interface MediaKitAssetPolicy {
  usageScope?: string;
  modificationLimits?: string;
  credit?: string;
  trademarkContact?: string;
}

/** 최근 보도 1건 — 스키마 `mediaKits.coverage[]`와 같은 모양. */
export interface MediaKitCoverageItem {
  outlet: string;
  title: string;
  url?: string;
  publishedAtText?: string;
}

/**
 * 채점 입력 — `mediaKits` 문서에서 점수에 쓰이는 필드만 추린 형태.
 * v2 신규 4필드는 전부 optional이다(기존 레코드·기존 호출부가 그대로 동작해야 한다).
 */
export interface MediaKitScorable {
  boilerplate?: string;
  keyMessages: readonly string[];
  factSheet: readonly MediaKitFactItem[];
  narrative?: string;
  spokesperson?: string;
  quotes: readonly string[];
  contact?: string;
  oneLiner?: string;
  visuals?: readonly MediaKitVisual[];
  assetPolicy?: MediaKitAssetPolicy;
  coverage?: readonly MediaKitCoverageItem[];
}

export type CompletenessKey =
  | "boilerplate"
  | "boilerplateLength"
  | "keyMessages"
  | "factSheet"
  | "factSource"
  | "narrative"
  | "spokesperson"
  | "quotes"
  | "contact"
  | "contactEmail"
  | "balance"
  | "oneLiner"
  | "visuals"
  | "assetPolicy"
  | "coverage";

export interface CompletenessItem {
  key: CompletenessKey;
  label: string;
  /** 획득 점수 */
  earned: number;
  /** 만점 */
  max: number;
  /** 미충족일 때만 채워진다 — "무엇을 채우면 오르는지"를 한 문장으로. */
  reason?: string;
}

export interface MediaKitCompleteness {
  /** 0~100 */
  score: number;
  items: CompletenessItem[];
}

/* ── 배점표 ──────────────────────────────────────────────────── */

/**
 * 합계 100. 무게는 "기자가 기사를 쓰려면 무엇이 먼저 필요한가" 순이다 —
 * 핵심 메시지(13)가 최상단, 형식 검증인 길이·이메일 형식(각 4~5)이 최하단.
 *
 * v1 → v2 감점(괄호 안이 v1): 신규 4항목 자리를 만들되 **한 항목도 3점을 넘겨 깎지 않는다**.
 * 연락처·이메일 형식은 감점 0이다.
 */
const POINTS = {
  boilerplate: 8, // (10)
  boilerplateLength: 4, // (5)
  keyMessages: 13, // (15)
  factSheet: 8, // (10)
  factSource: 8, // (10)
  narrative: 8, // (10)
  spokesperson: 8, // (10)
  quotes: 8, // (10)
  contact: 5, // (5)
  contactEmail: 5, // (5)
  balance: 7, // (10) — 신규 축을 넣지 않는 대신 보정 자체를 3점 낮춘다
  oneLiner: 5,
  visuals: 6,
  assetPolicy: 4,
  coverage: 3,
} as const;

/** v2에서 새로 채점하는 항목 — 화면이 "추가로 채우면 오르는 항목"으로 안내한다. */
export const V2_KEYS = ["oneLiner", "visuals", "assetPolicy", "coverage"] as const satisfies readonly CompletenessKey[];

export const COMPLETENESS_MAX: number = Object.values(POINTS).reduce((a, b) => a + b, 0);

/** 신규 4항목 합계. 기존 킷이 손해 볼 수 있는 최대 폭이기도 하다. */
export const V2_COMPLETENESS_MAX: number = V2_KEYS.reduce((sum, k) => sum + POINTS[k], 0);

/** 기존 11항목 합계 = 신규 섹션을 손대지 않은 킷이 받을 수 있는 상한. */
export const LEGACY_COMPLETENESS_MAX: number = COMPLETENESS_MAX - V2_COMPLETENESS_MAX;

/**
 * ⚠️ 항목 **개수** 기준은 팩에 근거가 없다(확인됨). 아래는 동일가중 시절 크랩피치 폼이
 * 쓰던 `>= 3` 조건을 그대로 승계한 값이다 — 배점만 바꾸고 기준선은 유지해야 기존 킷의
 * 점수가 이유 없이 흔들리지 않는다. 팩의 임원 코멘트 1~2개는 보도자료 1건 기준이라
 * 킷이 보관하는 인용문 수와는 층위가 다르므로 가져오지 않는다.
 */
export const COMPLETENESS_TARGETS = {
  /** 핵심 메시지는 팩 상한(3개 이내)이 곧 목표치다. */
  keyMessages: WRITING_RULES.keyMessagesMax,
  factSheet: 3,
  quotes: 3,
  /**
   * 비주얼·최근 보도는 팩에 **건수 규정이 없다**(목차 존재만 규정). 임의 건수를 만들지 않고
   * "1건 이상"만 문턱으로 둔다 — 대신 비주얼은 건마다 GEO 3규칙 충족률을 따로 본다.
   */
  visuals: 1,
  coverage: 1,
} as const;

/** 자산 사용 규정 4항({@link ASSET_POLICY_ITEMS})과 스키마 키의 **선언 순서 대응**. */
const ASSET_POLICY_KEYS = [
  "usageScope",
  "modificationLimits",
  "credit",
  "trademarkContact",
] as const satisfies readonly (keyof MediaKitAssetPolicy)[];

/**
 * 미확정 표기. `pressGuide`의 placeholder가 정본이고, "TBD"·"확정 필요"는 사용자가 실제로
 * 쓰는 변형이라 같이 본다. 팩 규칙상 배포본에 남으면 위반이므로 완성으로 세지 않는다.
 */
export const PLACEHOLDER_MARKERS: readonly string[] = [
  WRITING_RULES.unverifiablePlaceholder,
  "TBD",
  "확정 필요",
];

/**
 * 기자가 실제로 회신할 수 있는 주소인지의 최소 형식 검사.
 * 연락처는 "이름 / 이메일 / 전화" 한 줄로 적히므로 문자열 전체가 아니라 **포함 여부**를 본다.
 */
const EMAIL_PATTERN = /[^\s@<>,;()]+@[^\s@<>,;()]+\.[A-Za-z]{2,}/;

/* ── 판정 헬퍼 ───────────────────────────────────────────────── */

export function hasPlaceholder(text: string | undefined): boolean {
  if (!text) return false;
  const upper = text.toUpperCase();
  return PLACEHOLDER_MARKERS.some((marker) => upper.includes(marker.toUpperCase()));
}

/** 채워졌다고 인정하는 조건 — 공백뿐이거나 미확정 표기가 남아 있으면 미완성이다. */
export function isFilled(text: string | undefined): boolean {
  return !!text && text.trim().length > 0 && !hasPlaceholder(text);
}

/** 보일러플레이트 단어 수. 한국어는 어절 단위가 사실상 유일한 세는 방법이라 공백으로 가른다. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * 팩트시트의 "수치 항목" 판정 — 값에 숫자가 있으면 수치로 본다.
 * `pressGuide`의 L4 `NUMBER_PATTERN`은 단위(%·명·억…)를 동반한 **문장**용이라
 * "2019"(설립연도)·"3.2"처럼 단위 없이 적히는 팩트시트 값을 놓친다.
 */
function isQuantitative(value: string): boolean {
  return /\d/.test(value);
}

/**
 * 팩 목차 문구를 **원문 그대로** 인용한다(예: `"①"` → "① 한 문장 회사 정의와 80~120자 요약").
 * 항목 이름·글자 수를 여기서 다시 쓰지 않기 위한 조회 함수다.
 */
export function pressKitSection(marker: string): string {
  return PRESS_KIT_SECTIONS.find((s) => s.startsWith(marker)) ?? marker;
}

/**
 * GEO 파일명 규칙 검사 — 규칙 문자열({@link GEO_ASSET_RULES.filenamePattern})에서
 * **토큰 수와 확장자 유무만 끌어내** 판정한다. 자릿수·확장자 목록을 여기서 새로 정하지 않는다.
 *
 * 금지 예(`KakaoTalk_2026….jpg`·`스크린샷.png`)는 하이픈 토큰이 부족해 자동으로 걸린다.
 */
export function followsAssetFilenameRule(url: string | undefined): boolean {
  if (!url) return false;
  const basename = (url.split(/[?#]/)[0].split("/").pop() ?? "").trim();
  const dot = basename.lastIndexOf(".");
  if (dot <= 0 || dot === basename.length - 1) return false; // 확장자가 없다
  const pattern = GEO_ASSET_RULES.filenamePattern;
  const requiredTokens = pattern.slice(0, pattern.lastIndexOf(".")).split("-").length;
  const name = basename.slice(0, dot);
  const tokens = name.split("-").filter((t) => t.trim().length > 0);
  if (tokens.length < requiredTokens) return false;
  // 규칙 문자열을 그대로 붙여 넣었거나(대괄호 잔존) 공백·미확정 표기가 남으면 규칙 미충족이다.
  return !/[[\]\s]/.test(name) && !hasPlaceholder(basename);
}

/** 목표치 대비 비례 배점. */
function proportional(max: number, done: number, target: number): number {
  if (target <= 0) return max;
  return Math.round((max * Math.min(done, target)) / target);
}

/** 만점이면 `reason`을 아예 달지 않는다(화면이 "미충족 목록"으로 바로 걸러 쓴다). */
function item(
  key: CompletenessKey,
  label: string,
  max: number,
  earned: number,
  reason: string,
): CompletenessItem {
  return earned >= max ? { key, label, earned, max } : { key, label, earned, max, reason };
}

/** 비어 있는 것과 미확정 표기가 남은 것은 다음 행동이 다르므로 문구를 나눈다. */
function fillReason(text: string | undefined, whenEmpty: string, subject: string, points: number): string {
  return hasPlaceholder(text)
    ? `${subject}에 남은 미확정 표기(${WRITING_RULES.unverifiablePlaceholder} 등)를 실제 내용으로 바꾸면 ${points}점이 오릅니다.`
    : whenEmpty;
}

/* ── 채점 ────────────────────────────────────────────────────── */

/** 항목별 점수와 미충족 사유. 화면은 이 결과를, DB는 `score`만 쓴다. */
export function scoreMediaKit(kit: MediaKitScorable): MediaKitCompleteness {
  const items: CompletenessItem[] = [];

  /*
   * ① 한 문장 정의 — 팩 목차의 첫 항목이자 기자가 리드에 그대로 옮겨 쓰는 문장이다.
   * 글자 수 조건은 걸지 않는다(팩 문구는 안내로만 노출) — 새 수치 규범을 만들지 않기 위함이다.
   */
  const oneLinerFilled = isFilled(kit.oneLiner);
  items.push(
    item(
      "oneLiner",
      "한 문장 정의",
      POINTS.oneLiner,
      oneLinerFilled ? POINTS.oneLiner : 0,
      fillReason(
        kit.oneLiner,
        `프레스킷 목차 "${pressKitSection("①")}"가 비어 있습니다 — 회사를 한 문장으로 정의하면 ${POINTS.oneLiner}점이 오릅니다.`,
        "한 문장 정의",
        POINTS.oneLiner,
      ),
    ),
  );

  /* 회사 소개 — 프레스킷과 보도자료가 단일 소스로 공유하는 문단이라 존재 자체에 8점. */
  const boilerplateFilled = isFilled(kit.boilerplate);
  items.push(
    item(
      "boilerplate",
      "회사 소개(보일러플레이트)",
      POINTS.boilerplate,
      boilerplateFilled ? POINTS.boilerplate : 0,
      fillReason(
        kit.boilerplate,
        `표준 회사 소개문을 한 문단 작성하면 ${POINTS.boilerplate}점이 오릅니다.`,
        "회사 소개문",
        POINTS.boilerplate,
      ),
    ),
  );

  /* 길이는 존재와 별개로 채점한다 — 있는데 3줄짜리면 기자가 그대로 쓸 수 없다. */
  const { boilerplateWordMin: wordMin, boilerplateWordMax: wordMax } = WRITING_RULES;
  const words = boilerplateFilled ? countWords(kit.boilerplate ?? "") : 0;
  const lengthOk = boilerplateFilled && words >= wordMin && words <= wordMax;
  items.push(
    item(
      "boilerplateLength",
      "회사 소개 분량",
      POINTS.boilerplateLength,
      lengthOk ? POINTS.boilerplateLength : 0,
      !boilerplateFilled
        ? `회사 소개문을 먼저 채우고 ${wordMin}~${wordMax}단어로 맞추면 ${POINTS.boilerplateLength}점이 오릅니다.`
        : `회사 소개문이 ${words}단어입니다 — ${wordMin}~${wordMax}단어로 ${words < wordMin ? "늘리면" : "줄이면"} ${POINTS.boilerplateLength}점이 오릅니다.`,
    ),
  );

  /* 핵심 메시지 — 기사 한 줄 요약의 원재료라 배점이 가장 크다. */
  const keyMessageCount = kit.keyMessages.filter((m) => isFilled(m)).length;
  const keyMessageEarned = proportional(
    POINTS.keyMessages,
    keyMessageCount,
    COMPLETENESS_TARGETS.keyMessages,
  );
  items.push(
    item(
      "keyMessages",
      "핵심 메시지",
      POINTS.keyMessages,
      keyMessageEarned,
      `핵심 메시지 ${keyMessageCount}/${COMPLETENESS_TARGETS.keyMessages}개 — 미확정 표기 없이 ${COMPLETENESS_TARGETS.keyMessages - keyMessageCount}개를 더 채우면 ${POINTS.keyMessages - keyMessageEarned}점이 오릅니다.`,
    ),
  );

  /* 팩트시트 — 라벨과 값이 모두 있어야 한 항목으로 센다. */
  const validFacts = kit.factSheet.filter((f) => isFilled(f.label) && isFilled(f.value));
  const factEarned = proportional(POINTS.factSheet, validFacts.length, COMPLETENESS_TARGETS.factSheet);
  items.push(
    item(
      "factSheet",
      "팩트시트",
      POINTS.factSheet,
      factEarned,
      `팩트시트 ${validFacts.length}/${COMPLETENESS_TARGETS.factSheet}개 — 라벨과 값을 채운 항목을 ${COMPLETENESS_TARGETS.factSheet - validFacts.length}개 더 추가하면 ${POINTS.factSheet - factEarned}점이 오릅니다.`,
    ),
  );

  /*
   * 수치의 출처 충족률 — 스키마에만 있고 아무도 쓰지 않던 `factSheet[].source`를 처음 소비한다.
   * 근거: 팩의 L4(정량 표현에는 출처 병기)와 GEO 원칙("AI는 검증 가능한 수치를 인용한다").
   * 수치가 아예 없는 팩트시트는 0점이다 — 숫자를 안 쓰면 만점이 되는 우회를 만들지 않는다.
   */
  const quantFacts = validFacts.filter((f) => isQuantitative(f.value));
  const sourcedCount = quantFacts.filter((f) => isFilled(f.source)).length;
  const sourceEarned =
    quantFacts.length === 0 ? 0 : proportional(POINTS.factSource, sourcedCount, quantFacts.length);
  items.push(
    item(
      "factSource",
      "수치 항목 출처",
      POINTS.factSource,
      sourceEarned,
      quantFacts.length === 0
        ? `팩트시트에 검증 가능한 수치가 없습니다 — 수치 항목을 출처와 함께 추가하면 ${POINTS.factSource}점이 오릅니다.`
        : `수치 항목 ${quantFacts.length}개 중 ${quantFacts.length - sourcedCount}개에 출처가 없습니다 — 출처를 채우면 ${POINTS.factSource - sourceEarned}점이 오릅니다.`,
    ),
  );

  const narrativeFilled = isFilled(kit.narrative);
  items.push(
    item(
      "narrative",
      "스토리",
      POINTS.narrative,
      narrativeFilled ? POINTS.narrative : 0,
      fillReason(
        kit.narrative,
        `창업 배경과 주요 연혁을 담은 스토리를 작성하면 ${POINTS.narrative}점이 오릅니다.`,
        "스토리",
        POINTS.narrative,
      ),
    ),
  );

  const spokespersonFilled = isFilled(kit.spokesperson);
  items.push(
    item(
      "spokesperson",
      "대표 프로필",
      POINTS.spokesperson,
      spokespersonFilled ? POINTS.spokesperson : 0,
      fillReason(
        kit.spokesperson,
        `대표 프로필(성명·직책·약력)을 채우면 ${POINTS.spokesperson}점이 오릅니다.`,
        "대표 프로필",
        POINTS.spokesperson,
      ),
    ),
  );

  const quoteCount = kit.quotes.filter((q) => isFilled(q)).length;
  const quoteEarned = proportional(POINTS.quotes, quoteCount, COMPLETENESS_TARGETS.quotes);
  items.push(
    item(
      "quotes",
      "인용문",
      POINTS.quotes,
      quoteEarned,
      `인용문 ${quoteCount}/${COMPLETENESS_TARGETS.quotes}개 — 실명·직책이 붙은 인용문을 ${COMPLETENESS_TARGETS.quotes - quoteCount}개 더 채우면 ${POINTS.quotes - quoteEarned}점이 오릅니다.`,
    ),
  );

  /*
   * ⑥ 비주얼 자산 — 등록 자체보다 **GEO 3규칙(파일명·Alt·캡션) 충족률**을 본다.
   * 규칙은 `GEO_ASSET_RULES`가 정본이고, 건당 3검사의 비율 배점이라 1건만 제대로 올려도 만점이다
   * (많이 올릴수록 불리해지지 않도록 목표치가 아니라 **비율**로 센다 — 수치 출처 항목과 같은 방식).
   */
  const visuals = (kit.visuals ?? []).filter((vz) => isFilled(vz.label));
  const visualChecks = [
    { label: "파일명 규칙", ok: (vz: MediaKitVisual) => followsAssetFilenameRule(vz.url) },
    { label: "Alt 텍스트", ok: (vz: MediaKitVisual) => isFilled(vz.alt) },
    { label: "캡션", ok: (vz: MediaKitVisual) => isFilled(vz.caption) },
  ];
  const visualTotal = visuals.length * visualChecks.length;
  const visualPassed = visuals.reduce(
    (sum, vz) => sum + visualChecks.filter((c) => c.ok(vz)).length,
    0,
  );
  const visualEarned =
    visuals.length === 0 ? 0 : proportional(POINTS.visuals, visualPassed, visualTotal);
  const weakestVisualRules = visualChecks
    .filter((c) => visuals.some((vz) => !c.ok(vz)))
    .map((c) => c.label);
  items.push(
    item(
      "visuals",
      "비주얼 자산",
      POINTS.visuals,
      visualEarned,
      visuals.length === 0
        ? `"${pressKitSection("⑥")}"가 비어 있습니다 — 자산 ${COMPLETENESS_TARGETS.visuals}건을 파일명(${GEO_ASSET_RULES.filenamePattern})·Alt·캡션과 함께 등록하면 ${POINTS.visuals}점이 오릅니다.`
        : `비주얼 ${visuals.length}건의 규칙 충족 ${visualPassed}/${visualTotal} — ${weakestVisualRules.join("·")}을(를) 채우면 ${POINTS.visuals - visualEarned}점이 오릅니다.`,
    ),
  );

  /*
   * ⑦ 최근 보도 — 팩에 건수 규정이 없어 "1건 이상"만 문턱으로 둔다. 매체명과 제목이 모두 있어야
   * 기자가 확인할 수 있으므로 둘 다 채워진 항목만 센다(링크는 권장이지 필수 규정이 아니다).
   */
  const coverage = (kit.coverage ?? []).filter((c) => isFilled(c.outlet) && isFilled(c.title));
  const coverageEarned = proportional(POINTS.coverage, coverage.length, COMPLETENESS_TARGETS.coverage);
  items.push(
    item(
      "coverage",
      "최근 보도",
      POINTS.coverage,
      coverageEarned,
      `"${pressKitSection("⑦")}"가 비어 있습니다 — 실제로 확인한 보도를 매체명·제목과 함께 ${COMPLETENESS_TARGETS.coverage}건 등록하면 ${POINTS.coverage}점이 오릅니다.`,
    ),
  );

  /* ⑨ 자산 사용 규정 — 필수 4항은 `ASSET_POLICY_ITEMS`가 정본이다. 1항씩 부분 점수. */
  const policy = kit.assetPolicy ?? {};
  const policyMissing = ASSET_POLICY_KEYS.map((key, idx) => ({
    filled: isFilled(policy[key]),
    label: ASSET_POLICY_ITEMS[idx] ?? key,
  }));
  const policyFilled = policyMissing.filter((p) => p.filled).length;
  const policyEarned = proportional(POINTS.assetPolicy, policyFilled, ASSET_POLICY_ITEMS.length);
  items.push(
    item(
      "assetPolicy",
      "자산 사용 규정",
      POINTS.assetPolicy,
      policyEarned,
      `자산 사용 규정 ${policyFilled}/${ASSET_POLICY_ITEMS.length}항 — ${policyMissing
        .filter((p) => !p.filled)
        .map((p) => p.label)
        .join(" · ")}을(를) 채우면 ${POINTS.assetPolicy - policyEarned}점이 오릅니다.`,
    ),
  );

  const contactFilled = isFilled(kit.contact);
  items.push(
    item(
      "contact",
      "언론 문의",
      POINTS.contact,
      contactFilled ? POINTS.contact : 0,
      fillReason(
        kit.contact,
        `언론 문의 담당자 연락처를 채우면 ${POINTS.contact}점이 오릅니다.`,
        "언론 문의",
        POINTS.contact,
      ),
    ),
  );

  /* 연락처가 있어도 이메일이 없으면 기자가 회신할 곳이 없다 — 팩 체크리스트 항목이다. */
  const emailOk = contactFilled && EMAIL_PATTERN.test(kit.contact ?? "");
  items.push(
    item(
      "contactEmail",
      "문의 이메일 형식",
      POINTS.contactEmail,
      emailOk ? POINTS.contactEmail : 0,
      `언론 문의에 기자가 바로 회신할 수 있는 이메일 주소를 포함하면 ${POINTS.contactEmail}점이 오릅니다.`,
    ),
  );

  /*
   * 균형 보정 — 한 축만 깊게 판 킷보다 모든 축이 최소한 채워진 킷이 기자에게 쓸모 있다
   * (팩: 프레스킷은 문서 한 개가 아니라 필요한 자산을 다 찾을 수 있는 허브).
   * 최소 수준은 "축마다 유효한 값 1개" — 보너스의 문턱을 목표치까지 올리면 사실상 중복 감점이 된다.
   *
   * ⚠️ v2 신규 4섹션은 **축에 넣지 않는다.** 넣으면 기존 킷이 신규 배점(=신규 항목 점수)과
   *    보정 점수를 동시에 잃어 이중 감점이 된다. 대신 보정 자체를 10 → 7점으로 낮췄다.
   */
  const axes: Array<{ label: string; ok: boolean }> = [
    { label: "회사 소개", ok: boilerplateFilled },
    { label: "핵심 메시지", ok: keyMessageCount >= 1 },
    { label: "팩트시트", ok: validFacts.length >= 1 },
    { label: "스토리", ok: narrativeFilled },
    { label: "대표 프로필", ok: spokespersonFilled },
    { label: "인용문", ok: quoteCount >= 1 },
    { label: "언론 문의", ok: contactFilled },
  ];
  const missingAxes = axes.filter((a) => !a.ok).map((a) => a.label);
  items.push(
    item(
      "balance",
      "균형 보정",
      POINTS.balance,
      missingAxes.length === 0 ? POINTS.balance : 0,
      `비어 있는 축(${missingAxes.join("·")})을 하나씩만 채워도 균형 보정 ${POINTS.balance}점을 한 번에 받습니다.`,
    ),
  );

  return { score: items.reduce((sum, i) => sum + i.earned, 0), items };
}

/** DB에 저장하는 0~100 점수. 스키마가 숫자 하나만 받으므로 채점 결과를 좁혀 준다. */
export function computeCompleteness(kit: MediaKitScorable): number {
  return scoreMediaKit(kit).score;
}

/** 화면·프롬프트용 미충족 목록(점수 손실이 큰 순). */
export function unmetItems(report: MediaKitCompleteness): CompletenessItem[] {
  return report.items
    .filter((i) => i.earned < i.max)
    .sort((a, b) => b.max - b.earned - (a.max - a.earned));
}
