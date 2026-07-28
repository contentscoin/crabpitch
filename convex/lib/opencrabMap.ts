/**
 * OpenCrab 기자 레코드 → Convex journalists 테이블 행 정규화.
 * HTTP/MCP 응답 형태가 달라도 동일 스키마로 맞춘다.
 *
 * 컴플라이언스: `mailing_status`는 팩 값을 **무시하고 항상 "candidate"** 로 강제하며,
 * `phone`(팩 전량 빈값)·`official_popularity_rank`(전량 null)는 **수집하지 않는다**(PII 최소화).
 */

import {
  outletCategoryFromOid,
  parseBeatDistribution,
  resolveArticleDate,
  splitList,
  splitPipe,
  type OutletCategory,
} from "./packSync";

export type Confidence = "high" | "medium" | "low";

/** 근거 기사 1건 — 최대 3건 저장(통합 결정 #3). */
export interface ReferenceArticle {
  title: string;
  url?: string;
  topic?: string;
  publishedAtText?: string;
  publishedAt?: number;
}

export interface BeatWeight {
  beat: string;
  weight: number;
}

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
  top_reference?: unknown;
  mailing_status?: string;
  mailingStatus?: string;
  // 기자단 배치 팩 고유 필드
  naver_oid?: string | number;
  contact_verification?: string;
  contact_evidence_count?: number;
  email_public_evidence_count?: number;
  emailPublicEvidenceCount?: number;
  contact_source_urls?: string[] | string;
  /** v2 시리즈 단수형 */
  contact_source_url?: string;
  /** topic-routing-v2 — top_ 접두 없음 */
  reference_title?: string;
  reference_url?: string;
  beat_distribution?: unknown;
  beat_distribution_top?: unknown;
  beatDistributionTop?: unknown;
  classification_confidence?: string;
  reference_articles?: unknown;
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
  /* 팩 고유 필드 (전부 optional — 구 응답·seed 호환) */
  naverOid?: string;
  contactVerification?: string;
  contactEvidenceCount?: number;
  /** ⚠️ 감사 전용 — UI·MCP 미노출 */
  contactSourceUrls?: string[];
  beatDistribution?: BeatWeight[];
  classificationConfidence?: string;
  referenceArticles?: ReferenceArticle[];
  latestArticleAt?: number;
  outletCategory?: OutletCategory;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumberLike(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return !!v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** 다중 구분자 split — 정본은 packSync.splitList(콤마·가운뎃점·파이프·슬래시). */
function asStringList(v: unknown): string[] {
  return splitList(v);
}

function normalizeConfidence(raw: string | undefined): Confidence {
  const c = (raw ?? "medium").toLowerCase();
  if (c === "high") return "high";
  if (c === "low") return "low";
  return "medium";
}

/**
 * 근거 기사 — 최대 3건.
 *
 * ⚠️ 팩 레코드에는 발행일 필드가 없다(실측: `{title, url, topic,
 *    official_popularity_rank, exposure_rank_in_outlet}`). 발행일은 **URL에서만** 얻을 수
 *    있으므로, 파싱에 실패하면 `publishedAt`을 비운다 — 이 경우 메일 후킹은 날짜를
 *    주장하지 않고 제목만 인용한다.
 * ⚠️ `official_popularity_rank`는 팩 전량 null이라 수집하지 않는다.
 */
function normalizeReferenceArticles(
  raw: unknown,
  fallbackTitle?: string,
  fallbackUrl?: string,
): ReferenceArticle[] | undefined {
  const out: ReferenceArticle[] = [];
  const push = (item: unknown) => {
    if (out.length >= 3) return;
    if (typeof item === "string") {
      const title = item.trim();
      if (title) out.push({ title, publishedAt: resolveArticleDate(undefined, title) });
      return;
    }
    if (!item || typeof item !== "object") return;
    const o = item as Record<string, unknown>;
    const title = asString(o.title) ?? asString(o.headline) ?? asString(o.name);
    if (!title) return;
    const url = asString(o.url) ?? asString(o.link);
    const publishedAtText =
      asString(o.published_at) ?? asString(o.publishedAt) ?? asString(o.date);
    const publishedAt = resolveArticleDate(url, publishedAtText ?? title);
    out.push({
      title,
      ...(url ? { url } : {}),
      ...(asString(o.topic) ? { topic: asString(o.topic)! } : {}),
      ...(publishedAtText ? { publishedAtText } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
    });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  }

  // 팩에 배열이 없으면 top_reference_* 1건으로 하위 호환 구성
  if (out.length === 0 && fallbackTitle) {
    const publishedAt = resolveArticleDate(fallbackUrl, fallbackTitle);
    out.push({
      title: fallbackTitle,
      ...(fallbackUrl ? { url: fallbackUrl } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
    });
  }

  return out.length ? out : undefined;
}

/** 단일 레코드를 정규화. 필수 필드 없으면 null. */
export function normalizeJournalistRecord(
  raw: OpenCrabJournalistInput | Record<string, unknown>,
): NormalizedJournalist | null {
  const r = raw as OpenCrabJournalistInput;
  const topReference = asRecord(r.top_reference);
  const name = asString(r.reporter_name) ?? asString(r.name);
  const outlet = asString(r.outlet_name) ?? asString(r.outlet);
  const email = asString(r.email)?.toLowerCase();
  const beatPrimary = asString(r.beat_primary) ?? asString(r.beatPrimary) ?? "미분류";
  if (!name || !outlet || !email || !email.includes("@")) return null;

  // topic-routing-v2는 top_ 접두 없이 reference_title/url로 싣는다 — 같은 뜻이라 함께 본다.
  const topReferenceTitle =
    asString(r.top_reference_title) ??
    asString(r.topReferenceTitle) ??
    asString(topReference?.title) ??
    asString(topReference?.headline) ??
    asString(r.reference_title);
  const topReferenceUrl =
    asString(r.top_reference_url) ??
    asString(r.topReferenceUrl) ??
    asString(topReference?.url) ??
    asString(topReference?.link) ??
    asString(r.reference_url);
  const referenceArticles = normalizeReferenceArticles(
    r.reference_articles ?? (topReference ? [topReference] : undefined),
    topReferenceTitle,
    topReferenceUrl,
  );
  const latestArticleAt = referenceArticles
    ?.map((a) => a.publishedAt)
    .filter((n): n is number => typeof n === "number")
    .reduce<number | undefined>((max, n) => (max === undefined || n > max ? n : max), undefined);

  const naverOid =
    asString(r.naver_oid) ??
    (typeof r.naver_oid === "number" ? String(r.naver_oid).padStart(3, "0") : undefined);
  // ⚠️ phone(팩 전량 빈값)·official_popularity_rank(전량 null)는 수집하지 않는다(PII 최소화).
  // ⚠️ contact_source_urls는 파이프 구분 문자열이다 — URL에 슬래시·콤마가 있어
  //    범용 다중 구분자로 자르면 파손된다.
  // v2는 단수 contact_source_url로 싣는다.
  const contactSourceUrls =
    splitPipe(r.contact_source_urls) ?? splitPipe(r.contact_source_url);
  const beatDistribution = parseBeatDistribution(
    r.beat_distribution ?? r.beat_distribution_top ?? r.beatDistributionTop,
  );
  const contactEvidenceCount =
    asNumberLike(r.contact_evidence_count) ??
    asNumberLike(r.email_public_evidence_count) ??
    asNumberLike(r.emailPublicEvidenceCount);

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
      asNumberLike(r.reference_article_count) ??
      asNumberLike(r.referenceArticleCount) ??
      referenceArticles?.length ??
      0,
    topReferenceTitle: topReferenceTitle ?? referenceArticles?.[0]?.title,
    topReferenceUrl: topReferenceUrl ?? referenceArticles?.[0]?.url,
    mailingStatus: asString(r.mailing_status) ?? asString(r.mailingStatus) ?? "candidate",
    source: "opencrab",
    ...(naverOid ? { naverOid, outletCategory: outletCategoryFromOid(naverOid) } : {}),
    ...(asString(r.contact_verification)
      ? { contactVerification: asString(r.contact_verification)! }
      : {}),
    ...(contactEvidenceCount !== undefined ? { contactEvidenceCount } : {}),
    ...(contactSourceUrls.length ? { contactSourceUrls } : {}),
    ...(beatDistribution ? { beatDistribution } : {}),
    ...(asString(r.classification_confidence)
      ? { classificationConfidence: asString(r.classification_confidence)! }
      : {}),
    ...(referenceArticles ? { referenceArticles } : {}),
    ...(latestArticleAt !== undefined ? { latestArticleAt } : {}),
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

/**
 * 팩 문서에서 뽑은 `reporters[]` 원본 레코드 → 정규화 목록.
 * email 중복 제거 + `mailingStatus:"candidate"` 강제(팩 값 무시).
 */
export function normalizePackReporters(
  reporters: Array<Record<string, unknown>>,
): NormalizedJournalist[] {
  const seen = new Set<string>();
  const out: NormalizedJournalist[] = [];
  for (const raw of reporters) {
    const n = normalizeJournalistRecord(raw);
    if (!n || seen.has(n.email)) continue;
    n.mailingStatus = "candidate";
    seen.add(n.email);
    out.push(n);
  }
  return out;
}

/**
 * 매칭용 질의 본문.
 *
 * `pack_query`는 **HTTP 계약 전용**이다. MCP 경로에서는 서버가 이 인자를 해석하지 못해
 * 예외 없이 빈 결과를 돌려주므로(F8 실측) 전달하지 않는다 — MCP 스코프는 `package_id`를
 * 쓰며, 여기서는 인덱스 팩의 package_id가 확정되기 전까지 비워 둔다(스코프 없이 질의).
 */
export function buildOpenCrabQueryBody(topicTags: string[], topK: number) {
  const topics = topicTags.filter(Boolean).join(", ") || "스타트업";
  return {
    query: `${topics} 담당 기자의 이름, 소속 언론사, 이메일, 담당 분야(beat), 최근 기사 레퍼런스를 알려줘`,
    pack_query: "korean-journalist-contact-index-v2",
    package_id: undefined as string | undefined,
    top_k: topK,
  };
}
