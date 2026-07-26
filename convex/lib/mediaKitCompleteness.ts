/**
 * 미디어킷 완성도 **가중 배점 v1**.
 *
 * 기존 산출은 7항목 동일가중(각 14점)이라 두 가지를 못 했다.
 *  ① 무게 구분 — 핵심 메시지와 연락처가 같은 값이었다.
 *  ② 안내 — 점수만 던지고 "무엇을 채우면 오르는지"를 말하지 않았다.
 * 그래서 항목별 배점과 함께 **미충족 사유(`reason`)를 항상 동반 반환**한다. 배점 강화로
 * 기존 킷의 표시 % 가 떨어지는 체감(로드맵 리스크 12)을 상쇄하는 건 이 사유 문구다.
 *
 * 설계 원칙
 *  · 부분 점수 — 개수 기준 항목(핵심 메시지·팩트시트·인용문)은 목표치 대비 비례 배점이다.
 *    전부-아니면-0은 "1개 채워도 그대로 0"이라 사용자가 다음 행동을 잡지 못한다.
 *  · placeholder는 미완성 — 팩 규범상 배포본에 미확정 표기가 남으면 위반이다. 저장만 하고
 *    점수를 챙기는 우회를 막는다.
 *  · 규범 수치는 `pressGuide`가 정본 — 단어 수·placeholder 문자열을 여기서 복제하지 않는다.
 *
 * 스키마는 건드리지 않는다. DB에는 여전히 `completeness: number` 하나만 저장하고,
 * 항목별 사유는 화면이 이 순수 함수를 직접 호출해 얻는다.
 */

import { WRITING_RULES } from "./pressGuide";

/* ── 입출력 타입 ─────────────────────────────────────────────── */

export interface MediaKitFactItem {
  label: string;
  value: string;
  source?: string;
}

/** 채점 입력 — `mediaKits` 문서에서 점수에 쓰이는 필드만 추린 형태. */
export interface MediaKitScorable {
  boilerplate?: string;
  keyMessages: readonly string[];
  factSheet: readonly MediaKitFactItem[];
  narrative?: string;
  spokesperson?: string;
  quotes: readonly string[];
  contact?: string;
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
  | "balance";

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
 * 핵심 메시지(15)가 최상단, 형식 검증인 길이·이메일 형식(각 5)이 최하단.
 */
const POINTS = {
  boilerplate: 10,
  boilerplateLength: 5,
  keyMessages: 15,
  factSheet: 10,
  factSource: 10,
  narrative: 10,
  spokesperson: 10,
  quotes: 10,
  contact: 5,
  contactEmail: 5,
  balance: 10,
} as const;

export const COMPLETENESS_MAX: number = Object.values(POINTS).reduce((a, b) => a + b, 0);

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
} as const;

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

  /* 회사 소개 — 프레스킷과 보도자료가 단일 소스로 공유하는 문단이라 존재 자체에 10점. */
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
