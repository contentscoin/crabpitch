/**
 * 보도자료·메일 작성 규범 **정본 상수**.
 *
 * ┌ 출처 ─────────────────────────────────────────────────────────────────────┐
 * │ 오픈크랩 PR 지식 팩 `pr_presskit_intelligence_ontology_v2_candidate`        │
 * │ package_id  f6c1c0b4-c801-4e36-b278-c1411df393ec                          │
 * │ workspace   ab2da385-2c53-4548-a90e-cef5290e1408 (기자단 팩과 별개)         │
 * │ 규모        문서 54 · 청크 322 · 노드 411                                   │
 * │ 추출·검증일 2026-07-26                                                      │
 * │ 검증 방법   opencrab_search_documents / opencrab_pack_qa 로 청크 원문 직접   │
 * │             확인. 블록별 document_id를 각 상수에 주석으로 남긴다.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ 이 파일이 **유일한 정본**이다. `pressLint`(보도자료)·`emailCompliance`(메일)·
 *    프롬프트·SKILL.md가 모두 여기를 참조한다. 값을 복제하지 말 것.
 *
 * ⚠️ 팩 편향 — 이식하지 않은 것들
 *    · 특정 기업(SK텔레콤) 스타일북 상수: 회사명 띄어쓰기 규칙, 서비스명 표기,
 *      직책 구조, 보일러플레이트 문구 → 회사 고유 표기는 **사용자 입력으로 외부화**한다.
 *    · L3 비교광고의 경쟁사 리터럴(통신 3사)·인용 가능 기관 목록(국내 통신 도메인 편향).
 *    · 합성 데모 데이터(`examples/demo-output/*`) — 규칙 ID 명명 규약 근거로만 유효하고
 *      수치·인물·사건은 **사실로 인용 금지**.
 *
 * ⚠️ 커버 범위 — 표시·광고의 공정화에 관한 법률 계열만 다룬다.
 *    **언론중재법(정정·반론보도)은 팩 범위 밖**이며 이 가이드는 법률 검토를 대체하지 않는다.
 */

/* ── ① 보도자료 표준 구조 ───────────────────────────────────
 * 출처: doc 4f752fb7-ae3b-41a6-b776-0c9e7bd96c25 (skpr-press-writer.md
 *       "보도자료 구조 (스타일북 기준)") + 분량 힌트 doc 8beb9aa0-412e-4cb9-a9b4-0be79452c676
 *       (pr-style-book/SKILL.md "3. 보도자료 템플릿")
 * 팩 내부 불일치: 8단 목록은 바디 2개, 스타일북 템플릿·개요 구조는 바디 3개.
 *   → 바디를 **2~3개 가변**으로 두어 양쪽과 모순되지 않게 한다.
 */

export interface PressSection {
  order: number;
  name: string;
  purpose: string;
  lengthHint: string;
}

export const PRESS_STRUCTURE: PressSection[] = [
  { order: 1, name: "제목", purpose: "핵심 가치 전달", lengthHint: "30자 이내" },
  { order: 2, name: "부제", purpose: "보조 포인트 2개", lengthHint: "2개, 각 40자 이내" },
  {
    order: 3,
    name: "리드",
    purpose: "5W1H 집약 — ①발표 사실 ②배경·차별점 ③기대효과·다음 스텝",
    lengthHint: "정확히 3문장",
  },
  { order: 4, name: "바디 1", purpose: "핵심 발표 내용 상세", lengthHint: "2~3문단 + 소제목(H3) 1개" },
  { order: 5, name: "바디 2", purpose: "배경·차별점·업계 맥락", lengthHint: "2~3문단 + 소제목(H3) 1개" },
  { order: 6, name: "바디 3 (선택)", purpose: "기대 효과·향후 계획", lengthHint: "1~2문단" },
  { order: 7, name: "임원 코멘트", purpose: "실명·직책 명시. 제목을 반복하지 않고 결정 이유·시장 해석·향후 계획 중 1개를 더한다", lengthHint: "1~2개, 각 1~2문장" },
  { order: 8, name: "회사 소개(보일러플레이트)", purpose: "표준 회사 소개문 — 프레스킷과 단일 소스", lengthHint: "80~120단어(100단어 안팎)" },
  { order: 9, name: "미디어 문의", purpose: "담당자·이메일·전화번호", lengthHint: "1줄" },
];

/* ── ② 작성 전략 수치 규범 ───────────────────────────────────
 * 출처: doc 8beb9aa0 (pr-style-book "7. 문장 체크리스트", 톤앤매너 '간결함')
 *       doc 4f752fb7 (skpr-press-writer 작업 원칙 2·3)
 *       doc a05bce92-951e-4a94-bfe3-0fdaf831a64b (pr-press-release/SKILL.md 원칙 2)
 *       doc f22c37e9-cca3-450b-8233-39d25f799d3b (STYLE-LEN-001 실제 적용례)
 */

export const WRITING_RULES = {
  /** 리드 문단 문장 수 — 5W1H를 여기서 끝낸다 */
  leadSentences: 3,
  /** 문장 길이 지향값 */
  sentenceCharTarget: 50,
  /** 문장 길이 상한 — 초과 시 STYLE-LEN-001(medium) */
  sentenceCharMax: 80,
  /** 한 문단 문장 수 — 문단 독립성 유지 */
  paragraphSentencesMax: 4,
  /** 수동태 비율 상한 */
  passiveVoiceMaxRatio: 0.2,
  /** 핵심 메시지 개수 상한 */
  keyMessagesMax: 3,
  /** 임원 코멘트 개수 */
  executiveQuotesMin: 1,
  executiveQuotesMax: 2,
  /** 보일러플레이트 단어 수 */
  boilerplateWordMin: 80,
  boilerplateWordMax: 120,
  /** 피칭 이메일 본문 권장 단어 수 (팩 명시치) */
  pitchEmailWordMin: 150,
  pitchEmailWordMax: 200,
  /**
   * 검증 불가 수치 처리 — 창작 금지, placeholder로 남기고 사용자에게 근거를 요청한다.
   * 배포본에 placeholder가 잔존하면 체크리스트 위반(high).
   */
  unverifiablePlaceholder: "[확인 필요]",
} as const;

/**
 * ⚠️ 보도자료 **전체 분량** 기준은 팩에 없다(확인됨). 아래 값은 크랩피치 폼의
 * 기존 산출 규격이며 팩 근거가 아니다 — 팩 개정 시 재대조 대상에서 제외한다.
 */
export const CRABPITCH_FORM_BODY_CHARS = { min: 300, max: 500 } as const;

/* ── ③ GEO(생성형 엔진 최적화) ───────────────────────────────
 * 출처: doc 0461be2c-55bf-4b9d-a5e8-bd719223b9cf (linkup-geo/README.md,
 *       "LinkUp GEO PR Skill Engine" PART 1~3 + 이미지 가이드라인 + 실무 체크리스트)
 * 철학: "구조(Structure)가 곧 인용성(Citability)이다."
 */

export const GEO_PHILOSOPHY =
  "AI는 화려한 문장이 아니라 검증 가능한 수치와 이해하기 쉬운 구조를 인용한다.";

export const GEO_RULES: Array<{ rule: string; detail: string }> = [
  { rule: "첫 100단어의 법칙", detail: "헤드라인과 리드문(첫 100단어 이내)에 누가·무엇을·언제·구체적 수치를 모두 담는다." },
  { rule: "Key Takeaways 배치", detail: "최상단에 [3줄 요약]을 불릿으로 배치한다." },
  { rule: "정보의 덩어리화(Chunking)", detail: "섹션마다 검색 의도가 반영된 H2/H3 소제목을 단다. 줄글 나열 금지." },
  { rule: "구조화된 데이터", detail: "스펙·비교·장단점은 문장이 아니라 표 또는 불릿으로." },
  { rule: "FAQ 꼬리말", detail: "본문 하단에 Q&A 섹션을 둔다 — 생성형 AI의 답변 출력 패턴과 형태를 맞춘다." },
  { rule: "의도 기반형 헤드라인", detail: "사실 나열이 아니라 검색 질문·해결책 형태로 제목을 설계한다." },
  { rule: "One Idea Rule", detail: "복문 대신 단문. 한 문단 3~4문장, 문단만 떼어 읽어도 의미가 완결돼야 한다." },
  { rule: "시맨틱 다양성", detail: "같은 키워드 반복은 스팸으로 인지될 수 있다. 문맥 기반 유의어를 쓴다." },
  { rule: "형용사 타파 → 수치 치환", detail: "'혁신적인·최고의' 같은 홍보성 형용사를 배제하고 '처리 시간 30% 단축'처럼 검증 가능한 수치로 바꾼다." },
  { rule: "엔티티 표기 통일", detail: "회사명·제품명의 국·영문 표기를 띄어쓰기까지 통일한다(다중 객체 오인식 방지)." },
  { rule: "사실 주장형 실명 코멘트", detail: "'기쁘다·기대된다'식 소회 금지. 실명·직책 + 전문적 견해." },
  { rule: "교차 검증 링크", detail: "공신력 있는 외부 기관 통계를 함께 인용해 객관성을 확보한다." },
];

export const GEO_TARGETS = {
  /** [3줄 요약] 항목 수 */
  keyTakeaways: 3,
  /** 리드에서 핵심을 끝내야 하는 단어 수 */
  firstWords: 100,
  /**
   * ⚠️ FAQ **문항 수는 팩에 규정이 없다**(섹션 존재만 필수). 팩의 "기자 예상 Q&A 10~15개"는
   * 보도자료 부록 Q&A이지 GEO 꼬리말이 아니다 — 여기서 임의 수치를 만들지 않는다.
   */
  faqCount: undefined as number | undefined,
} as const;

/** GEO 이미지 자산 규칙 — 프레스킷·보도자료 공통. */
export const GEO_ASSET_RULES = {
  filenamePattern: "[기업명]-[제품명]-[핵심키워드].png",
  filenameBadExamples: ["KakaoTalk_2026….jpg", "스크린샷.png"],
  alt: "주관적 수식어 없이 누가·무엇을 나타내는 이미지인지 단문으로 기술",
  caption: "이미지 바로 아래 1줄, 본문 핵심 키워드와 일치시킨다",
} as const;

/* ── ④ 표시광고법 게이트 (pressLint·emailCompliance 공용) ────
 * 출처: doc 4dc31c2b-5aba-4bd8-b72c-bfb29ac5e9ff (pr-compliance/SKILL.md — L1~L6 원문 + 대체 표현 매핑)
 *       doc 3b0d4415-4832-40af-8d5f-71dddef2b841 (guardrails.md — 게이트 규칙)
 *       doc de58a74a-d9d4-4242-b63c-0634712823e5 (skpr-compliance-checker.md)
 * 법 근거: 표시·광고의 공정화에 관한 법률(비교광고는 제3조 부당비교광고)
 *
 * 엔진 원칙(팩): ①규칙 먼저 ②LLM은 맥락만 ③차단이 아닌 **대체 표현 제안**(critical 제외)
 */

export type ViolationSeverity = "critical" | "high" | "medium";

export interface BannedTerm {
  pattern: RegExp;
  label: string;
  severity: ViolationSeverity;
  /** 팩의 대체 표현 매핑 */
  replacement: string;
}

/**
 * L1 — 금칙어(Hard Block). 팩 원문 목록:
 *   완벽한 / 절대 / 무결점 / 100% / 전부 / 모두 / 무조건 / 반드시 / 단연 /
 *   타의 추종을 불허 / 업계 최초 / 세계 최초 / 완전 무료 / 전액 무료
 *
 * ⚠️ 오탐 완화 — "모두·전부·반드시·절대"는 일상 문맥 빈도가 매우 높다. 팩의 단어 목록을
 *    그대로 정규식화하면 정상 문장이 대량 차단된다. 그래서 **보장·안전·성공 등 단정
 *    맥락과 붙어 있을 때만** 잡도록 스코프를 좁혔다(게이트가 발송을 막는 비가역 행위라
 *    오탐 비용이 크다). 단어 자체의 존재는 LLM 맥락 판단(2차)에 맡긴다.
 */
export const L1_BANNED_TERMS: BannedTerm[] = [
  {
    pattern: /(업계|세계|국내|국내외)\s*최초/g,
    label: "근거 없는 '최초' 주장",
    severity: "critical",
    replacement: "범위와 출처를 병기하세요. 예: '국내 통신업계 최초(과기정통부 2026년 4월 자료 기준)'",
  },
  {
    pattern: /100\s*%/g,
    label: "100% 단정 표현",
    severity: "critical",
    replacement: "'대부분의 경우' 또는 측정 조건과 함께 실측치를 제시하세요.",
  },
  {
    pattern: /(절대|무조건|반드시)\s*(안전|안심|성공|보장|가능)/g,
    label: "절대적 보장",
    severity: "critical",
    replacement: "'대체로·일반적으로' 등 조건부 표현 + 근거로 바꾸세요.",
  },
  {
    pattern: /완전\s*무료|전액\s*무료/g,
    label: "완전·전액 무료",
    severity: "high",
    replacement: "'기본 무료(조건 확인)'처럼 조건을 함께 적으세요.",
  },
  {
    pattern: /완벽(한|하게|히)?|무결점/g,
    label: "완벽·무결점",
    severity: "high",
    replacement: "'안정적인·완성도 높은' + 구체적 성능 수치",
  },
  {
    pattern: /단연|타의\s*추종을\s*불허/g,
    label: "단연·타의 추종 불허",
    severity: "high",
    replacement: "'독자적인·차별화된' + 무엇이 다른지 사실 기술",
  },
];

/**
 * L2 — 최상급 표현(근거 필수). 팩 조건: ①공신력 기관 통계 인용 ②인용 시기 6개월 이내
 * ③본문에 출처 명시. 근거가 없으면 L1으로 강등 처리한다는 것이 팩 규칙이다.
 * rule_id 예: ADV-002 / STYLE-SUPER-001
 */
export const L2_SUPERLATIVES: BannedTerm[] = [
  {
    pattern: /(업계|국내|세계)\s*(1\s*위|최고|최대|최장|최저)/g,
    label: "최상급 + 범위 주장",
    severity: "high",
    replacement: "조사기관·조사 시점·모집단을 병기하세요(6개월 이내 자료).",
  },
  {
    pattern: /유일한|유일무이/g,
    label: "유일성 주장",
    severity: "high",
    replacement: "확인한 범위를 명시하세요. 예: '당사가 확인한 국내 사례 중'",
  },
  {
    pattern: /(가장|제일)\s*(빠른|저렴한|우수한|뛰어난|높은)/g,
    label: "비교 최상급",
    severity: "medium",
    replacement: "비교 대상과 측정 방법을 명시하세요.",
  },
];

/** L2 근거로 인정되는 조건(팩) — UI·프롬프트 안내 문구에 사용. */
export const L2_EVIDENCE_CONDITIONS = [
  "공신력 있는 기관의 통계·조사를 인용할 것",
  "인용 자료가 6개월 이내일 것",
  "본문에 출처를 명시할 것(예: '2026년 ○○ 조사 기준')",
] as const;

/**
 * L4 — 출처 누락 검증. 팩의 정량 표현 패턴을 그대로 이식한다.
 * 매칭된 문장 또는 인접 문맥에 출처 표지(기관명·연도·URL)가 없으면 위반.
 */
export const NUMBER_PATTERN = /\d[\d,.]*\s*(%|퍼센트|배|만\s*명|명|건|위|억|천|원|달러)/g;

/** 출처 표지 — 이 중 하나가 수치 근처에 있으면 L4 통과. */
export const SOURCE_MARKERS = [
  "출처",
  "기준",
  "자료",
  "조사",
  "집계",
  "발표",
  "보고서",
  "통계",
  "인용",
  "에 따르면",
  "according",
  "source",
];

/** 팩이 제시한 인용 표기 포맷 — 사용자 안내·프롬프트에 사용. */
export const CITATION_FORMATS = [
  "통계 인용: \"{기관} {년도} 조사에 따르면 {수치}\"",
  "리포트 인용: \"{조사기관} {리포트명} ({년도})\"",
  "타사 발표 인용: \"{회사}는 {날짜} {내용}을 발표했다 ({출처 URL})\"",
] as const;

/**
 * 코드화하지 않는 레벨 — 이유를 명시해 둔다(1차 범위 결정).
 *  L3 비교광고 : 타사 엔티티 목록이 필요하고 팩 예시는 통신 3사 하드코딩 → LLM 맥락 판단(2차)
 *  L5 내부자료 : 팩 전제(사내 문서 저장소 `visibility: internal`)가 크랩피치에 없다 —
 *                사용자가 자기 회사 보도자료를 직접 쓰는 구조라 해당 위험 모델이 성립하지 않는다.
 *  L6 스타일북 : 어휘가 사실상 전부 특정 기업 상수 → 범용 "표기 통일 원칙"만 지침으로 남긴다.
 */
export const UNCODED_LEVELS = [
  { level: "L3", name: "비교광고", reason: "경쟁사 엔티티 목록 필요 — LLM 맥락 판단(2차)" },
  { level: "L5", name: "내부자료 인용", reason: "사내 문서 저장소 전제가 크랩피치에 없음" },
  { level: "L6", name: "스타일북 일관성", reason: "어휘가 회사 고유 상수 — 표기 통일 원칙만 지침화" },
] as const;

/** L6에서 이식 가능한 범용 원칙만. */
export const NAMING_CONSISTENCY_RULES = [
  "회사명 표기를 띄어쓰기까지 통일하고, 영문 병기 규칙을 문서 전체에서 고정한다",
  "제품·서비스명은 공식 표기를 유지한다",
  "직책 표기 구조를 고정하고 약어를 쓰지 않는다",
  "같은 값의 수치 표기를 혼용하지 않는다(병기 규칙을 문서 상단에 고정)",
] as const;

/**
 * 게이트 판정 규칙 (팩 guardrails.md 원문).
 *  critical ≥ 1        → fail (출력 차단, 재작성 최대 2회 후 사용자 에스컬레이션)
 *  high ≥ 3 또는 medium ≥ 5 → warn (사용자 승인 필수)
 *  그 외                → pass
 * ⚠️ critical은 자동 치환(auto_fix)하지 않는다 — 반드시 작성자가 개입한다.
 */
export const GATE_THRESHOLDS = {
  failCritical: 1,
  warnHigh: 3,
  warnMedium: 5,
} as const;

/* ── ⑤ 프레스킷(미디어킷) 목차·검수 ──────────────────────────
 * 출처: doc 39b55e98-4940-45e4-9c15-f97d8132e3e1
 *       (official-reference-index/presskit_pressrelease_source_collection.md
 *        "프레스킷 권장 목차" · "5. 관찰된 공통 패턴" · "6. 바로 적용할 품질 체크리스트")
 */

export const PRESS_KIT_SECTIONS: string[] = [
  "① 한 문장 회사 정의와 80~120자 요약",
  "② 회사 개요: 설립연도·본사·시장·핵심 수치",
  "③ 창업 배경과 주요 연혁",
  "④ 대표 제품·서비스 설명",
  "⑤ 창업자·경영진 약력과 고해상도 인물 사진",
  "⑥ 로고·제품 사진·스크린샷·영상 B-roll",
  "⑦ 최근 보도자료와 주요 언론 보도",
  "⑧ 표준 회사 소개문(보일러플레이트)",
  "⑨ 자산 사용 규정과 사진 크레딧",
  "⑩ 언론 문의 담당자·이메일·전화번호",
];

export const PRESS_KIT_CHECKLIST: string[] = [
  "제목에 회사명·행동·핵심 결과가 들어갔는가",
  "첫 문단에 누가·무엇을·언제·어디서·왜·어떻게가 압축됐는가",
  "과장 표현 대신 검증 가능한 숫자·출처가 있는가",
  "인용문이 새 정보나 판단을 더하는가",
  "회사 소개문이 100단어 안팎으로 표준화됐는가",
  "기자가 바로 쓸 수 있는 원본 이미지와 캡션이 있는가",
  "로고·사진의 사용 조건과 크레딧이 명확한가",
  "담당자 이름·이메일·전화번호가 실제로 작동하는가",
  "모바일에서도 문서와 다운로드 링크가 잘 열리는가",
  "배포 전 고유명사·날짜·수치·링크를 교차 검증했는가",
];

/** 자산 사용 규정 필수 4항 (팩: 에디토리얼 전용 여부·수정 금지·크레딧·상표 사용 제한). */
export const ASSET_POLICY_ITEMS: string[] = [
  "사용 허용 범위(보도 목적 한정 여부)",
  "수정·변형 금지 사항(로고 비율·색상 변경 등)",
  "저작권·크레딧 표기 방법",
  "상표 사용 제한 및 추가 자산 문의처",
];

/** 프레스킷 설계 철학 — SKILL.md·UI 안내에 인용. */
export const PRESS_KIT_PHILOSOPHY =
  "좋은 프레스킷은 소개서 PDF 한 개가 아니라, 기자가 기사 작성에 필요한 텍스트·시각 자산을 검색하고 내려받을 수 있는 허브다.";

/* ── 프롬프트 주입용 요약 ───────────────────────────────────── */

/**
 * LLM 프롬프트에 넣을 **요약형** 규칙. 전체 가이드는 MCP 도구 `crabpitch_press_guide`로 분리한다
 * (프롬프트가 비대해지면 모델이 규칙을 놓친다).
 */
export function compactRulesForPrompt(): string {
  return [
    `구조: ${PRESS_STRUCTURE.map((s) => s.name).join(" → ")}`,
    `리드는 정확히 ${WRITING_RULES.leadSentences}문장(발표 사실 → 배경·차별점 → 기대효과)으로 5W1H를 끝낸다.`,
    `문장은 ${WRITING_RULES.sentenceCharTarget}자 지향·${WRITING_RULES.sentenceCharMax}자 상한, 한 문단 ${WRITING_RULES.paragraphSentencesMax}문장 이내.`,
    `첫 ${GEO_TARGETS.firstWords}단어 안에 누가·무엇을·언제·수치를 모두 담고, 한 문장에 아이디어 하나만 담는다.`,
    `홍보성 형용사(혁신적·최고의)를 쓰지 말고 검증 가능한 수치로 바꾼다.`,
    `검증할 수 없는 수치는 창작하지 말고 "${WRITING_RULES.unverifiablePlaceholder}"로 남긴다.`,
    `근거 없는 "업계/세계 최초", "100%", "절대 보장", 무출처 최상급·순위 주장은 금지한다.`,
    `모든 정량 표현에는 출처 또는 집계 기준을 병기한다.`,
    `임원 코멘트는 실명·직책을 밝히고 제목을 반복하지 않는다(결정 이유·시장 해석·향후 계획 중 1개).`,
  ].join("\n");
}

/** 가이드 섹션 조회 — MCP 도구 `crabpitch_press_guide`가 소비. */
export type GuideSection = "structure" | "writing" | "geo" | "adlaw" | "presskit" | "all";

export function guideSectionText(section: GuideSection): string {
  const blocks: Record<Exclude<GuideSection, "all">, string> = {
    structure: [
      "## 보도자료 표준 구조",
      ...PRESS_STRUCTURE.map((s) => `${s.order}. **${s.name}** (${s.lengthHint}) — ${s.purpose}`),
      "",
      "※ 바디는 2~3개 가변이다(팩 문서 간 표기가 다름).",
    ].join("\n"),
    writing: [
      "## 작성 전략",
      `- 리드 ${WRITING_RULES.leadSentences}문장: ①발표 사실 ②배경·차별점 ③기대효과·다음 스텝`,
      `- 문장은 ${WRITING_RULES.sentenceCharTarget}자 지향, ${WRITING_RULES.sentenceCharMax}자를 넘기지 않는다(초과 시 분할).`,
      `- 한 문단 ${WRITING_RULES.paragraphSentencesMax}문장 이내, 문단만 떼어 읽어도 의미가 완결돼야 한다.`,
      `- 수동태는 ${Math.round(WRITING_RULES.passiveVoiceMaxRatio * 100)}% 미만으로.`,
      `- 핵심 메시지는 ${WRITING_RULES.keyMessagesMax}개 이내, 임원 코멘트는 ${WRITING_RULES.executiveQuotesMin}~${WRITING_RULES.executiveQuotesMax}개(실명·직책 명시).`,
      `- 보일러플레이트 ${WRITING_RULES.boilerplateWordMin}~${WRITING_RULES.boilerplateWordMax}단어.`,
      `- 검증할 수 없는 수치는 쓰지 않는다. "${WRITING_RULES.unverifiablePlaceholder}"로 남기고 근거 자료를 요청한다.`,
      `- 배포본에 placeholder가 남아 있으면 위반이다.`,
    ].join("\n"),
    geo: [
      "## GEO (생성형 엔진 최적화)",
      `> ${GEO_PHILOSOPHY}`,
      ...GEO_RULES.map((r) => `- **${r.rule}**: ${r.detail}`),
      "",
      "### 이미지 자산",
      `- 파일명: \`${GEO_ASSET_RULES.filenamePattern}\` (금지 예: ${GEO_ASSET_RULES.filenameBadExamples.join(", ")})`,
      `- Alt: ${GEO_ASSET_RULES.alt}`,
      `- 캡션: ${GEO_ASSET_RULES.caption}`,
      "",
      "※ FAQ 섹션은 두되 문항 수 규정은 없다.",
    ].join("\n"),
    adlaw: [
      "## 표시광고법 게이트",
      "원칙: 규칙 검사를 먼저 하고, LLM은 맥락만 본다. critical을 제외하면 차단이 아니라 대체 표현을 제안한다.",
      "",
      "### L1 — 금칙어",
      ...L1_BANNED_TERMS.map((t) => `- ${t.label} (${t.severity}) → ${t.replacement}`),
      "",
      "### L2 — 최상급·순위 주장 (근거 필수)",
      ...L2_SUPERLATIVES.map((t) => `- ${t.label} (${t.severity}) → ${t.replacement}`),
      `근거 인정 조건: ${L2_EVIDENCE_CONDITIONS.join(" / ")}`,
      "",
      "### L4 — 수치-출처 근접",
      `- 정량 표현 인근에 ${SOURCE_MARKERS.slice(0, 6).join("·")} 등 출처 표지가 없으면 위반.`,
      ...CITATION_FORMATS.map((f) => `- ${f}`),
      "",
      `### 판정: critical ${GATE_THRESHOLDS.failCritical}건 이상 → 차단 / high ${GATE_THRESHOLDS.warnHigh}건 또는 medium ${GATE_THRESHOLDS.warnMedium}건 이상 → 승인 필요`,
      "※ critical은 자동 치환하지 않는다 — 작성자가 직접 고쳐야 한다.",
      "",
      ...UNCODED_LEVELS.map((l) => `※ ${l.level} ${l.name}: 코드 검사 대상 아님 (${l.reason})`),
      "※ 표시·광고 계열만 다룬다. 언론중재법(정정·반론보도)은 범위 밖이며 법률 검토를 대체하지 않는다.",
    ].join("\n"),
    presskit: [
      "## 프레스킷 권장 목차",
      `> ${PRESS_KIT_PHILOSOPHY}`,
      ...PRESS_KIT_SECTIONS.map((s) => `- ${s}`),
      "",
      "### 품질 체크리스트",
      ...PRESS_KIT_CHECKLIST.map((s) => `- [ ] ${s}`),
      "",
      "### 자산 사용 규정 필수 항목",
      ...ASSET_POLICY_ITEMS.map((s) => `- ${s}`),
    ].join("\n"),
  };

  if (section === "all") return Object.values(blocks).join("\n\n");
  return blocks[section];
}
