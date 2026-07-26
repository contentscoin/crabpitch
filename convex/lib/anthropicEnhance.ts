/**
 * Anthropic 개인화 — 프롬프트/응답 파싱 (순수 TS, 키 없이도 테스트 가능).
 * 실호출은 aiActions.ts ("use node") 에서만 수행.
 */

export interface EnhanceEmailInput {
  subject: string;
  body: string;
  companyName: string;
  senderName: string;
  headline: string;
  beatPrimary: string;
  topReferenceTitle?: string;
}

export interface EnhanceEmailResult {
  subject: string;
  body: string;
}

export interface PolishPressInput {
  title: string;
  who?: string;
  newsValue?: string;
  numbers?: string;
  quote?: string;
  topicTags: string[];
  bodyHint?: string;
}

export interface PolishPressResult {
  title: string;
  headlines: string[];
  body: string;
}

/** 메일 개인화 시스템 프롬프트. */
export function emailEnhanceSystemPrompt(): string {
  return [
    "당신은 한국 스타트업 언론 홍보 카피라이터다.",
    "기자 배포용 메일을 더 자연스럽고 개인화되게 다듬는다.",
    "규칙:",
    "1) 수신자 호칭은 반드시 '기자님'만 사용한다. 실명·이메일을 넣지 않는다.",
    "2) 본문에 '수신거부' 문구를 반드시 유지한다.",
    "3) 제목은 25자 내외 뉴스형, [회사명] 접두를 유지해도 된다.",
    "4) 최근 기사 제목이 있으면 첫 문단에서 자연스럽게 언급한다.",
    "5) JSON만 출력: {\"subject\":\"...\",\"body\":\"...\"}",
  ].join("\n");
}

export function emailEnhanceUserPrompt(input: EnhanceEmailInput): string {
  return [
    `회사: ${input.companyName}`,
    `발신: ${input.senderName}`,
    `헤드라인: ${input.headline}`,
    `기자 beat: ${input.beatPrimary}`,
    `최근 기사: ${input.topReferenceTitle ?? "(없음)"}`,
    "",
    `현재 제목: ${input.subject}`,
    "현재 본문:",
    input.body,
  ].join("\n");
}

/** 보도자료 다듬기 시스템 프롬프트. */
export function pressPolishSystemPrompt(): string {
  return [
    "당신은 한국 보도자료 에디터다. 역피라미드·5W1H 표준 보도문을 작성한다.",
    "규칙:",
    "1) headlines는 서로 다른 앵글 3개(사실/수치/트렌드).",
    "2) body는 300~500자 내외, 첫 문단에 핵심.",
    "3) 과장·허위 수치 금지. 입력에 없는 사실을 지어내지 않는다.",
    "4) JSON만 출력: {\"title\":\"...\",\"headlines\":[\"...\",\"...\",\"...\"],\"body\":\"...\"}",
  ].join("\n");
}

export function pressPolishUserPrompt(input: PolishPressInput): string {
  return [
    `가제: ${input.title}`,
    `주체: ${input.who ?? ""}`,
    `뉴스가치: ${input.newsValue ?? ""}`,
    `수치: ${input.numbers ?? ""}`,
    `인용: ${input.quote ?? ""}`,
    `태그: ${input.topicTags.join(", ")}`,
    `초안 힌트: ${input.bodyHint ?? ""}`,
  ].join("\n");
}

/** 모델 응답에서 JSON 객체 추출. */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fence?.[1]?.trim() ?? trimmed;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseEnhanceEmailResult(
  raw: string,
  fallback: EnhanceEmailResult,
): EnhanceEmailResult {
  const obj = parseJsonObject(raw);
  if (!obj) return fallback;
  const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";
  const body = typeof obj.body === "string" ? obj.body.trim() : "";
  if (!subject || !body) return fallback;
  // 컴플라이언스: 수신거부·익명 호칭 강제
  let safeBody = body.includes("수신거부") ? body : `${body}\n\n──\n본 메일 수신을 원치 않으시면 회신으로 '수신거부'라 남겨주세요. 즉시 명단에서 제외하겠습니다.`;
  if (!safeBody.includes("기자님")) {
    safeBody = `기자님, 안녕하세요.\n\n${safeBody}`;
  }
  return { subject: subject.slice(0, 80), body: safeBody };
}

export function parsePolishPressResult(
  raw: string,
  fallback: PolishPressResult,
): PolishPressResult {
  const obj = parseJsonObject(raw);
  if (!obj) return fallback;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const body = typeof obj.body === "string" ? obj.body.trim() : "";
  const headlines = Array.isArray(obj.headlines)
    ? obj.headlines.map((h) => String(h).trim()).filter(Boolean).slice(0, 3)
    : [];
  if (!title || !body || headlines.length === 0) return fallback;
  while (headlines.length < 3) headlines.push(title);
  return { title, headlines, body };
}
