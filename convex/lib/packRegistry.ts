/**
 * 오픈크랩 팩 레지스트리 — 부트스트랩·폴백 상수.
 *
 * ⚠️ 진실 원천은 `opencrabPacks` 테이블(= `opencrab_search_packs` 목록 완주 결과)이다.
 * 이 상수는 ① 최초 동기화 부트스트랩 ② 목록 조회 실패 시 폴백 ③ 시리즈 판별에만 쓴다.
 *
 * 조회 근거: `opencrab_search_packs` (query=journalist, offset 0/10/20/30 완주 · query=presskit)
 * 확인일: 2026-07-26
 *
 * 알려진 함정
 * - 팩 `version` 필드는 전 팩 1.0.0 고정이라 **변경 감지에 쓸 수 없다**(새 시리즈 발행 패턴).
 * - 목록 API에 `record_count`가 없다. 아래 `expectedRecords`는 각 팩 readme의
 *   "Evidence chunks" 값이며 레코드 수와 1:1이 아니다(합 203 vs reference 팩 선언 201).
 *   **결손(partial) 판정은 런타임 응답의 record_count를 우선**하고, 이 값은 admin 표시용 힌트로만 쓴다.
 * - 기자단 팩과 PR 지식 팩은 **워크스페이스가 다르다**.
 */

export type PackSeries =
  | "journalist-contacts"
  | "journalist-reference"
  | "pr-presskit"
  | "other";

export interface PackEntry {
  packageId: string;
  slug: string;
  series: PackSeries;
  /** 기자단 배치 팩만 */
  batch?: string;
  /** readme Evidence chunks 기반 힌트 — 레코드 수 보장 아님 */
  expectedRecords?: number;
  capturedAt?: string;
}

/** 기자단 팩 워크스페이스 */
export const JOURNALIST_WORKSPACE_ID = "f5a34200-17fb-4ce5-bea6-b979dfa1a3cd";

/**
 * 오픈크랩 **프로젝트** — 팩 탐색의 1차 진실 원천.
 *
 * 이전에는 `opencrab_search_packs`에 "journalist"·"presskit" 키워드를 던져 팩을 찾았다.
 * 키워드는 팩 제목에 의존하므로, 제목 규칙이 바뀐 신규 시리즈는 조용히 빠진다.
 * 실제로 이 프로젝트의 39팩 중 13팩(index-v2 10 · topic-routing-v2 3)이
 * 그렇게 누락돼 있었다.
 *
 * 프로젝트는 사람이 큐레이션한 명시적 집합이라 이 문제가 없다.
 * **프로젝트에 들어 있다는 사실 자체가 기자단 팩이라는 신뢰 신호**다.
 */
export const JOURNALIST_PROJECT_NAME = "korean-journalist-contact-intelligence";
/** PR 지식 팩 프로젝트 (기자단과 별개) */
export const PR_PRESSKIT_PROJECT_NAME = "pr_presskit_intelligence_project";
/** PR 지식 팩 워크스페이스 (기자단과 별개) */
export const PR_WORKSPACE_ID = "ab2da385-2c53-4548-a90e-cef5290e1408";

/** 배치 팩 26개 — 동기화 1차 소스. */
export const JOURNALIST_BATCH_PACKS: PackEntry[] = [
  { batch: "batch-001", packageId: "efa3e29f-ece0-4097-8c18-7710284a54f1", expectedRecords: 8, capturedAt: "2026-07-21T13:33:05.170Z" },
  { batch: "batch-002", packageId: "2933ed10-a070-4e0a-80b2-677b09fc8fa6", expectedRecords: 8, capturedAt: "2026-07-21T13:33:08.735Z" },
  { batch: "batch-003", packageId: "41a775a1-a126-41c7-b868-4a346f9ab0c3", expectedRecords: 8, capturedAt: "2026-07-21T13:33:11.455Z" },
  { batch: "batch-004", packageId: "e481f6fe-911c-4ccb-93f8-11bf4ab07fe4", expectedRecords: 8, capturedAt: "2026-07-21T13:33:14.042Z" },
  { batch: "batch-005", packageId: "32c3e23c-3ad8-47d3-bbaf-3d8ade84bf14", expectedRecords: 8, capturedAt: "2026-07-21T13:33:16.891Z" },
  { batch: "batch-006", packageId: "8989654e-5cb3-4ec9-8bbe-45f1d22aca70", expectedRecords: 8, capturedAt: "2026-07-21T13:33:19.951Z" },
  { batch: "batch-007", packageId: "7d1d68bc-3b2f-4655-8438-cff25722ce4b", expectedRecords: 8, capturedAt: "2026-07-21T13:33:22.733Z" },
  { batch: "batch-008", packageId: "d8a8b1ee-e95d-4636-8482-38a0f75a1d52", expectedRecords: 8, capturedAt: "2026-07-21T13:33:25.955Z" },
  { batch: "batch-009", packageId: "cd2b6cbb-4ba6-4547-9905-f14b7541fcc1", expectedRecords: 8, capturedAt: "2026-07-21T13:33:29.011Z" },
  { batch: "batch-010", packageId: "e64cfd8e-bc44-476d-9e31-0772329864bd", expectedRecords: 8, capturedAt: "2026-07-21T13:33:31.778Z" },
  { batch: "batch-011", packageId: "cb3f08d8-e0fe-4cdf-ba04-2c3ca0d97efa", expectedRecords: 8, capturedAt: "2026-07-21T13:33:34.947Z" },
  { batch: "batch-012", packageId: "a1911147-1a9b-4a12-9f0c-74d36daab4e0", expectedRecords: 8, capturedAt: "2026-07-21T13:33:37.516Z" },
  { batch: "batch-013", packageId: "ed6422b8-fdf0-4b08-bf9e-7bf5cfaa7a60", expectedRecords: 8, capturedAt: "2026-07-21T13:33:40.145Z" },
  { batch: "batch-014", packageId: "a37fc53e-54dd-45d1-9464-bcb6b334e604", expectedRecords: 8, capturedAt: "2026-07-21T13:33:42.829Z" },
  { batch: "batch-015", packageId: "c5f6f0e5-31d6-4cb4-9523-00fef8e89bcd", expectedRecords: 8, capturedAt: "2026-07-21T13:33:45.355Z" },
  { batch: "batch-016", packageId: "62d7b329-a4ba-43b5-b79e-7ca08cbddf2f", expectedRecords: 8, capturedAt: "2026-07-21T13:33:47.806Z" },
  { batch: "batch-017", packageId: "dccb126b-3eb6-4d6c-b007-76729c291b1f", expectedRecords: 8, capturedAt: "2026-07-21T13:33:50.472Z" },
  { batch: "batch-018", packageId: "fadd9194-f7b7-4368-b6e8-8d30d6080ddf", expectedRecords: 8, capturedAt: "2026-07-21T13:33:53.117Z" },
  { batch: "batch-019", packageId: "eaca95ab-e045-4b3c-9948-53d9a8d02929", expectedRecords: 8, capturedAt: "2026-07-21T13:33:56.221Z" },
  { batch: "batch-020", packageId: "173660d6-532a-45a8-8c31-0d040955154f", expectedRecords: 8, capturedAt: "2026-07-21T13:33:59.223Z" },
  { batch: "batch-021", packageId: "d176b788-3800-40fd-b4b4-885b46dad46b", expectedRecords: 8, capturedAt: "2026-07-21T13:34:02.274Z" },
  { batch: "batch-022", packageId: "ded2cb3a-11d3-4680-9b44-47e70bca0a3e", expectedRecords: 8, capturedAt: "2026-07-21T13:34:05.436Z" },
  { batch: "batch-023", packageId: "03c74611-07a5-4fdb-a3ec-b48c53328a78", expectedRecords: 8, capturedAt: "2026-07-21T13:34:08.628Z" },
  { batch: "batch-024", packageId: "9b10c8a1-cf54-4f09-bba3-4fd6a051ba97", expectedRecords: 8, capturedAt: "2026-07-21T13:34:11.641Z" },
  { batch: "batch-025", packageId: "33216bcd-17a3-4a73-a739-e1708b47c2fd", expectedRecords: 8, capturedAt: "2026-07-21T13:34:14.804Z" },
  { batch: "batch-026", packageId: "15dabbff-85a6-4f8a-94fe-b27bb078b25a", expectedRecords: 3, capturedAt: "2026-07-21T13:34:17.270Z" },
].map((e) => ({
  ...e,
  slug: `korean-journalist-contacts-${e.batch}`,
  series: "journalist-contacts" as const,
}));

/** 201건 마스터 — 배치 팩 evidence 결손 보완용 **보조** 소스(email 업서트라 중복 무해). */
export const JOURNALIST_REFERENCE_PACK: PackEntry = {
  packageId: "7db39961-b589-4d77-8e4b-761315de6590",
  slug: "korean-journalist-contact-reference-pack",
  series: "journalist-reference",
  expectedRecords: 201,
  capturedAt: "2026-07-21T13:31:35.495Z",
};

/**
 * PR 지식 팩 정본 — QA A/90을 받은 v2 candidate.
 *
 * 같은 계열 후속본이 5종 더 있으나(v2_1_openai_clip / v2_2_enhanced / v2_3_server_vector /
 * v2_4_canonical_cloud / v2_5_embedding_request — 문서·청크·노드 카운트 모두 동일) **자동 전환하지
 * 않는다**. 신규 시리즈 채택은 관리자 승인 절차(S5)를 거친다.
 */
export const PR_PRESSKIT_PACK: PackEntry = {
  packageId: "f6c1c0b4-c801-4e36-b278-c1411df393ec",
  slug: "pr_presskit_intelligence_ontology_v2_candidate",
  series: "pr-presskit",
  capturedAt: "2026-07-22T11:35:19.339Z",
};

/** 관리자 승인 전까지 채택하지 않는 PR 팩 후속본(감지·표시 전용). */
export const PR_PRESSKIT_SUCCESSORS: string[] = [
  "69da1603", // v2_1_openai_clip_candidate
  "82b3f3cd", // v2_2_enhanced
  "c6f10143", // v2_3_server_vector
  "1c38fb8a", // v2_4_canonical_cloud
  "eec61ce9", // v2_5_embedding_request
];

/** 동기화 대상(1차 소스 + 보조 소스). index/index-v2/topic-routing 파생 시리즈는 제외. */
export const SYNC_SOURCE_PACKS: PackEntry[] = [
  ...JOURNALIST_BATCH_PACKS,
  JOURNALIST_REFERENCE_PACK,
];

const BY_PACKAGE_ID = new Map<string, PackEntry>(
  [...SYNC_SOURCE_PACKS, PR_PRESSKIT_PACK].map((p) => [p.packageId, p]),
);

export function lookupPack(packageId: string): PackEntry | undefined {
  return BY_PACKAGE_ID.get(packageId);
}

/**
 * 팩 이름/슬러그로 시리즈를 판별한다.
 * 동기화 파이프라인은 contacts·reference만 소비한다 — 파생 시리즈(index/topic-routing)는
 * "other"로 분류되어 자동 동기화 대상이 되지 않는다(단, 기존 매칭 질의 경로의
 * `korean-journalist-contact-index-v2` 팩 스코프는 별개로 유지한다 — F2 주의사항).
 */
export function classifyPackSeries(slugOrName: string): PackSeries {
  const s = slugOrName.toLowerCase();
  if (s.includes("presskit") || s.includes("press_kit") || s.includes("press-kit")) {
    return "pr-presskit";
  }
  if (s.includes("index") || s.includes("topic-routing") || s.includes("topic_routing")) {
    return "other";
  }
  if (s.includes("journalist-contacts") || s.includes("journalist_contacts")) {
    return "journalist-contacts";
  }
  if (s.includes("reference-pack") || s.includes("reference_pack")) {
    return "journalist-reference";
  }
  return "other";
}

/** 슬러그에서 batch-0NN 추출. */
export function extractBatch(slugOrName: string): string | undefined {
  const m = slugOrName.match(/batch[-_]?(\d{1,3})/i);
  return m ? `batch-${m[1]!.padStart(3, "0")}` : undefined;
}

/** 시리즈가 자동 동기화 대상인지 — 신규/파생 시리즈는 관리자 승인 전까지 false. */
export function isAutoSyncSeries(series: PackSeries): boolean {
  return series === "journalist-contacts" || series === "journalist-reference";
}

/**
 * 이 팩을 자동 동기화할지.
 *
 * 시리즈 판별은 팩 **제목 문자열**에 기대므로 새 명명 규칙에 약하다.
 * 반면 프로젝트 소속은 사람이 넣은 것이라 훨씬 강한 신호다 —
 * 기자단 프로젝트에 들어 있으면 제목이 무엇이든 동기화 대상으로 본다.
 *
 * 프로젝트 밖에서 키워드로 발견된 팩은 종전대로 관리자 승인을 기다린다.
 */
export function shouldAutoSync(series: PackSeries, fromProject: boolean): boolean {
  return fromProject || isAutoSyncSeries(series);
}
