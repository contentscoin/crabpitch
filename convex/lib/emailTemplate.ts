/**
 * 기자 배포 메일 프레임 — journalist-outreach-email 스킬의 6블록 구조를 코드로 흡수.
 * [제목] [개인화 훅] [핵심 3줄] [인용문] [자료] [CTA + 수신거부(필수)]
 */

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
}

export interface JournalistContext {
  // ⚠️ 실명은 앱 초안에 저장하지 않는다. 실제 발송 시점(Gmail)에서만 수신자 실명을 주입한다.
  beatPrimary: string;
  topReferenceTitle?: string;
}

const OPT_OUT =
  "본 메일 수신을 원치 않으시면 회신으로 '수신거부'라 남겨주세요. 즉시 명단에서 제외하겠습니다.";

// beat별 앵글 조정 (journalist-outreach-email 표)
function beatAngle(beat: string, ctx: EmailContext): string {
  const b = beat.toLowerCase();
  if (b.includes("투자") || b.includes("벤처") || b.includes("핀테크"))
    return `${ctx.bodyFact} 이번 라운드의 의미와 성장 지표를 중심으로 정리했습니다.`;
  if (b.includes("ai") || b.includes("데이터") || b.includes("소프트웨어") || b.includes("제품"))
    return `${ctx.bodyFact} 기술 차별점과 사용성 관점에서 자료를 준비했습니다.`;
  if (b.includes("유통") || b.includes("커머스"))
    return `${ctx.bodyFact} 판매·입점·소비 트렌드 관점의 자료를 함께 드립니다.`;
  return ctx.bodyFact;
}

export function buildEmailDraft(
  email: EmailContext,
  j: JournalistContext,
): { subject: string; body: string } {
  const subject = `[${email.companyName}] ${truncate(email.headline, 22)}`;

  const hook = j.topReferenceTitle
    ? `기자님의 '${truncate(j.topReferenceTitle, 26)}' 기사 잘 보았습니다. 관련해 먼저 전해드릴 소식이 있습니다.`
    : `${j.beatPrimary} 분야를 취재하시는 기자님께 먼저 전해드릴 소식이 있습니다.`;

  const angle = beatAngle(j.beatPrimary, email);

  const quoteBlock = email.quote
    ? `\n${email.spokesTitle ?? "대표"} ${email.spokesName ?? ""} "${email.quote}"라고 밝혔습니다.\n`
    : "";

  const linkBlock =
    email.links && email.links.length
      ? "\n" + email.links.map((l) => `· 자료: ${l}`).join("\n") + "\n"
      : "";

  const body = [
    `기자님, 안녕하세요. ${email.senderName}입니다.`,
    hook,
    "",
    `${email.companyName}은(는) ${email.headline}. ${angle}`,
    email.background ? `${email.background}. ${email.meaning ?? ""}`.trim() : "",
    quoteBlock.trim(),
    linkBlock.trim(),
    "추가 자료나 대표 인터뷰가 필요하시면 편하게 회신 주세요. 바쁘신 데 읽어주셔서 감사합니다.",
    "",
    `${email.senderName} 드림`,
    email.contact ? `${email.contact} / ${email.companyName}` : email.companyName,
    "",
    "──",
    OPT_OUT,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

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
  { id: "standard", label: "기본 6블록", description: "호칭→후킹→핵심→수치→자료→수신거부. 대부분의 소식에 무난합니다." },
  { id: "data", label: "데이터 중심", description: "수치를 맨 앞에 팩트시트로 제시. 투자·실적·지표 소식에 적합합니다." },
  { id: "story", label: "스토리형", description: "문제→해결 서사로 시작. 창업 스토리·신제품 배경 소개에 적합합니다." },
  { id: "brief", label: "초간결", description: "4~5줄 요약형. 바쁜 출입처·속보성 소식에 적합합니다." },
];

export function isEmailTemplatePresetId(v: string): v is EmailTemplatePresetId {
  return EMAIL_TEMPLATE_PRESETS.some((p) => p.id === v);
}

function personalHook(email: EmailContext, j: JournalistContext): string {
  return j.topReferenceTitle
    ? `기자님의 '${truncate(j.topReferenceTitle, 26)}' 기사 잘 보았습니다. 관련해 먼저 전해드릴 소식이 있습니다.`
    : `${j.beatPrimary} 분야를 취재하시는 기자님께 먼저 전해드릴 소식이 있습니다.`;
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

  if (preset === "data") {
    const subject = `[${email.companyName}] ${truncate(email.bodyFact, 24)}`;
    const body = assemble([
      `기자님, 안녕하세요. ${email.senderName}입니다.`,
      hook,
      "",
      "핵심만 먼저 정리해 드립니다.",
      `· 무엇: ${email.headline}`,
      `· 수치: ${email.bodyFact}`,
      email.background ? `· 배경: ${email.background}` : undefined,
      email.meaning ? `· 의미: ${email.meaning}` : undefined,
      quote || undefined,
      links || undefined,
      "",
      "상세 데이터·추가 수치가 필요하시면 바로 보내드리겠습니다.",
      "",
      signature(email),
    ]);
    return { subject, body };
  }

  if (preset === "story") {
    const subject = `[${email.companyName}] ${truncate(email.headline, 22)}`;
    const body = assemble([
      `기자님, 안녕하세요. ${email.senderName}입니다.`,
      hook,
      "",
      email.background
        ? `${email.background}. 저희는 이 문제에서 출발했습니다.`
        : `${email.companyName}이(가) 풀려는 문제에서 출발한 이야기입니다.`,
      `그 결과가 이번 소식입니다 — ${email.headline}. ${email.bodyFact}`,
      email.meaning ? `${email.meaning}` : undefined,
      quote || undefined,
      links || undefined,
      "",
      "이 과정의 뒷이야기나 대표 인터뷰가 필요하시면 편하게 회신 주세요.",
      "",
      signature(email),
    ]);
    return { subject, body };
  }

  // brief — 초간결이지만 개인화 후킹 한 줄은 유지한다
  const subject = `[${email.companyName}] ${truncate(email.headline, 20)} (자료 있음)`;
  const body = assemble([
    `기자님, 안녕하세요. ${email.senderName}입니다.`,
    hook,
    `${email.companyName}: ${email.headline}. ${email.bodyFact}`,
    quote || undefined,
    links || undefined,
    "필요하시면 상세 자료·인터뷰 바로 지원하겠습니다.",
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
  { key: "회사명", description: "프로필의 회사/브랜드명" },
  { key: "발신자", description: "보내는 사람 이름" },
  { key: "헤드라인", description: "보도자료 헤드라인 1안" },
  { key: "핵심수치", description: "숫자 근거 한 줄" },
  { key: "후킹", description: "기자별 개인화 후킹 문장(최근 기사·비트 기반 자동 생성)" },
  { key: "인용문", description: "대표 인용문(없으면 빈칸)" },
  { key: "자료링크", description: "자료 링크 목록(없으면 빈칸)" },
  { key: "연락처", description: "프로필의 연락 이메일" },
  { key: "비트", description: "기자의 주 출입처(beat)" },
  { key: "최근기사", description: "기자의 최근 기사 제목(없으면 빈칸)" },
];

export function renderCustomTemplate(
  subjectTemplate: string,
  bodyTemplate: string,
  email: EmailContext,
  j: JournalistContext,
): { subject: string; body: string } {
  const vars: Record<string, string> = {
    회사명: email.companyName,
    발신자: email.senderName,
    헤드라인: email.headline,
    핵심수치: email.bodyFact,
    후킹: personalHook(email, j),
    인용문: quoteLine(email),
    자료링크: linkLines(email),
    연락처: email.contact ?? "",
    비트: j.beatPrimary,
    최근기사: j.topReferenceTitle ?? "",
  };

  const render = (tpl: string) =>
    tpl.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, key: string) =>
      key in vars ? vars[key]! : whole,
    );

  let subject = render(subjectTemplate).trim();
  if (!subject) subject = `[${email.companyName}] ${truncate(email.headline, 22)}`;

  let body = render(bodyTemplate).replace(/\n{3,}/g, "\n\n").trim();
  // 컴플라이언스 강제: 호칭·수신거부
  if (!body.includes("기자님")) {
    body = `기자님, 안녕하세요. ${email.senderName}입니다.\n\n${body}`;
  }
  if (!hasOptOut(body)) {
    body = `${body}\n\n──\n${OPT_OUT}`;
  }
  return { subject, body };
}

export function hasOptOut(body: string): boolean {
  return body.includes("수신거부");
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
