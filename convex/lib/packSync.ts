/**
 * 오픈크랩 기자단 배치 팩 → 파싱 유틸 (순수 함수, LLM 무사용).
 *
 * ┌ 실측 근거 (F8 스파이크, 2026-07-26) ──────────────────────────────────────┐
 * │ 취득 경로 : opencrab_search_documents                                      │
 * │             { query, package_id, workspace_id, limit≤100, scan_limit≤20000 }│
 * │ ⚠️ `pack_query`는 **쓰지 않는다** — 예외를 던지지 않고 조용히 documents:0을 │
 * │    돌려준다(서버 측 pack→document 해석 경로가 사실상 고장). try/catch로     │
 * │    폴백을 짜면 안 되고 빈 결과를 명시적으로 검사해야 한다.                   │
 * │ 응답 형태 : evidence[] 청크. 각 청크 metadata에 char_start/char_end.        │
 * │             char_start 오름차순 정렬 후 **구분자 없이** 이어붙이면 원문 JSON.│
 * │             (청크는 토큰 중간에서 잘리므로 개행을 넣으면 파손된다)           │
 * │ 문서 구조 : { ontology{...}, batch, record_count, reporters[] }             │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * 알려진 데이터 함정
 * - `metadata.full_chunk_count`는 **신뢰 불가**(실측 3청크를 2로, 저장 8개를 16으로 보고).
 *   결손 판정은 오직 char_start 연속성으로 한다.
 * - batch-025는 인제스트 단계에서 원문 17,726자 중 약 41%만 저장돼 **원리적으로 복원 불가**.
 *   선언 8건 중 완전 복원 가능 2건. → 팩별 완전성 게이트 + reference-pack 폴백(플랜 B)이 필수.
 * - `search_documents`는 limit 상한 100이고 offset·커서가 없다. 청크 100개(≈90KB)를 넘는
 *   팩은 단일 호출로 전량 취득할 수 없다.
 * - 팩 `version`은 전 팩 1.0.0 고정 — 변경 감지에 쓸 수 없다.
 */

/* ── 청크 재조립 ─────────────────────────────────────────────── */

export interface PackChunk {
  text: string;
  charStart: number;
  charEnd: number;
  /** 원문 순번 — 저장 순번(evidenceIndex)과 어긋나면 결손 신호 */
  sourceChunkIndex?: number;
  evidenceIndex?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return undefined;
}

function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** 응답의 evidence[] 에서 청크를 뽑는다(문자열 위치 메타 포함). */
export function extractChunks(payload: unknown): PackChunk[] {
  if (!isRecord(payload)) return [];
  const evidence = payload.evidence;
  if (!Array.isArray(evidence)) return [];

  const out: PackChunk[] = [];
  for (const ev of evidence) {
    if (!isRecord(ev)) continue;
    const text = typeof ev.text === "string" ? ev.text : typeof ev.content === "string" ? ev.content : undefined;
    if (text === undefined) continue;
    const meta = isRecord(ev.metadata) ? ev.metadata : {};
    const charStart = asNum(meta.char_start) ?? asNum(ev.char_start);
    const charEnd = asNum(meta.char_end) ?? asNum(ev.char_end);
    if (charStart === undefined || charEnd === undefined) continue;
    out.push({
      text,
      charStart,
      charEnd,
      sourceChunkIndex: asNum(meta.source_chunk_index),
      evidenceIndex: asNum(meta.evidence_index),
    });
  }
  return out;
}

export interface ReassembledDocument {
  text: string;
  /** char_start 연속성 + JSON 파싱까지 성공했는가 */
  complete: boolean;
  /** 비어 있는 구간 */
  gaps: Array<{ from: number; to: number }>;
  /** 이어붙인 총 길이 */
  chars: number;
}

/**
 * 청크를 원문 순서로 재조립한다.
 *
 * ⚠️ `search_documents`는 관련도(score) 내림차순으로 반환하므로 **반드시 char_start로
 *    재정렬**해야 한다. 이어붙일 때 구분자를 넣으면 안 된다(원문 무손실 슬라이스).
 */
export function reassembleDocument(chunks: PackChunk[]): ReassembledDocument {
  if (chunks.length === 0) return { text: "", complete: false, gaps: [], chars: 0 };

  const sorted = [...chunks].sort((a, b) => a.charStart - b.charStart);
  const deduped: PackChunk[] = [];
  for (const c of sorted) {
    if (deduped.some((d) => d.charStart === c.charStart)) continue;
    deduped.push(c);
  }

  const gaps: Array<{ from: number; to: number }> = [];
  if (deduped[0]!.charStart > 0) gaps.push({ from: 0, to: deduped[0]!.charStart });
  for (let i = 0; i < deduped.length - 1; i += 1) {
    const cur = deduped[i]!;
    const next = deduped[i + 1]!;
    if (cur.charEnd !== next.charStart) gaps.push({ from: cur.charEnd, to: next.charStart });
  }

  const text = deduped.map((c) => c.text).join("");
  return { text, complete: gaps.length === 0, gaps, chars: text.length };
}

/* ── 팩 문서 파싱 ────────────────────────────────────────────── */

export interface PackFetchResult {
  reporters: Array<Record<string, unknown>>;
  /** 문서가 선언한 레코드 수 */
  recordCount?: number;
  /** 문서가 선언한 배치 번호 */
  batch?: number;
  /** 청크 연속성 + JSON 파싱 성공 여부 */
  complete: boolean;
  gaps: Array<{ from: number; to: number }>;
  fingerprint: string;
  /** 파싱 실패 사유(있으면) */
  parseError?: string;
}

/** 변경 감지 지문 — version 필드는 신뢰하지 않으므로 길이·레코드 수로 만든다. */
export function packFingerprint(
  recordCount: number | undefined,
  chars: number,
  reporterCount: number,
): string {
  return `${recordCount ?? "?"}:${chars}:${reporterCount}`;
}

/**
 * MCP `opencrab_search_documents` 응답 → 기자 레코드.
 * 청크 재조립 → JSON 파싱 → `reporters[]` 순으로 진행하며, 어느 단계든 실패하면
 * `complete:false`로 표시해 호출 측이 `partial`로 기록하게 한다.
 */
/**
 * JSONL 문서에서 기자 레코드만 건져낸다.
 *
 * 머리말(`Exit code:` · `Output:` · `# 제목`)과 청크 경계에서 잘린 줄은 조용히 버린다.
 * 잘린 줄을 살리려 들면 깨진 레코드가 DB에 들어간다 — 온전한 줄만 취한다.
 *
 * `reporter_name`이 없는 줄은 기자 레코드가 아니므로 제외한다(요약·메타 줄 방어).
 */
export function parseReporterJsonLines(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // 청크 경계에서 잘린 줄
    }
    if (isRecord(obj) && typeof obj.reporter_name === "string" && obj.reporter_name.trim()) {
      out.push(obj);
    }
  }
  return out;
}

export function parsePackPayload(payload: unknown): PackFetchResult {
  const chunks = extractChunks(payload);
  const doc = reassembleDocument(chunks);

  const base = {
    gaps: doc.gaps,
    fingerprint: packFingerprint(undefined, doc.chars, 0),
  };

  if (!doc.text) {
    return { reporters: [], complete: false, ...base, parseError: "청크가 없습니다." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(doc.text);
  } catch (e) {
    // 단일 JSON이 아니면 JSONL을 시도한다.
    //
    // v2 시리즈(contact-index-v2 · topic-routing-v2)는 "Exit code: 0 / Output: / # 제목"
    // 머리말 뒤에 **한 줄에 기자 하나씩** 실려 온다. 배치 팩처럼 문서 전체가 하나의
    // JSON 객체가 아니므로 첫 글자에서 JSON.parse가 죽는다.
    //
    // 이 형식이 오히려 결손에 강하다 — 줄이 자기완결적이라 청크가 빠져도 그 구간의
    // 기자만 잃고 나머지는 살아남는다. 배치 팩은 한 청크만 빠져도 전량을 잃는다.
    const lineReporters = parseReporterJsonLines(doc.text);
    if (lineReporters.length > 0) {
      return {
        reporters: lineReporters,
        complete: doc.complete,
        gaps: doc.gaps,
        fingerprint: packFingerprint(undefined, doc.chars, lineReporters.length),
      };
    }
    return {
      reporters: [],
      complete: false,
      ...base,
      parseError: `문서 JSON 파싱 실패(청크 결손 추정): ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!isRecord(parsed)) {
    return { reporters: [], complete: false, ...base, parseError: "문서 최상위가 객체가 아닙니다." };
  }

  const recordCount = asNum(parsed.record_count);
  const batch = asNum(parsed.batch);
  const reportersRaw = parsed.reporters;
  const reporters: Array<Record<string, unknown>> = Array.isArray(reportersRaw)
    ? reportersRaw.filter(isRecord)
    : [];

  return {
    reporters,
    recordCount,
    batch,
    complete: doc.complete && reporters.length > 0,
    gaps: doc.gaps,
    fingerprint: packFingerprint(recordCount, doc.chars, reporters.length),
  };
}

/**
 * 팩 응답이 "스코프가 안 걸려 조용히 빈 결과"인지 판정한다.
 * `pack_query` 경로가 이 상태를 예외 없이 반환하므로 명시적 검사가 필요하다.
 */
export function isEmptyScopeResult(payload: unknown): boolean {
  if (!isRecord(payload)) return true;
  const evidence = payload.evidence;
  if (Array.isArray(evidence) && evidence.length > 0) return false;
  return true;
}

/* ── 팩 목록 파싱 ────────────────────────────────────────────── */

export interface PackListEntry {
  packageId: string;
  name?: string;
  capturedAt?: string;
}

export interface PackListPage {
  packs: PackListEntry[];
  /** offset 기반 — 응답의 next_cursor가 "10","20" 같은 숫자 문자열 */
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * `opencrab_search_packs` 응답 파싱(관대하게).
 * ⚠️ 응답의 `total`은 전체 건수가 아니라 **이 페이지 반환 수**다 — 완주 판정은
 *    `has_more`로만 한다.
 */
export function parsePackListPayload(payload: unknown): PackListPage {
  const packs: PackListEntry[] = [];
  if (!isRecord(payload)) return { packs, hasMore: false };

  const candidates: unknown[] = [];
  for (const key of ["packs", "results", "items", "data"]) {
    const list = payload[key];
    if (Array.isArray(list)) candidates.push(...list);
  }

  for (const item of candidates) {
    if (!isRecord(item)) continue;
    const packageId =
      asStr(item.package_id) ?? asStr(item.packageId) ?? asStr(item.id) ?? asStr(item.uuid);
    if (!packageId) continue;
    const snapshot = isRecord(item.snapshot) ? item.snapshot : {};
    packs.push({
      packageId,
      name: asStr(item.name) ?? asStr(item.title) ?? asStr(item.slug),
      capturedAt: asStr(item.captured_at) ?? asStr(snapshot.captured_at),
    });
  }

  const hasMore = payload.has_more === true || payload.hasMore === true;
  const nextCursor = asStr(payload.next_cursor) ?? asStr(payload.nextCursor);
  return { packs, hasMore, ...(nextCursor ? { nextCursor } : {}) };
}

/**
 * `opencrab_project_manage` 응답에서 **지정 프로젝트의** 팩 목록만 뽑는다.
 *
 * `query`는 부분 일치라 다른 프로젝트가 섞여 올 수 있다. 이름을 정확히 대조해
 * 엉뚱한 프로젝트의 팩을 기자단으로 들이지 않는다.
 */
export function parseProjectPacksPayload(
  payload: unknown,
  projectName: string,
): PackListEntry[] {
  if (!isRecord(payload)) return [];
  const projects = payload.projects;
  if (!Array.isArray(projects)) return [];

  const wanted = projectName.trim().toLowerCase();
  const out: PackListEntry[] = [];
  const seen = new Set<string>();

  for (const proj of projects) {
    if (!isRecord(proj)) continue;
    const name = asStr(proj.name)?.trim().toLowerCase();
    if (name !== wanted) continue;

    const packages = proj.packages;
    if (!Array.isArray(packages)) continue;
    for (const item of packages) {
      if (!isRecord(item)) continue;
      const packageId = asStr(item.package_id) ?? asStr(item.packageId) ?? asStr(item.id);
      if (!packageId || seen.has(packageId)) continue;
      seen.add(packageId);
      const snapshot = isRecord(item.snapshot) ? item.snapshot : {};
      out.push({
        packageId,
        name: asStr(item.title) ?? asStr(item.name) ?? asStr(item.slug),
        capturedAt: asStr(item.captured_at) ?? asStr(snapshot.captured_at),
      });
    }
  }
  return out;
}

/** 팩 선언 수 대비 실제 취득 건수로 동기화 상태를 판정한다. */
export function classifySyncStatus(
  fetched: number,
  recordCount: number | undefined,
  complete = true,
): "ok" | "partial" | "failed" {
  if (fetched === 0) return "failed";
  if (!complete) return "partial";
  if (recordCount != null && fetched < recordCount) return "partial";
  return "ok";
}

/* ── 필드 파서 (팩 실제 포맷) ────────────────────────────────── */

/**
 * 팩의 다중값 필드는 **파이프(`|`) 구분 단일 문자열**이다.
 * URL 목록에 슬래시·콤마가 포함되므로 범용 다중 구분자로 자르면 파손된다.
 */
export function splitPipe(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split("|").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * 범용 다중 구분자 split — 콤마·가운뎃점·파이프·슬래시.
 * 레거시 HTTP 응답 호환용이며, **파이프가 포함된 문자열은 파이프로만** 자른다
 * ("IT/테크"처럼 슬래시가 값의 일부인 경우를 보호).
 */
export const LIST_DELIMITERS = /[,·|/]/;

export function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    if (value.includes("|")) return splitPipe(value);
    return value.split(LIST_DELIMITERS).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * beat 분포 — 팩 포맷은 `"라벨:개수|라벨:개수"` 단일 문자열이다.
 * 객체·배열 형태(다른 소스)도 함께 수용한다.
 */
export function parseBeatDistribution(
  value: unknown,
): Array<{ beat: string; weight: number }> | undefined {
  const out: Array<{ beat: string; weight: number }> = [];

  if (typeof value === "string" && value.trim()) {
    for (const part of value.split("|")) {
      const idx = part.lastIndexOf(":");
      if (idx <= 0) continue;
      const beat = part.slice(0, idx).trim();
      const weight = Number(part.slice(idx + 1).trim());
      if (beat && Number.isFinite(weight)) out.push({ beat, weight });
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      const beat = asStr(item.beat) ?? asStr(item.name) ?? asStr(item.label);
      const weight = asNum(item.weight) ?? asNum(item.ratio) ?? asNum(item.count) ?? asNum(item.score);
      if (beat && weight !== undefined) out.push({ beat, weight });
    }
  } else if (isRecord(value)) {
    for (const [beat, w] of Object.entries(value)) {
      const weight = asNum(w);
      if (beat.trim() && weight !== undefined) out.push({ beat: beat.trim(), weight });
    }
  }

  if (out.length === 0) return undefined;
  return out.sort((a, b) => b.weight - a.weight).slice(0, 6);
}

/* ── 기사 URL·본문 날짜 파싱 (단일 구현 — opencrabMap이 소비) ── */

function toEpoch(y: number, m: number, d: number): number | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const ms = Date.UTC(y, m - 1, d, 12, 0, 0);
  if (!Number.isFinite(ms)) return undefined;
  if (y < 2000) return undefined;
  // 미래 1년 초과는 오검출로 본다
  if (ms > Date.now() + 365 * 24 * 3600 * 1000) return undefined;
  return ms;
}

/**
 * 기사 URL에서 발행일을 추출한다.
 * 지원: etnews(YYYYMMDD 기사번호) · newsis(NISX YYYYMMDD) · zdnet(no=YYYYMMDD) ·
 *       경로형 /YYYY/MM/DD/ · 쿼리형 date=YYYYMMDD · 일반 8자리 폴백
 */
export function parseArticleDateFromUrl(url: string | undefined): number | undefined {
  if (!url || typeof url !== "string") return undefined;

  const patterns: RegExp[] = [
    /etnews\.com\/(20\d{2})(\d{2})(\d{2})/i,
    /NIS[XZ](20\d{2})(\d{2})(\d{2})/i,
    /[?&]no=(20\d{2})(\d{2})(\d{2})/i,
    /[?&]date=(20\d{2})(\d{2})(\d{2})/i,
    /\/(20\d{2})\/(\d{2})\/(\d{2})\//,
    /\/(20\d{2})-(\d{2})-(\d{2})\//,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const ms = toEpoch(Number(m[1]), Number(m[2]), Number(m[3]));
      if (ms !== undefined) return ms;
    }
  }

  const generic = url.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (generic) return toEpoch(Number(generic[1]), Number(generic[2]), Number(generic[3]));
  return undefined;
}

/** "2026-07-15" · "2026.07.15" · "2026년 7월 15일" 형태의 텍스트 날짜. */
export function parseArticleDateFromText(text: string | undefined): number | undefined {
  if (!text || typeof text !== "string") return undefined;
  const m =
    text.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/) ??
    text.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return undefined;
  return toEpoch(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function resolveArticleDate(
  url: string | undefined,
  text: string | undefined,
): number | undefined {
  return parseArticleDateFromUrl(url) ?? parseArticleDateFromText(text);
}

/* ── 매체 유형(outletCategory) 정적 매핑 ────────────────────── */

export type OutletCategory = "newswire" | "broadcast" | "it" | "economy" | "general";

/**
 * 네이버 뉴스 OID → 매체 유형.
 * 팩에 `outlet_category` 필드가 없어 naver_oid로 도출한다. **확인된 OID만** 등록하고
 * 미등록은 "general"(기본 CTA)로 폴백한다 — 매체 분기를 "완전 분기"로 과장하지 않는다.
 */
export const NAVER_OID_CATEGORY: Record<string, OutletCategory> = {
  // 통신사
  "001": "newswire", // 연합뉴스
  "003": "newswire", // 뉴시스
  "421": "newswire", // 뉴스1
  // 방송 — 영상 자료(B-roll)와 1페이저를 먼저 원한다
  "056": "broadcast", // KBS
  "214": "broadcast", // MBC
  "055": "broadcast", // SBS
  "052": "broadcast", // YTN
  "437": "broadcast", // JTBC
  "422": "broadcast", // 연합뉴스TV
  // IT·테크 전문지
  "030": "it", // 전자신문
  "092": "it", // 지디넷코리아
  "138": "it", // 디지털데일리
  "029": "it", // 디지털타임스
  "293": "it", // 블로터
  // 경제지
  "008": "economy", // 머니투데이
  "009": "economy", // 매일경제
  "011": "economy", // 서울경제
  "014": "economy", // 파이낸셜뉴스
  "015": "economy", // 한국경제
  "016": "economy", // 헤럴드경제
  "018": "economy", // 이데일리
  "277": "economy", // 아시아경제
};

export function outletCategoryFromOid(oid: string | undefined): OutletCategory {
  if (!oid) return "general";
  const key = String(oid).trim().padStart(3, "0");
  return NAVER_OID_CATEGORY[key] ?? "general";
}

/* ── 오류 메시지 PII 마스킹 (F6 저장 전 필수) ───────────────── */

/** 동기화 오류 원문에 섞인 이메일을 마스킹한다 — 오류 로그 경유 PII 유출 차단. */
export function maskEmailsInText(text: string): string {
  return text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => {
    const [local, domain] = m.split("@");
    return `${local!.slice(0, 2)}***@${domain}`;
  });
}
