/**
 * OpenCrab 기자 레코드 → Convex journalists 테이블 행 정규화.
 * HTTP/MCP 응답 형태가 달라도 동일 스키마로 맞춘다.
 */

export type Confidence = "high" | "medium" | "low";

export interface OpenCrabJournalistInput {
  reporter_name?: string;
  name?: string;
  outlet_name?: string;
  outlet?: string;
  email?: string;
  beat_primary?: string;
  beatPrimary?: string;
  beat_secondary?: string[] | string;
  beatSecondary?: string[] | string;
  contact_confidence?: string;
  contactConfidence?: string;
  reference_article_count?: number;
  referenceArticleCount?: number;
  top_reference_title?: string;
  topReferenceTitle?: string;
  top_reference_url?: string;
  topReferenceUrl?: string;
  mailing_status?: string;
  mailingStatus?: string;
}

export interface NormalizedJournalist {
  name: string;
  outlet: string;
  email: string;
  beatPrimary: string;
  beatSecondary: string[];
  contactConfidence: Confidence;
  referenceArticleCount: number;
  topReferenceTitle?: string;
  topReferenceUrl?: string;
  mailingStatus: string;
  source: "opencrab";
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) {
    return v
      .split(/[,·|/]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeConfidence(raw: string | undefined): Confidence {
  const c = (raw ?? "medium").toLowerCase();
  if (c === "high") return "high";
  if (c === "low") return "low";
  return "medium";
}

/** 단일 레코드를 정규화. 필수 필드 없으면 null. */
export function normalizeJournalistRecord(
  raw: OpenCrabJournalistInput | Record<string, unknown>,
): NormalizedJournalist | null {
  const r = raw as OpenCrabJournalistInput;
  const name = asString(r.reporter_name) ?? asString(r.name);
  const outlet = asString(r.outlet_name) ?? asString(r.outlet);
  const email = asString(r.email)?.toLowerCase();
  const beatPrimary = asString(r.beat_primary) ?? asString(r.beatPrimary) ?? "미분류";
  if (!name || !outlet || !email || !email.includes("@")) return null;

  return {
    name,
    outlet,
    email,
    beatPrimary,
    beatSecondary: asStringList(r.beat_secondary ?? r.beatSecondary),
    contactConfidence: normalizeConfidence(
      asString(r.contact_confidence) ?? asString(r.contactConfidence),
    ),
    referenceArticleCount:
      asNumber(r.reference_article_count) ?? asNumber(r.referenceArticleCount) ?? 0,
    topReferenceTitle: asString(r.top_reference_title) ?? asString(r.topReferenceTitle),
    topReferenceUrl: asString(r.top_reference_url) ?? asString(r.topReferenceUrl),
    mailingStatus: asString(r.mailing_status) ?? asString(r.mailingStatus) ?? "candidate",
    source: "opencrab",
  };
}

/**
 * OpenCrab HTTP 응답 JSON에서 기자 배열을 추출한다.
 * 지원 형태:
 *  - { journalists: [...] }
 *  - { data: { journalists: [...] } }
 *  - { results: [...] } / { items: [...] }
 *  - { evidence: [{ metadata|fields|data: {...} }] }
 *  - 최상위 배열
 */
export function extractJournalistsFromResponse(payload: unknown): NormalizedJournalist[] {
  if (payload == null) return [];

  const seen = new Set<string>();
  const out: NormalizedJournalist[] = [];

  const push = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    const n = normalizeJournalistRecord(item as Record<string, unknown>);
    if (!n || seen.has(n.email)) return;
    // 컴플라이언스: candidate만 수용(명시적 approved 등도 발송 전 상태로 강제)
    n.mailingStatus = "candidate";
    seen.add(n.email);
    out.push(n);
  };

  if (Array.isArray(payload)) {
    for (const item of payload) push(item);
    return out;
  }

  if (typeof payload !== "object") return out;
  const obj = payload as Record<string, unknown>;

  const directLists = [obj.journalists, obj.results, obj.items, obj.records];
  for (const list of directLists) {
    if (Array.isArray(list)) {
      for (const item of list) push(item);
    }
  }

  if (obj.data && typeof obj.data === "object") {
    const data = obj.data as Record<string, unknown>;
    if (Array.isArray(data.journalists)) {
      for (const item of data.journalists) push(item);
    }
    if (Array.isArray(data)) {
      for (const item of data as unknown[]) push(item);
    }
  }

  if (Array.isArray(obj.evidence)) {
    for (const ev of obj.evidence) {
      if (!ev || typeof ev !== "object") continue;
      const e = ev as Record<string, unknown>;
      push(e.metadata ?? e.fields ?? e.data ?? e);
    }
  }

  return out;
}

export function buildOpenCrabQueryBody(topicTags: string[], topK: number) {
  const topics = topicTags.filter(Boolean).join(", ") || "스타트업";
  return {
    query: `${topics} 담당 기자의 이름, 소속 언론사, 이메일, 담당 분야(beat), 최근 기사 레퍼런스를 알려줘`,
    pack_query: "korean-journalist-contact-index-v2",
    top_k: topK,
  };
}
