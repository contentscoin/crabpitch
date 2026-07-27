/**
 * 기자 배포 메일 프레임 — journalist-outreach-email 스킬의 구조를 코드로 흡수한 **7블록**.
 *
 * [제목] [엠바고(있을 때만 최상단)] [개인화 훅] [핵심(beat 재프레이밍)] [인용문] [자료]
 * [CTA(정확히 1개, 매체 유형 분기) + 수신거부(항상 마지막)]
 *
 * 컴플라이언스 불변식(프리셋·커스텀 템플릿 전 경로 공통)
 *  - 수신거부 문구는 **항상 마지막 블록**
 *  - 행동 요청(CTA)은 **정확히 1개**
 *  - 엠바고가 있으면 최상단과 자료 블록에 **이중 표기**
 *  - 기자 실명은 초안에 저장하지 않는다 — 발송 시점 `personalizeForSend`만 주입
 */

import type { BeatWeight, ReferenceArticle } from "./opencrabMap";
import type { OutletCategory } from "./packSync";

export interface EmailContext {
  companyName: string;
  senderName: string;
  headline: string; // 핵심 사건
  bodyFact: string; // 숫자 근거 한 줄
  background?: string;
  meaning?: string;
  quote?: string;
  spokesTitle?: string; // 대표 직함
  spokesName?: string; // 대표명
  links?: string[];
  contact?: string;
  /** 엠바고 해제 시각(ms) — 있으면 최상단·자료 블록 이중 표기 */
  embargoAt?: number;
  /** 캠페인 주제 태그 — 후킹에 쓸 기사를 고를 때 겹침 판정에 사용 */
  topicTags?: string[];
  /** 판정 기준 시각(테스트 주입용). 미지정 시 Date.now() */
  now?: number;
}

export interface JournalistContext {
  // ⚠️ 실명은 앱 초안에 저장하지 않는다. 실제 발송 시점(Gmail)에서만 수신자 실명을 주입한다.
  beatPrimary: string;
  topReferenceTitle?: string;
  beatSecondary?: string[];
  beatDistribution?: BeatWeight[];
  /** naver_oid 정적 매핑 결과 — CTA 분기 */
  outletCategory?: OutletCategory;
  /** 근거 기사 다건(최대 3) — 후킹 선택 대상 */
  referenceArticles?: ReferenceArticle[];
}

const OPT_OUT =
  "본 메일 수신을 원치 않으시면 회신으로 '수신거부'라 남겨주세요. 즉시 명단에서 제외하겠습니다.";

/**
 * 기사 인용 신선도 상한. 이보다 오래된 기사는 날짜·제목을 인용하지 않고
 * generic 후킹으로 **강등**한다 — 팩 데이터가 단일 크롤 시점에 편중돼 있어
 * "최근 기사 잘 봤습니다"가 몇 달 전 기사를 가리키면 역효과다.
 */
export const HOOK_ARTICLE_MAX_AGE_DAYS = 180;
const HOOK_ARTICLE_MAX_AGE_MS = HOOK_ARTICLE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/* ── 7블록 공통 헬퍼 (standard·프리셋·커스텀이 모두 승계) ──── */

/** 엠바고 최상단 1줄. 없으면 빈 문자열. */
export function embargoLine(embargoAt: number | undefined): string {
  if (!embargoAt) return "";
  const d = new Date(embargoAt);
  const stamp = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `[엠바고] ${stamp} 이후 보도 요청`;
}

/** 보도자료에 실제로 등록된 자료가 있는가 — CTA가 자산 보유를 단언해도 되는지 판정. */
function hasAssets(email: EmailContext): boolean {
  return (email.links ?? []).filter(Boolean).length > 0;
}

/** 자료 블록에 덧붙는 엠바고 재고지(이중 표기). */
function embargoAssetNote(embargoAt: number | undefined): string {
  return embargoAt ? "· 위 자료는 엠바고 해제 시각 이후 사용 가능합니다." : "";
}

/**
 * 후킹에 쓸 기사 1건을 고른다.
 * 우선순위: ① 캠페인 태그와 topic이 겹치는 기사 ② 최신 기사 ③ 첫 기사
 * 신선도 상한을 넘긴 기사는 후보에서 제외한다(generic 폴백으로 강등).
 */
export function pickHookArticle(
  articles: ReferenceArticle[] | undefined,
  topicTags: string[] | undefined,
  now: number,
): ReferenceArticle | undefined {
  if (!articles || articles.length === 0) return undefined;
  const fresh = articles.filter(
    (a) => a.publishedAt === undefined || now - a.publishedAt <= HOOK_ARTICLE_MAX_AGE_MS,
  );
  if (fresh.length === 0) return undefined;

  const tags = (topicTags ?? []).map((t) => t.trim()).filter(Boolean);
  if (tags.length) {
    const overlapping = fresh.filter((a) => {
      const hay = `${a.topic ?? ""} ${a.title}`;
      return tags.some((t) => hay.includes(t));
    });
    if (overlapping.length) {
      return overlapping.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))[0];
    }
  }
  return fresh.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))[0];
}

/**
 * 매체 유형별 CTA — **정확히 1개만** 반환한다.
 * 미등록 매체는 기본(인터뷰 제안)으로 폴백한다. "완전 분기"가 아니라
 * 확인된 naver_oid만 분기한다는 점을 과장하지 않는다.
 */
export function ctaLine(
  category: OutletCategory | undefined,
  hasAssets = false,
): string {
  // ⚠️ 자료를 "준비돼 있다"고 단언하려면 실제로 등록된 자료가 있어야 한다.
  // 없는 자산을 약속하면 회신이 온 순간 신뢰를 잃는다 — 회신 응대(`promisedLinks`)에
  // 적용한 "약속한 자료만" 원칙을 발송 경로에도 똑같이 적용한다.
  if (!hasAssets) {
    switch (category) {
      case "newswire":
        return "필요하신 원문 자료와 이미지를 바로 준비해 보내드리겠습니다. 회신 주세요.";
      case "broadcast":
        // ⚠️ 여기서 "B-roll"을 약속하지 않는다. 방송 기자가 B-roll이라고 할 때 기대하는 것은
        //    편집 가능한 실사 촬영본이고, 그건 보유 여부를 시스템이 알 수 없다.
        return "촬영 협조나 1페이저·영상 소스가 필요하시면 회신 주세요. 준비해 보내드리겠습니다.";
      case "it":
        return "기술 구조와 실측 데이터를 정리해 보내드리겠습니다. 필요하시면 회신 주세요.";
      case "economy":
        return "재무·성장 지표 상세 자료를 정리해 보내드리겠습니다. 회신 주세요.";
      default:
        return "대표 인터뷰를 원하시면 회신 주세요. 일정에 맞춰 준비하겠습니다.";
    }
  }

  switch (category) {
    case "newswire":
      return "원문 자료와 이미지가 준비돼 있습니다. 회신 주시면 바로 송부드리겠습니다.";
    case "broadcast":
      // 자료가 있어도 영상 소스 보유 여부까지는 알 수 없으므로 별도로 여쭙는다.
      return "1페이저와 관련 자료가 준비돼 있습니다. 영상 소스가 필요하시면 회신 주세요.";
    case "it":
      return "기술 구조와 실측 데이터를 정리해 두었습니다. 필요하시면 회신 주세요.";
    case "economy":
      return "재무·성장 지표 상세 자료를 준비했습니다. 회신 주시면 바로 송부드리겠습니다.";
    default:
      return "대표 인터뷰를 원하시면 회신 주세요. 일정에 맞춰 준비하겠습니다.";
  }
}

/**
 * beat별 앵글 — 같은 사실을 그 기자가 평소 쓰는 관점으로 다시 말한다.
 *
 * 판정은 **주력 beat 우선**이다. beat 분포가 있으면 비중이 가장 큰 것부터 보고,
 * 없으면 beatPrimary → beatSecondary 순으로 본다. 어디에도 안 걸리면 사실만 전한다
 * (억지 앵글은 티가 나고 역효과다).
 */
const BEAT_ANGLES: Array<{ match: RegExp; angle: (fact: string) => string }> = [
  {
    match: /투자|벤처|스타트업|ir|펀딩/i,
    angle: (f) => `${f} 이번 라운드의 의미와 성장 지표를 중심으로 정리했습니다.`,
  },
  {
    match: /핀테크|금융|결제|보험|은행/i,
    angle: (f) => `${f} 규제 대응과 사용자 보호 관점의 자료를 함께 드립니다.`,
  },
  {
    match: /ai|인공지능|데이터|소프트웨어|제품|it|테크|클라우드/i,
    angle: (f) => `${f} 기술 차별점과 사용성 관점에서 자료를 준비했습니다.`,
  },
  {
    match: /반도체|하드웨어|제조|부품/i,
    angle: (f) => `${f} 공정·수율과 공급망 관점의 수치를 정리했습니다.`,
  },
  {
    match: /유통|커머스|리테일|물류/i,
    angle: (f) => `${f} 판매·입점·소비 트렌드 관점의 자료를 함께 드립니다.`,
  },
  {
    match: /바이오|헬스|의료|제약/i,
    angle: (f) => `${f} 임상·인허가 단계와 검증 근거를 함께 정리했습니다.`,
  },
  {
    match: /게임|콘텐츠|미디어|엔터/i,
    angle: (f) => `${f} 이용자 반응과 콘텐츠 파이프라인 관점에서 준비했습니다.`,
  },
  {
    match: /모빌리티|자동차|배터리|에너지|환경/i,
    angle: (f) => `${f} 실증 데이터와 친환경 효과를 수치로 정리했습니다.`,
  },
  {
    match: /정책|규제|공공|행정/i,
    angle: (f) => `${f} 제도 변화와 산업 영향 관점의 배경 자료를 준비했습니다.`,
  },
];

export function beatAngleFor(beats: string[], fact: string): string {
  for (const beat of beats) {
    if (!beat) continue;
    const hit = BEAT_ANGLES.find((entry) => entry.match.test(beat));
    if (hit) return hit.angle(fact);
  }
  return fact;
}

/** 기자 컨텍스트에서 앵글 판정에 쓸 beat를 비중 순으로 뽑는다. */
function orderedBeats(j: JournalistContext): string[] {
  const fromDist = (j.beatDistribution ?? [])
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((d) => d.beat);
  return [...fromDist, j.beatPrimary, ...(j.beatSecondary ?? [])].filter(Boolean);
}

function beatAngle(j: JournalistContext, ctx: EmailContext): string {
  return beatAngleFor(orderedBeats(j), ctx.bodyFact);
}

/**
 * 7블록 표준 초안.
 * [제목] [엠바고] [후킹] [핵심] [인용문] [자료] [CTA 1개 + 수신거부]
 */
export function buildEmailDraft(
  email: EmailContext,
  j: JournalistContext,
): { subject: string; body: string } {
  const subject = `[${email.companyName}] ${truncate(email.headline, 22)}`;
  const angle = beatAngle(j, email);

  const body = assemble([
    embargoLine(email.embargoAt) || undefined,
    `기자님, 안녕하세요. ${email.senderName}입니다.`,
    personalHook(email, j),
    "",
    `${email.companyName}은(는) ${email.headline}. ${angle}`,
    email.background ? `${email.background}. ${email.meaning ?? ""}`.trim() : undefined,
    quoteLine(email) || undefined,
    linkLines(email) || undefined,
    embargoAssetNote(email.embargoAt) || undefined,
    "",
    // CTA는 정확히 1개 — 매체 유형별 분기(미등록 매체는 기본 인터뷰 제안)
    ctaLine(j.outletCategory, hasAssets(email)),
    "",
    signature(email),
  ]);

  return { subject, body };
}

/* ── 템플릿 프리셋 ────────────────────────────────────────────
 * 사용자가 캠페인에서 메일 골격을 고를 수 있게 4종 제공.
 * 모든 프리셋은 「기자님」 호칭·수신거부 문구를 반드시 포함한다.
 */

export type EmailTemplatePresetId = "standard" | "data" | "story" | "brief";

export const EMAIL_TEMPLATE_PRESETS: Array<{
  id: EmailTemplatePresetId;
  label: string;
  description: string;
}> = [
  { id: "standard", label: "기본 7블록", description: "호칭→후킹→핵심→인용→자료→행동요청→수신거부. 대부분의 소식에 무난합니다." },
  { id: "data", label: "데이터 중심", description: "수치를 맨 앞에 팩트시트로 제시. 투자·실적·지표 소식에 적합합니다." },
  { id: "story", label: "스토리형", description: "문제→해결 서사로 시작. 창업 스토리·신제품 배경 소개에 적합합니다." },
  { id: "brief", label: "초간결", description: "4~5줄 요약형. 바쁜 출입처·속보성 소식에 적합합니다." },
];

export function isEmailTemplatePresetId(v: string): v is EmailTemplatePresetId {
  return EMAIL_TEMPLATE_PRESETS.some((p) => p.id === v);
}

/**
 * 개인화 후킹.
 *
 * 우선순위
 *  ① 캠페인 태그와 겹치는 **최근** 기사 → 발행일까지 인용("지난 7월 15일 '…' 기사")
 *  ② 발행일을 모르는 기사 → 날짜를 주장하지 않고 제목만 인용
 *  ③ 신선도 상한을 넘었거나 기사가 없음 → beat 기반 generic 폴백(**강등**)
 *
 * 팩 데이터가 단일 크롤 시점에 편중돼 있어, 날짜 없는 "최근 기사" 주장이 몇 달 전
 * 기사를 가리키면 역효과다. 그래서 날짜를 아는 경우에만 날짜를 말한다.
 */
export function personalHook(email: EmailContext, j: JournalistContext): string {
  const now = email.now ?? Date.now();
  const article =
    pickHookArticle(j.referenceArticles, email.topicTags, now) ??
    (j.topReferenceTitle ? { title: j.topReferenceTitle } : undefined);

  if (article) {
    const title = truncate(article.title, 26);
    if (article.publishedAt !== undefined) {
      const d = new Date(article.publishedAt);
      return `지난 ${d.getMonth() + 1}월 ${d.getDate()}일 '${title}' 기사 잘 보았습니다. 관련해 먼저 전해드릴 소식이 있습니다.`;
    }
    return `기자님의 '${title}' 기사 잘 보았습니다. 관련해 먼저 전해드릴 소식이 있습니다.`;
  }
  return `${j.beatPrimary} 분야를 취재하시는 기자님께 먼저 전해드릴 소식이 있습니다.`;
}

function quoteLine(email: EmailContext): string {
  return email.quote
    ? `${email.spokesTitle ?? "대표"} ${email.spokesName ?? ""} "${email.quote}"라고 밝혔습니다.`.replace(/\s+/g, " ")
    : "";
}

function linkLines(email: EmailContext): string {
  return email.links && email.links.length
    ? email.links.map((l) => `· 자료: ${l}`).join("\n")
    : "";
}

function signature(email: EmailContext): string {
  return [
    `${email.senderName} 드림`,
    email.contact ? `${email.contact} / ${email.companyName}` : email.companyName,
    "",
    "──",
    OPT_OUT,
  ].join("\n");
}

function assemble(lines: Array<string | undefined>): string {
  return lines
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** 프리셋별 초안 생성. standard는 기존 buildEmailDraft와 동일 골격. */
export function buildEmailDraftWithPreset(
  preset: EmailTemplatePresetId,
  email: EmailContext,
  j: JournalistContext,
): { subject: string; body: string } {
  if (preset === "standard") return buildEmailDraft(email, j);

  const hook = personalHook(email, j);
  const quote = quoteLine(email);
  const links = linkLines(email);
  // 프리셋도 컴플라이언스 요소를 승계한다: 엠바고 최상단 표기 · CTA 정확히 1개 ·
  // 자료 블록 엠바고 재고지 · OPT_OUT 최종 블록(signature) · 후킹 신선도 강등(personalHook).
  // 본문 구조 자체의 완전 7블록 재설계는 2차(S8) — 발송 게이트(D-4)가 3경로에서 최종
  // 커버하므로 안전성 공백이 없다는 판단으로 1차에서는 컴플라이언스 요소만 승계한다.
  const embargo = embargoLine(email.embargoAt) || undefined;
  const embargoNote = embargoAssetNote(email.embargoAt) || undefined;
  const cta = ctaLine(j.outletCategory, hasAssets(email));
  // 핵심 블록의 beat 재프레이밍은 프리셋도 공유한다 — 프리셋이 다른 건 배치와 압축률이지
  // "그 기자의 관점으로 말한다"는 원칙이 아니다.
  const angle = beatAngle(j, email);

  if (preset === "data") {
    const subject = `[${email.companyName}] ${truncate(email.bodyFact, 24)}`;
    const body = assemble([
      embargo,
      `기자님, 안녕하세요. ${email.senderName}입니다.`,
      hook,
      "",
      "핵심만 먼저 정리해 드립니다.",
      `· 무엇: ${email.headline}`,
      `· 수치: ${email.bodyFact}`,
      email.background ? `· 배경: ${email.background}` : undefined,
      email.meaning ? `· 의미: ${email.meaning}` : undefined,
      "",
      angle,
      quote || undefined,
      links || undefined,
      embargoNote,
      "",
      cta,
      "",
      signature(email),
    ]);
    return { subject, body };
  }

  if (preset === "story") {
    const subject = `[${email.companyName}] ${truncate(email.headline, 22)}`;
    const body = assemble([
      embargo,
      `기자님, 안녕하세요. ${email.senderName}입니다.`,
      hook,
      "",
      email.background
        ? `${email.background}. 저희는 이 문제에서 출발했습니다.`
        : `${email.companyName}이(가) 풀려는 문제에서 출발한 이야기입니다.`,
      `그 결과가 이번 소식입니다 — ${email.headline}. ${angle}`,
      email.meaning ? `${email.meaning}` : undefined,
      quote || undefined,
      links || undefined,
      embargoNote,
      "",
      cta,
      "",
      signature(email),
    ]);
    return { subject, body };
  }

  // brief — 초간결이지만 개인화 후킹 한 줄은 유지한다
  const subject = `[${email.companyName}] ${truncate(email.headline, 20)} (자료 있음)`;
  const body = assemble([
    embargo,
    `기자님, 안녕하세요. ${email.senderName}입니다.`,
    hook,
    `${email.companyName}: ${email.headline}. ${angle}`,
    quote || undefined,
    links || undefined,
    embargoNote,
    cta,
    "",
    signature(email),
  ]);
  return { subject, body };
}

/* ── 커스텀 템플릿 ────────────────────────────────────────────
 * 사용자가 제목/본문을 직접 쓰되 {{자리표시자}}로 개인화 값을 받는다.
 * 수신거부·기자님 호칭은 렌더링 시 강제 보정한다(컴플라이언스).
 */

export const TEMPLATE_PLACEHOLDERS: Array<{ key: string; description: string }> = [
  { key: "수신거부", description: "표준 수신거부 안내 문구(생략해도 자동으로 덧붙습니다)" },
  { key: "엠바고", description: "엠바고 해제 시각 안내(설정된 경우에만 표시, 없으면 빈칸)" },
  { key: "매체CTA", description: "매체 유형에 맞춘 행동 요청 1문장(통신사·IT지·경제지·기본)" },
  { key: "회사명", description: "프로필의 회사/브랜드명" },
  { key: "발신자", description: "보내는 사람 이름" },
  { key: "헤드라인", description: "보도자료 헤드라인 1안" },
  { key: "핵심수치", description: "숫자 근거 한 줄" },
  { key: "후킹", description: "기자별 개인화 후킹 문장(근거 기사·발행일·비트 기반 자동 생성)" },
  { key: "인용문", description: "대표 인용문(없으면 빈칸)" },
  { key: "자료링크", description: "자료 링크 목록(없으면 빈칸)" },
  { key: "연락처", description: "프로필의 연락 이메일" },
  { key: "비트", description: "기자의 주 출입처(beat)" },
  { key: "최근기사", description: "후킹에 선택된 근거 기사 제목(오래됐거나 없으면 빈칸)" },
];

export function renderCustomTemplate(
  subjectTemplate: string,
  bodyTemplate: string,
  email: EmailContext,
  j: JournalistContext,
): { subject: string; body: string } {
  // 후킹에 실제로 선택된 기사 — {{최근기사}}가 후킹과 다른 기사를 가리키면 안 된다.
  // personalHook과 동일한 폴백 순서를 유지한다(다건 → 레거시 top_reference).
  const hookArticle =
    pickHookArticle(j.referenceArticles, email.topicTags, email.now ?? Date.now()) ??
    (j.topReferenceTitle ? { title: j.topReferenceTitle } : undefined);
  const vars: Record<string, string> = {
    수신거부: OPT_OUT,
    엠바고: embargoLine(email.embargoAt),
    매체CTA: ctaLine(j.outletCategory, hasAssets(email)),
    회사명: email.companyName,
    발신자: email.senderName,
    헤드라인: email.headline,
    핵심수치: email.bodyFact,
    후킹: personalHook(email, j),
    인용문: quoteLine(email),
    자료링크: linkLines(email),
    연락처: email.contact ?? "",
    비트: j.beatPrimary,
    // 신선도 상한을 넘긴 기사는 후킹에서 강등되므로 여기서도 비운다(불일치 방지).
    최근기사: hookArticle?.title ?? "",
  };

  const render = (tpl: string) =>
    tpl.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, key: string) =>
      key in vars ? vars[key]! : whole,
    );

  // 제목은 단일 라인이어야 한다({{자료링크}} 같은 멀티라인 값 삽입 대비).
  let subject = render(subjectTemplate).replace(/\s*\n+\s*/g, " ").trim();
  if (!subject) subject = `[${email.companyName}] ${truncate(email.headline, 22)}`;

  let body = render(bodyTemplate).replace(/\n{3,}/g, "\n\n").trim();

  // 컴플라이언스 강제 ①: 호칭 — personalizeForSend의 실명 주입 앵커("기자님,")와
  // 동일한 패턴이어야 발송 시 실명이 반드시 주입된다. "기자님의/기자님께" 같은
  // 부분 문자열만으로는 앵커가 없으므로 인사말을 붙인다.
  if (!/(^|\n)기자님,/.test(body)) {
    body = `기자님, 안녕하세요. ${email.senderName}입니다.\n\n${body}`;
  }

  // 개인화 보정: 기자별 자리표시자가 하나도 없으면 전 기자 동일 본문(대량발송)이
  // 되므로 인사말 뒤에 개인화 후킹을 자동 삽입한다.
  const PERSONAL_PLACEHOLDER = /\{\{\s*(후킹|최근기사|비트)\s*\}\}/;
  if (!PERSONAL_PLACEHOLDER.test(subjectTemplate) && !PERSONAL_PLACEHOLDER.test(bodyTemplate)) {
    const hook = personalHook(email, j);
    if (body.startsWith("기자님,")) {
      const nl = body.indexOf("\n");
      body = nl === -1 ? `${body}\n${hook}` : `${body.slice(0, nl + 1)}${hook}\n${body.slice(nl + 1)}`;
    } else {
      body = `${hook}\n\n${body}`;
    }
  }

  // 컴플라이언스 강제 ②: 기능하는 수신거부 안내가 없으면 표준 문구를 덧붙인다.
  if (!hasOptOut(body)) {
    body = `${body}\n\n──\n${OPT_OUT}`;
  }
  return { subject, body };
}

/**
 * 기능하는 수신거부 안내가 있는지 판정.
 * 단순 부분 문자열("수신거부")은 "수신거부 요청은 받지 않습니다" 같은 문장이나
 * 치환되지 않은 {{수신거부}} 리터럴도 통과시키므로, 표준 문구 포함 또는
 * "수신거부라(고) 남겨/회신/답장" 형태의 실행 가능한 안내 패턴만 인정한다.
 */
export function hasOptOut(body: string): boolean {
  return (
    body.includes(OPT_OUT) ||
    /['"“”‘’「」]?수신거부['"“”‘’「」]?\s*(라고|라|이라|로|으로)?\s*(남겨|회신|답장)/.test(body)
  );
}

/** 발송 직전: 초안의 '기자님' 인사에 실명 주입(DB 초안에는 실명을 저장하지 않음). */
export function personalizeForSend(body: string, journalistName: string): string {
  const name = journalistName.trim();
  if (!name) return body;
  if (body.startsWith("기자님,")) {
    return `${name} 기자님,` + body.slice("기자님,".length);
  }
  return body.replace(/(^|\n)기자님,/g, `$1${name} 기자님,`);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
