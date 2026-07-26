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
