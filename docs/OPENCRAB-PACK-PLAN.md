# 크랩피치 × 오픈크랩 팩 고도화 통합 기획서

기준 코드: `/home/user/crabpitch` (HEAD `ae31294`). 트랙 A(기자단 동기화)·B(보도자료 스킬)·C(프레스킷 스킬)·D(메일링·응대) 4개 기획을 단일 기획서로 통합하고, 트랙 간 모순 해소·중복 작업 병합·의존성 명시를 반영했다.

---

## 0. 구현 반영 현황 (2026-07-26 갱신)

이 기획서는 **팩을 실제로 호출해 보기 전에** 작성됐다. 구현 과정에서 검증으로 뒤집힌 전제가 있어 아래에 기록한다. **본문의 해당 서술보다 이 절이 우선**한다.

### 검증으로 뒤집힌 전제

| 기획서 서술 | 실측 결과 | 구현이 택한 길 |
|---|---|---|
| F2 "MCP `pack_query` 유실 버그를 수정한다" | `pack_query`는 **예외를 던지지 않고 조용히 `documents: 0`을 반환**한다. 인자를 복원했다면 매칭 경로가 소리 없이 0건이 됐을 것이다 | 서버가 실제로 해석하는 `package_id`로 스코프를 걸고, 빈 결과면 스코프 없이 재조회하는 폴백을 둔다. 빈 결과 판정은 `try/catch`가 아니라 `evidence` 배열 검사로 한다 |
| 레코드에 `top_reference_title`·`top_reference_url`이 있다 | **두 필드는 존재하지 않는다.** `reference_articles[0]`에서 파생해야 한다 | `opencrabMap`이 배열 첫 항목에서 채우고, 없으면 비운다 |
| `contact_source_urls`·`beat_distribution`·`beat_secondary`가 배열/객체다 | **파이프(`\|`) 구분 단일 문자열**이다. `beat_distribution`은 `"라벨:개수\|라벨:개수"` 형태 | 파이프 전용 파서를 분리했다. URL이 포함된 필드를 범용 다중 구분자(`/[,·\|/]/`)로 자르면 파손된다 |
| 결손 판정에 `record_count`·`full_chunk_count`를 쓴다 | `full_chunk_count`는 **신뢰 불가**(실측 3청크를 2로, 저장 8개를 16으로 보고) | 결손은 오직 청크의 `char_start` 연속성으로 판정한다 |
| 리스크 1 "batch-025 evidence chunk 결손 — reference-pack 병합으로 보완" | 상류 인제스트 단계에서 **원문의 약 41%만 저장**돼 JSON 파싱 자체가 불가능하다. 선언 8건 중 완전 복원 2건. **재시도로 복구되지 않는다** | 결손으로 기록하고 `/admin`에 "복구 불가"로 명시한다. 근본 해결은 오픈크랩 측 재인제스트가 필요하다 |
| GEO FAQ "3~5문항" | 팩에 **FAQ 문항 수 규정이 없다**(섹션 존재만 필수) | `GEO_TARGETS.faqCount`를 `undefined`로 두고 개수를 강제하지 않는다 |
| 보도자료 전체 분량 규범 | 팩에 **없다**. 폼의 300~500자는 크랩피치 자체 규격이다 | `CRABPITCH_FORM_BODY_CHARS`로 분리하고 팩 개정 시 재대조 대상에서 제외한다 |
| 8단 표준 양식 | 팩 문서 간 불일치(바디 2개 vs 3개) | 바디를 **2~3개 가변**으로 두어 양쪽과 모순되지 않게 한다 |
| PR 팩과 기자단 팩이 같은 워크스페이스 | **워크스페이스가 다르다** (기자단 `f5a34200-…` / PR `ab2da385-…`) | 레지스트리에 둘 다 기록 |

### 추가로 드러난 제약

- `search_documents`는 `limit` 상한 100이고 **offset·커서가 없다.** 청크 100개(약 90KB)를 넘는 팩은 단일 호출로 전량 취득할 수 없다.
- PR 지식 팩에는 같은 계열 후속본이 5종 더 있다. 자동 전환하지 않고 관리자 승인 대상으로만 표시한다.
- 팩에 특정 기업(SK텔레콤) 스타일북 상수·경쟁사 리터럴·합성 데모가 섞여 있다. `pressGuide.ts`에는 범용 규칙만 이식하고, 회사 고유 표기는 사용자 입력으로 외부화했다. L5(내부자료 인용 차단)는 사내 문서 저장소라는 전제가 크랩피치에 없어 코드화하지 않는다.

### 구현 중 잡은 자체 결함

- 크랩피치 기본 템플릿이 **자기 발송 게이트에 걸렸다.** "인터뷰를 원하시면 회신 주세요"를 CTA 2개로 세던 탓. 요청 종류와 응답 경로를 분리해 세고, 프리셋 × 매체 조합 자기검사 테스트로 고정했다.
- 한 통도 나가지 못한 캠페인이 "발송 완료"로 남아 크론이 매분 재시도했다. 승인 단계로 되돌리고 예약 시각을 해제한다.
- LLM 개인화의 호칭 보정이 실명 주입 앵커와 어긋나 실명이 주입되지 않을 수 있었다.

### 진행 상태

- **1차(M0~M4): 완료.** 발송 확정 3경로 단일화, 팩 동기화 파이프라인, 규범 정본 상수, 보도자료 lint(warn-only), 7블록 메일, 프레스킷 배점·AI 지원까지.
- **2차 착수분**: S3(신선도 감점) · S4(매칭 재보정) · S5(PR 팩 재대조 발행) · S6(정합성 검증) · S7(GEO 필드) · S8(프리셋 앵글·방송 포맷) · S10(프레스킷 확장) · S11(회신 분류 폴백) · S13(팔로업).
- **보류**: S1·S2(팩 임베딩 생성이 전제 — 레포 외부 작업) · S9(언론중재법은 팩 범위 밖이라 별도 법률 소싱 필요) · S14(writing_style 데이터 없음) · pressLint 게이트화(실사용 오탐률 확인이 전제).

### 3차 — 외부 스킬 생태계 분석에서 나온 보강 (gongnyang 7개 저장소)

7개 저장소는 전부 Claude Code 스킬이라 크랩피치 서버가 아니라 **스킬·MCP 경로**에 붙는다.
서버에서 LLM 없이 결정적으로 돌릴 수 있는 것만 골라 넣었다.

| # | 항목 | 구현 | 성격 |
|---|---|---|---|
| ① | 파일럿 게이트 — 1건도 확인하지 않은 캠페인은 전체 발송 보류 | `lib/pilotGate` + 4경로(즉시·예약·크론·Gmail) | **차단** |
| ② | 보일러플레이트 단일 소스 대조 + 본문 수치 ⊆ 팩트시트 수치 | `lib/factCheck` → `pressLint` | warn-only |
| ③ | 캠페인 내 메일 상호 유사도 — 개인화가 실제로 걸렸는지 | `lib/campaignSimilarity` | warn-only |
| ④ | 자산 파일명 검사기를 의미 기반으로 교정 | `lib/mediaKitCompleteness` | 배점 |

**①이 유일한 차단인 이유** — 규칙 검사는 표현·수치·구조만 본다. "이 문장이 이 기자에게
말이 되는가"는 사람만 판정할 수 있고, 한 클릭에 수십 통이 나가는 구조에서 그 판정이 한 번도
없었던 것이 가장 비싼 사고다. 전량 검토가 아니라 **1건**만 요구한다. Gmail 초안 생성 경로는
연결 사용자에게 기본 경로라 여기도 같이 막았다(`internal.drafts.pilotGateStatus`).

**②·③·④가 warn-only인 이유** — 전부 새 규칙이라 실사용 오탐률이 아직 없다. pressLint와
같은 원칙을 따른다(1차 warn → 오탐률 확인 후 게이트화 판단).

**의도적으로 남긴 한계**

- ③은 **어미만 손본 재탕을 잡지 못한다.** 개인화 구간이 한두 문장뿐이라, 그걸 잡는 임계값이면
  서로 다른 기사를 인용한 정상 초안(템플릿 꼬리가 같다)도 함께 걸린다. 실제 중복은
  `personalHook`의 generic 폴백 때문에 바이트 단위로 같게 나오므로 임계값 0.9로 충분하다.
- ②의 수치 대조는 **팩트시트가 비어 있으면 아예 돌지 않는다.** 대조할 원본이 없는데
  "근거 없음"을 띄우면 전부 오탐이고, 사용자는 경고 전체를 무시하게 된다.
- ④의 회사명 포함 조건은 **회사명을 아는 경우에만** 적용한다.

**별건으로 남은 문제** — Gmail 초안 생성 경로(`gmailActions.pushCampaignToGmail` →
`gmailAccounts.markDraftsSentWithGmail`)는 수신거부 재대조와 파일럿 게이트만 통과하고
**7일 쿨다운·표현 규정·캠페인당 상한·월 한도를 건너뛴다.** `finalizeCampaignSend`를 통과하지
않는 유일한 확정 경로다. ①~④ 범위 밖이라 이번에 손대지 않았다.

---

## 1. 개요

### 1-1. 오픈크랩 팩 3종 현황

| 팩명 | package_id | 규모 | 용도 |
|---|---|---|---|
| **기자단 배치 팩** `korean-journalist-contacts-batch-001~026` | 배치별 26개 ID (워크스페이스 `f5a34200-17fb-4ce5-bea6-b979dfa1a3cd`, `packRegistry.ts`에 매핑 수록) | 기자 **201명**(001~025 각 8명 + 026 1명), 레코드당 16필드(beat 분포·근거 기사·검증 이메일 등) | `journalists` 동기화 **1차 데이터 소스**(트랙 A) → 매칭·메일 개인화 원료(트랙 D) |
| **기자단 reference 팩** (201건 마스터) | `7db39961-…` | 201건 전량 단일 문서 | 배치 팩 evidence chunk 결손 보완용 **보조 소스** + 정합성 검증(카운트 대조). 파생 시리즈(index/index-v2/topic-routing)는 1차 제외 — 단 이 "제외"는 **동기화 파이프라인 한정**(F2 주의사항 참조) |
| **PR 지식 팩** `pr-presskit-intelligence-ontology-v2` | v2 정본(QA A/90, v1 전체 포괄; **ID는 F3의 확정·수록 절차 — `search_packs` 조회→ID 고정→레지스트리 커밋 — 로 확정**) | 문서 54 · 청크 322 · 노드 411 | 보도자료 8단 양식·GEO·표시광고법 게이트(트랙 B·D), 프레스킷 10항 목차·검수 기준(트랙 C)의 **지식 소스** |

### 1-2. 고도화의 큰 그림

**팩 = 지식·데이터 소스, 크랩피치 = 실행 레이어.** 팩은 두 종류이고 이식 방식이 다르다.

- **데이터 팩(기자단)** → **동기화 파이프라인**: LLM 없는 순수 파싱으로 Convex DB에 전량·반복 반입(email 키 업서트). 매칭·초안·발송은 DB만 조회하고 팩을 실시간 질의하지 않는다.
- **지식 팩(PR)** → **정적 baking(1차)** + **런타임 질의(2차, 조건부)**: 규범 지식(양식·규칙·금칙어)은 코드 상수·SKILL.md·프롬프트로 굽고, 사례·롱테일만 팩 보완(임베딩 생성 등) 후 런타임 질의로 개방.

**전 트랙 공통 제품 원칙**: ① LLM 실행은 유저 본인 것만(BYOK / 유저 챗 MCP) — 서버는 결정적 코드·순수 파싱만 수행 ② 기자 PII는 관리자 화면·초안·MCP 응답에 비노출 ③ `mailing_status`는 항상 `"candidate"` 강제 + 자동 발송 금지 ④ 컴플라이언스(수신거부·쿨다운·**캠페인당 통수 상한**)는 **발송 확정 3경로(즉시·예약·크론 백업) 모두에서** 서버가 강제.

### 1-3. 트랙 간 모순 해소·중복 병합 결정 (통합 원칙)

| # | 충돌 | 결정 |
|---|---|---|
| 1 | **7일 쿨다운 시기·위치** — A는 2차(`cooldown.ts` 신규), D는 1차(`sendGuard.ts` 확장) | **D안 채택(1차)**. `convex/lib/cooldown.ts`는 만들지 않고 `sendGuard.ts`에 `partitionByCooldown` 추가(기존 `partitionBySuppression` 동형). 판정 스코프는 **사용자 단위**(트랙 D 상세), 적용 지점은 **발송 확정 3경로 공통 함수**(D-4 `finalizeCampaignSend`). 원칙 ④는 1차 가치이며, 전제인 팩 동기화 비덮어쓰기 화이트리스트(F6)가 같은 선행 마일스톤에 있어 충돌 없음 |
| 2 | **동기화 시각 필드명** — A `packSyncedAt` vs D `lastSyncedAt` | `packSyncedAt`으로 통일(+`lastSeenInPackAt`). D 문서의 `lastSyncedAt`은 폐기 |
| 3 | **근거 기사 저장** — A는 top 1건+`latestArticleAt`, D는 `referenceArticles[]` 다건 | **다건 채택**: `referenceArticles[]`(최대 3건: title·url·topic?·publishedAtText?) 저장, `latestArticleAt`은 그 파생 max값. 기존 `topReferenceTitle/Url`은 첫 항목으로 계속 채워 하위 호환 |
| 4 | **기사 URL 날짜 파싱 유틸** — A4(packSync)와 D2(opencrabMap) 이중 구현 | `packSync.ts` 1곳 구현, `opencrabMap.ts`가 소비 |
| 5 | **MCP `pack_query` 유실 수정** — A3·D3·B(2차 전제) 3중 계상 | 공통 기반 **F2 단일 작업**으로 통합. B·D는 소비만 |
| 6 | **journalists 스키마 확장** — A1과 D1이 각자 계상(`naverOid`·`beatDistribution` 중복) | **F1 통합 1회 커밋**으로 병합 |
| 7 | **금칙어·수치 패턴 테이블** — B(pressLint)와 D(emailCompliance) 각자 보유 | 정본은 `pressGuide.ts`(F7) 1곳. 두 lint가 상수를 공유하되 **게이트 정책은 도메인별 차등**: 보도자료는 warn-only(오탐률 확인 후 게이트화), 메일은 발송이라는 비가역 행위 직전이므로 critical=FAIL 즉시 적용 — 모순이 아니라 의도된 차등 |
| 8 | **media-kit-builder SKILL 개정** — B 2차(C6)와 C 1차(C1) 중복 | C 1차 항목에 흡수(프레스킷 10항·자산 규정 4항·GEO 파일명 규칙 포함) |
| 9 | **scoring 확장** — A 2차(B2)와 D 2차(E5) 각자 계상 | 2차 **S4 단일 작업**으로 통합(beatDistribution·referenceArticles 다건·contactEvidenceCount·naver_oid 기반 매체급) |
| 10 | **데이터 신선도 대응** — A(admin 기준일 노출)와 D(낡은 데이터 generic 폴백 강등) | 상보적이므로 둘 다 채택: 기준일은 admin·매칭 화면에 노출(A), 후킹 인용은 `packSyncedAt` 연동 강등 규칙(D). **1차에 추가**: 승인 화면·매칭 reason의 "팩 최종 확인 N일 경과" 배지(D-10)와 stale 임계 초과 레코드 매칭 기본 제외 admin 토글(A-4) — 완전한 stale 마킹·감점은 S3 유지 |

---

## 2. 아키텍처

### 2-1. 팩 → 크랩피치 데이터/지식 흐름

```
[OpenCrab 워크스페이스]                      [크랩피치: Convex + Next.js]

■ 데이터 팩 (기자단)                          ── 실행 레이어 ──
 contacts-batch-001~026 ─┐  MCP tools/call   ┌────────────────────────────────┐
 reference-pack(201) ────┤  search_packs      │ 동기화 파이프라인 (트랙 A, LLM 무사용)│
 (index/topic-routing:   │  search_documents  │ packRegistry → callOpenCrabMcpTool │
  1차 제외)              ┘  query(+pack스코프) │ → packSync 파서 → opencrabMap     │
        │ 크론(일1회 diff) + /admin 수동 트리거 │ → opencrab.upsert(화이트리스트)    │
        ▼                                    │ journalists / opencrabPacks /     │
                                             │ packSyncRuns                      │
                                             └───────┬────────────────────────┘
                                                     │ DB 조회만 (팩 실시간 질의 없음)
                                                     ▼
                                    매칭(scoring) → 6→7블록 템플릿(emailTemplate:
                                    standard+프리셋 3종+커스텀)
                                    → BYOK 개인화(anthropicEnhance)
                                    → 게이트(emailCompliance + sendGuard:
                                       수신거부·쿨다운·캠페인 상한·critical FAIL
                                       — 발송 확정 3경로 공통 finalizeCampaignSend)
                                    → 사용자 승인 → 본인 Gmail 발송
                                    → 회신 분류(replyClassifier) → 억제 등록

■ 지식 팩 (pr-presskit-v2)
 양식·규칙·금칙어 ── 정적 baking(1차) ──▶ pressGuide.ts 정본 상수(출처 주석 의무)
                                          ├▶ pressLint.ts (보도자료, warn)
                                          ├▶ emailCompliance.ts (메일, FAIL/WARN)
                                          ├▶ 프롬프트(pressPolish/emailEnhance/mediaKit)
                                          ├▶ SKILL.md (정본: skills-public 트리)
                                          └▶ MCP 도구 crabpitch_press_guide
 사례·예시 ──── 런타임 질의(2차) ──▶ queryPressKnowledge (전제: 팩 P0 임베딩·
                                     P1 provenance 완료, pr-agent/ 필터)
```

### 2-2. 런타임 질의 vs 정적 반영(baking) 기준

| 기준 | 정적 baking / 파이프라인 동기화 | 런타임 질의 |
|---|---|---|
| 변화 빈도 | 낮음(규범 지식: 양식·게이트 규칙·금칙어) / 데이터도 일 1회 diff면 충분(팩 갱신은 "새 시리즈 발행" 패턴) | 높거나 롱테일(사례·업종별 앵글·근거 원문) |
| 결정성 | 게이트·lint·발송 차단은 재현 가능해야 함 → 코드 상수 필수 | 참고 컨텍스트로만 사용 |
| 가용성 | `OPENCRAB_API_*` 미설정 사용자·오프라인 스킬 사용자에게도 동작해야 함 | 연결 시에만 선택 단계 |
| 레이턴시·장애 | 동기 UI 액션(`polishPressRelease` 등)에 외부 질의를 결합하지 않음 | 사용자 명시 요청 또는 스킬 선택 단계로 한정 |
| 오염 위험 | 팩에 합성 데모·pr-agent 노이즈·SKT 상수 혼입 → 원문 주입 금지 | 팩 P0(임베딩)·P1(합성 태깅·provenance) 완료 후에만 개방, `pr-agent/` source_path 필터 강제 |

기자단 팩은 어떤 경우에도 **런타임 질의 대상이 아니다** — 항상 파이프라인으로 DB에 반영하고, 실행 레이어는 DB만 본다(레이턴시·evidence 결손·PII 통제 모두 이 방식이 우월). 단, 파생 시리즈(index/index-v2/topic-routing)의 "1차 제외"는 **동기화 파이프라인 한정**이며, 기존 매칭 질의 경로의 index-v2 팩 스코프는 유지한다(F2 참조).

---

## 3. 트랙별 기획

### 트랙 A — 기자단 팩 → journalists 지속 동기화 파이프라인

**목표**: 배치 팩 26개(201명)를 `journalists`로 전량·반복 동기화. 트리거는 /admin 수동 + 일 1회 크론(팩 목록 diff 기반 증분). 동기화 키는 **email**(팩 선언: 1:1, 충돌 0건 — 배치 번호·문서 위치는 재크롤 시 파손되므로 키 금지). LLM 무사용 순수 파싱, `mailingStatus:"candidate"` 강제, admin은 집계만 노출(PII 무노출).

**핵심 설계**:
- **배치 열거**: `packRegistry.ts` 상수(26개 매핑)는 부트스트랩·폴백, 진실 원천은 `opencrab_search_packs` cursor 완주 결과를 담는 신규 `opencrabPacks` 테이블(packageId·series·snapshot 메타·fingerprint·syncEnabled).
- **접근 경로**: 그래프 탐색 배제(concept 노드는 키워드 잡음). `opencrabClient.ts`에서 MCP 세션 수립부를 범용 `callOpenCrabMcpTool(baseUrl, key, toolName, args)`로 추출하고 **기존 `pack_query` 유실 버그(`opencrabClient.ts:143-144`) 동시 수정** — 문서 본문 JSON(`reporters[]`)을 package_id 한정으로 획득, `record_count` 대조로 결손 탐지.
- **소스 전략**: 1차 소스 contacts-batch-001~026 + **reference-pack 보조 병합**(email 업서트라 중복 무해, batch-025류 evidence chunk 결손 리콜 보완). index/topic-routing 계열은 동기화 소스에서 제외.
- **필드 매핑**: 기존 규칙(candidate 강제·email dedupe·**다중 구분자 split `/[,·|/]/` — 콤마·가운뎃점·파이프·슬래시, `opencrabMap.asStringList` 실제 규칙**) 유지 + 팩 고유 필드 수용 — `naverOid`, `contactVerification`, `contactEvidenceCount`, `contactSourceUrls[]`(감사 전용·UI 비노출), `beatDistribution`, `classificationConfidence`, **`referenceArticles[]`(최대 3건, 통합 결정 #3)**, `latestArticleAt`(URL 날짜 파싱 max), `outletCategory`(naver_oid 정적 매핑 — 트랙 D 공급), 동기화 메타(`packPackageId`/`packBatch`/`packSyncedAt`/`lastSeenInPackAt`). `phone`(전부 빈값)·`official_popularity_rank`(전부 null)는 **미수집**(PII 최소화).
- **업서트 보호**: 발송·컴플라이언스 필드(향후 `lastSentAt` 포함)는 **명시적 화이트리스트 방식 patch로 절대 비덮어쓰기** — 트랙 D 쿨다운의 전제. suppression은 동기화 계층에서 참조·수정하지 않음(발송 직전 sendGuard가 재대조 — 책임 분리).
- **변경 감지**: `version` 필드는 전 팩 1.0.0 고정이라 **신뢰하지 않음**. ① 팩 목록 diff(신규 -v2 시리즈는 자동 전환 금지, admin 표시만) ② `snapshot.captured_at`·카운트 변화 ③ 문서 지문(content_bytes+record_count) ④ 신선도(기사일 max)를 admin "데이터 기준일"로 노출.
- **실패 격리**: 신규 `packSyncRuns` 테이블에 run 기록. Convex 액션 비트랜잭션이므로 **팩 1개 단위 커밋** — 1개 실패가 25개를 막지 않음. `fetched < record_count`면 `partial`, 크론이 다음 주기에 failed/partial만 재시도. env 미설정 시 `mode:"skipped"` 폴백 유지.
- **트리거**: 크론용 `syncPacksInternal` internalAction(기존 `syncJournalists`는 인증 필수라 크론 불가 → 신설 필수) + 관리자용 `syncPacksManual`. 기존 `syncJournalists`(캠페인 매칭 경로)는 유지 — F2의 pack_query 수정 후 이 경로는 index-v2 팩 스코프를 갖게 되며 이는 의도된 동작(F2 주의사항).

**의존성**: 트랙 A의 F1~F6 산출물이 **트랙 D 개인화의 원료 파이프라인**이자 **트랙 B 2차 런타임 질의의 클라이언트 기반**(F2). 트랙 D의 원안 D1~D4는 본 트랙으로 이관·병합됨(통합 결정 #4·5·6).

### 트랙 B — PR 지식 팩 → 보도자료 작성 스킬·프롬프트·lint

**목표**: 팩의 4대 지식(8단 표준 양식 / 작성 전략: 리드 3문장·문장 50자 지향 80자 상한·검증 불가 수치 작성 거부 / GEO: 첫 100단어·1문장 1아이디어·Key Takeaways·FAQ·형용사→수치 / 표시광고법 L1 금칙어·L2 최상급·L4 수치-출처 + 게이트)을 3개 표면에 이식 — ① `press-release-writer/SKILL.md` v2 ② 캠페인 폼+`pressPolish` 프롬프트+결정적 lint ③ MCP 신규 도구 `crabpitch_press_guide`.

**핵심 설계**:
- **정본 단일화**: 모든 규칙·테이블은 `convex/lib/pressGuide.ts` 상수 1곳(→ 공통 기반 F7로 승격, **트랙 D의 emailCompliance도 공유** — 통합 결정 #7). 각 상수 블록에 출처 문서 ID·추출일·검증 방법 주석 의무(F7 상세). SKILL.md는 동일 내용의 문서 뷰로 동반 갱신(상호 참조 주석 + PR 체크 항목).
- **스킬 v2**: 8단 구조+GEO 레이어 하이브리드, 기존 헤드라인 3안 관행 유지 + 제목 30자·부제 2개(각 40자) 병기, Key Takeaways 3줄·FAQ 3~5문항. 임원 인용은 제목 반복 금지 + 결정 이유/시장 해석/향후 계획 중 1개. SKT 스타일북 상수는 이식하지 않고 "회사·제품 공식 표기" 체크리스트로 사용자 입력 외부화. 컴플라이언스 서브루틴: critical 1건→재작성 최대 2회→에스컬레이션, critical 자동치환 금지. L3 비교광고·L6 표기 일관성은 스킬 지침(모델 판단)으로만, 코드화는 2차. 2-게이트 승인 플로우(개요 승인→초안+체크리스트→최종).
- **웹 폼 경로**: `pressPolishSystemPrompt` v2에 규칙 **요약형만** 주입(프롬프트 비대화 방지 — 전체 가이드는 MCP 도구로 분리). 출력 JSON 스키마·300~500자 규격은 1차 유지(파서·폼·DB 무변경), 내부 구조 지침(리드 3문장→배경→인용→보일러플레이트)만 강화. 8단 풀 템플릿은 스킬 경로 산출물 — 폼/스킬 이원화는 각 경로 안내 문구에 산출 규격 명시로 혼선 방지. `PolishPressInput`에 `boilerplate?` 추가, 폼에서 `api.mediaKits.list/get` 연결(스키마의 `mediaKits.boilerplate` 최초 소비).
- **결정적 lint**: `pressLint.ts` — L1 정규식+대체어 매핑, L2 최상급, L4 수치 패턴 인근 출처 검사. 반환 `{status, summary:{critical,high,medium}, violations[]}`. **1차 warn-only**(저장·발송 차단 없음), 게이트화는 오탐률 확인 후 2차.
- **MCP 도구**: `crabpitch_press_guide` 신설(`{section?, draft?}` → 가이드 텍스트 + lint 결과). 기존 `crabpitch_email_template`와 도메인이 달라 확장 아닌 신설. PII 무관, 기존 유료 키 인증 재사용.

**의존성**: F7(pressGuide) 선행 필수. 2차 런타임 질의는 F2(pack_query 수정) + F3의 PR 팩 ID 확정 + 팩 외부 P0·P1 완료가 전제. `anthropicEnhance.ts`·`aiActions.ts`·`mcpInternal.ts`는 트랙 D와 공유 파일 — 로드맵 직렬화 규칙 적용.

### 트랙 C — PR 지식 팩 → 프레스킷(미디어킷) 스킬·AI 지원·채점

**목표**: ① `media-kit-builder/SKILL.md`를 팩 권장 목차 10항·검수 체크리스트·GEO 자산 규칙으로 재정렬 ② AI 액션이 전무한 `app/(app)/media-kit/page.tsx`에 BYOK 생성/보강 액션 신설 ③ `computeCompleteness`(7항목 동일가중)를 팩 기준 가중 배점으로 재정의.

**핵심 설계**:
- **SKILL.md 10항 재편**: 한 문장 정의+80~120자 요약 이원화 / 팩트시트 표 형식(GEO 인용 확률 구간) / 비주얼 자산 + GEO 3대 규칙(파일명 `[기업명]-[제품명]-[핵심키워드].png`·Alt·캡션) / **최근 보도(신설)** / 보일러플레이트 80~120단어(보도자료 하단과 단일 소스 — 트랙 B의 폼 연동과 정합) / **자산 사용 규정 4항(신설·필수)** / "허브" 설계 철학 명문화. 검수 체크리스트 5항 병합. OpenCrab 조회 선택 단계는 `pr-agent/` 제외·합성 데모 주의 명기(임베딩 0% 한계 명시). 트랙 B 2차의 중복 항목은 여기 흡수(통합 결정 #8).
- **BYOK 액션 2종**: `generateMediaKit`(회사명·업종·한 줄 설명·수치 → 7필드 초안)·`enhanceMediaKit`(현재 킷 → 개선안+**갭 리포트**). 기존 `polishPressRelease` 패턴 준용(`resolveLlm`→`callLlm`→`recordUsage`, 키 없으면 `mode:"skipped"`). AI는 DB에 직접 쓰지 않고 폼 주입 → 사용자가 명시 저장(승인 흐름 보존). 프롬프트 규칙은 팩 근거(보일러플레이트 80~120단어, 검증 불가 수치 `[확인 필요]` placeholder, 최상급·홍보 형용사 배제 — F7 상수와 정합). 갭 리포트 항목은 채점 기준과 동일 문구로 일관.
- **완성도 가중 배점 v1(스키마 무변경)**: `mediaKitCompleteness.ts`로 추출, 100점 배점 — 보일러플레이트 10+길이 5 / 핵심 메시지 15 / 팩트시트 10+**수치 항목의 `source` 충족률 10**(기존 스키마 필드 최초 소비) / 스토리·프로필 각 10 / 인용문 10 / 연락처 5+이메일 형식 5 / 균형 보정 10. 항목별 미충족 사유 반환(% 하락 체감 완화의 핵심). placeholder 포함 필드는 미완성 취급.
- **2차**: 스키마 확장(`oneLiner`·`visuals[]`·`assetPolicy`·`coverage[]`) 후 배점 v2, ⑦ 비주얼 섹션 UI(현행 번호 누락 해소). 루트 `skills/media-kit-builder/SKILL.md` 구판 정리는 D-9의 1차 스텁화로 이관(통합 결정 대체 — S10에서 제외).

**의존성**: 다른 트랙과 데이터 의존 없음(유저 자신의 회사 자료 — 기자 PII 무관). 단 `aiActions.ts` 공유 파일 직렬화 + 프롬프트 금칙어 원칙은 F7과 정합 유지. 팩 외부 P0·P1은 병행 추진하되 1차 전제 아님.

### 트랙 D — 메일 템플릿·발송 게이트·AI 개인화·회신 응대

**목표**: ① 6블록→7블록 템플릿(최근 기사 구체 인용 강제, CTA 독립 블록·행동 요청 1개, 매체 유형 분기, 분량 상한, 엠바고 표기) + **프리셋 3종·커스텀 템플릿 경로의 컴플라이언스 승계** ② 발송 전 컴플라이언스 게이트(L1/L4, critical≥1 FAIL) + **7일 쿨다운(사용자 단위) 서버 강제** + **캠페인당 통수 상한** — 발송 확정 3경로 공통(1차 — 통합 결정 #1) ③ `emailEnhance` 프롬프트 강화 + 컨텍스트 확장(beat 분포·기사 다건) ④ 회신 7유형 분류 정교화 ⑤ SKILL 문서 동기화(정본 트리 선언 포함).

**핵심 설계**:
- **7블록**: `[제목(25자)] [엠바고(embargoAt 있을 때만 최상단 1줄)] [후킹: "지난 {M월 D일} '{제목}' 기사…" — 캠페인 태그와 topic 겹침 최대 기사 선택, 데이터 없거나 낡으면 generic 폴백+표시] [핵심: beat 재프레이밍] [인용문] [자료: links에 있는 것만 + 엠바고 표기] [CTA(정확히 1개, 매체 유형 분기: 통신사=자료 즉송/기본=인터뷰 제안)+수신거부(OPT_OUT 불변, 항상 마지막)]`. `outletCategory`는 팩에 필드가 없어 naver_oid 정적 매핑(003=통신사, 030·092=IT전문지, 미등록=기본 CTA)으로 도출 — 파이프라인은 트랙 A가 공급. 분량 600~800자(150~200단어 근사 환산)는 **WARN 전용**(하드블록 금지). `personalizeForSend` 무변경.
- **프리셋·커스텀 템플릿 승계(요구 ④의 나머지 절반)**: `buildEmailDraftWithPreset`의 3종 프리셋(data/story/brief)도 7블록 규칙 중 **컴플라이언스 요소(엠바고 최상단 표기·CTA 정확히 1개·OPT_OUT 최종 블록)와 후킹 신선도 강등을 공통 헬퍼(personalHook·signature 확장)로 승계**한다. `renderCustomTemplate`에는 `{{엠바고}}`·`{{매체CTA}}` 자리표시자를 추가하고 `{{후킹}}`·`{{최근기사}}`를 `referenceArticles[]` 기반으로 갱신한다. 프리셋별 본문 구조의 완전 7블록 재설계는 2차로 미루며, 그 근거는 "컴플라이언스는 발송 게이트(D-4)가 3경로에서 최종 커버하므로 안전성 공백이 없다"는 것 — 이 결정을 D-1에 명기한다.
- **컴플라이언스 게이트**: `emailCompliance.ts`(순수 TS) — L1 금칙어(critical은 무근거 '최초'·무출처 수치+타사 비교로 최소화, 나머지 warn)·L4 수치-출처 근접·구조 검사(hasOptOut 이관·분량·CTA 개수). 판정: `critical≥1→FAIL(차단)`, `high≥3 또는 medium≥5→WARN(기존 승인 화면에 표시)`. **금칙어·수치 패턴 상수는 F7(pressGuide) 공유**, 게이트 정책만 도메인별 차등. **캠페인당 발송 통수 상한**을 `plans.ts` 플랜 상수로 도입해 `scheduleCampaign`·`sendCampaign` 진입 시 초과 차단(월 한도와 별개 — 서비스기획 컴플라이언스 원칙 3의 미구현 항목 완결), 발송 확정 공통 함수에서 재검증.
- **쿨다운**: 판정은 **사용자 단위** — suppression의 `by_user_email` 격리와 동형. `partitionByCooldown` 입력은 해당 사용자의 캠페인에 속한 초안의 `sentAt`만 포함하며(F1에서 `emailDrafts`에 `userId?` 비정규화 필드+`by_user_journalist` 인덱스를 설계해 전역 스캔·교차 노출을 구조적으로 차단), **교차 사용자 발송 이력은 판정·표시 어디에도 사용하지 않는다** — 전역 판정 시 발생하는 교차 테넌트 간섭과 "다른 누군가가 이 기자에게 최근 발송했다"는 사이드채널 유출을 원천 배제. 적용 지점은 **발송 확정 3경로 전부**: `sendCampaign`·`executeScheduledSend`·`processDueSends`(크론 백업)를 `finalizeCampaignSend` 공통 내부 함수로 단일화(D-4 상세). 캠페인 무관 최근 `sentAt` 7일 이내면 발송 제외·초안 유지·사유 기록. 판정은 `sendGuard.partitionByCooldown` 순수 함수. 팔로업 간격·발송 시간대는 **팩 근거 부재(갭)** — "무회신 7일+새 정보+복붙 금지"를 자체 표준으로 문서 명시만(권장), 자동 생성은 2차.
- **AI 개인화**: `listDraftsForEnhance`·`EnhanceEmailInput`에 `beatSecondary`·`beatDistribution`·`outletCategory`·`referenceArticles`(3건)·`embargoAt` 추가. 시스템 프롬프트 7규칙(무개인화 도입부 금지·CTA 1개·600~800자·과장 형용사 금지·수치 창작 금지+출처 병기·매체 유형별 톤·기자별 문구 차별화). 후처리에서 `emailCompliance` 연동 — LLM 출력 critical이면 템플릿 원본 폴백. 기존 수신거부·"기자님" 강제 유지.
- **회신 응대**: question 하위 5분류(수치 검증/경쟁사 비교/전략 의도/향후 계획/부정적 맥락) + "공식 답변→대체 표현 2개→Do Not Say" 3단 스캐폴드(빈칸 슬롯, 사실 창작 금지) / complaint `needsEscalation` 플래그 / materials는 pressRelease `links` 대조 "약속한 자료만" / published 정확 인용 점검 1줄 / hold 자동 재접근 금지 / 신호어 사전 보강. `classifyReply`에 `matched` 반환 확장(기본값 question 동작 유지). **LLM 폴백은 2차** — 단 하드 규칙: unsubscribe 키워드 매칭이 LLM보다 항상 우선, 억제 등록은 분류 경로와 무관하게 서버 강제, LLM 입력 PII 마스킹.

**의존성**: **트랙 A(F1~F6)에 강하게 의존** — 파이프라인 없이는 후킹·매체 분기가 generic 폴백에 머묾(단 폴백만으로도 배포 가능하게 설계). F7(상수)·F1(스키마)은 선행 필수. `anthropicEnhance.ts`·`aiActions.ts`·`mcpInternal.ts`는 트랙 B 뒤 직렬. `buildEmailDraft`/`buildEmailDraftWithPreset`/`renderCustomTemplate`/`classifyReply` 시그니처 변경은 `drafts.ts`·`replies.ts`·`mcpInternal.ts`·seed에 파급 — 모든 소비 코드 undefined-안전 필수(기존 seed/manual 레코드는 신규 필드 undefined).

---

## 4. 실행 로드맵

### 1차 마일스톤

**M0 — 공통 기반 (전 트랙 선행, 최우선)**

| ID | 파일 | 작업 | 원출처 |
|---|---|---|---|
| F1 | `convex/schema.ts` | **통합 스키마 확장 1회 커밋**: journalists optional 13종(`naverOid`·`contactVerification`·`contactEvidenceCount`·`contactSourceUrls[]`·`beatDistribution`·`classificationConfidence`·`referenceArticles[]`·`latestArticleAt`·`outletCategory`·`packPackageId`·`packBatch`·`packSyncedAt`·`lastSeenInPackAt`) / 신규 테이블 `opencrabPacks`(by_packageId)·`packSyncRuns`(by_packageId, by_startedAt) / `pressReleases.embargoAt?` / `emailDrafts`에 **`userId?`(캠페인에서 비정규화 — 신규 쓰기 시 채움, 기존 레코드는 undefined 허용·조인 폴백)+`by_user_journalist` 인덱스(`["userId","journalistId"]`)** — 쿨다운의 사용자 단위 판정용, 사용자 축 없는 전역 `by_journalist`는 만들지 않음(교차 테넌트 스캔 구조적 차단) — +`complianceLevel?`·`complianceNotes?` / `replies`에 `questionSubtype?`·`needsEscalation?` — 전부 optional·Convex 무중단 | A1+D1 병합 |
| F2 | `convex/lib/opencrabClient.ts` | 범용 `callOpenCrabMcpTool(baseUrl, key, toolName, args)` 추출(SSE·`unwrapToolResult` 재사용), **MCP 경로 `pack_query` 유실(`:143-144`) 수정**(`opencrabMap.ts:166`이 만드는 `pack_query`를 `opencrabActions.ts:55`가 누락 전달하는 경로 포함), 스키마 미지원 시 쿼리 텍스트 폴백. **주의**: 파생 시리즈 "1차 제외"는 동기화 파이프라인 한정이며, 수정 후 기존 매칭 질의 경로(`buildOpenCrabQueryBody`)가 갖게 되는 `korean-journalist-contact-index-v2` 팩 스코프는 **유지**한다(2-2의 제외 방침과 별개) | A3+D3 병합 |
| F3 | `convex/lib/packRegistry.ts` (신규) | 26개 batch→package_id 매핑 + reference-pack id + workspace id + 시리즈 판별 유틸 + **PR 팩 v2 package_id 확정·수록 절차: `search_packs`로 조회→ID 고정→레지스트리 커밋**(S2 런타임 질의와 F7 출처 주석의 전제) | A2 |
| F4 | `convex/lib/packSync.ts` (신규) | `reporters[]` 파서(순수 함수), **다중 구분자 split `/[,·|/]/`(콤마·가운뎃점·파이프·슬래시 — `opencrabMap.asStringList:58` 실제 규칙과 동일 스펙)**, **기사 URL 날짜 파싱 유틸(etnews/newsis/zdnet — 단일 구현)**, `record_count` 대조, 문서 지문, **outletCategory 정적 매핑표(naver_oid 기반)** | A4+D2 병합 |
| F5 | `convex/lib/opencrabMap.ts` | 팩 고유 필드 수용(`reference_articles[]` 다건·`beat_distribution`·`naver_oid` 등, F4 소비), `mailingStatus:"candidate"` 강제·email dedupe·**다중 구분자 split(`/[,·|/]/`) 불변** | A5+D2 병합 |
| F6 | `convex/opencrab.ts` | `upsertFromOpenCrab` 확장: 신규 필드 patch를 **발송·컴플라이언스 필드 비덮어쓰기 화이트리스트 방식**으로, `lastSeenInPackAt` 갱신, `upsertPackMeta`·`recordSyncRun`(**저장 전 오류 메시지 이메일 마스킹**)·`listSyncRuns` | A6+D4 병합 |
| F7 | `convex/lib/pressGuide.ts` (신규) | 정본 상수: 8단 구조 가이드, GEO 규칙, 체크리스트, **금칙어·대체어 매핑, 최상급 키워드, 수치 패턴 정규식**(pressLint·emailCompliance 공용), 섹션별 export. **각 상수 블록에 출처 문서 ID·추출일·검증 방법(`opencrab_pack_qa` 대조 결과) 주석 의무화** — 팩 개정 시 drift 감지의 기준점(재대조 절차는 S5) | B1 승격 |
| F8 | (스파이크) | **실제 도구 호출로 배치 1개 완전 취득 검증**(F2 직후). 실패 시 reference-pack을 1차 소스로 승격하는 플랜 B 발동 | A 리스크 1 |

**M1 — 트랙 A 완성** (F1~F6·F8 후)

| ID | 파일 | 작업 |
|---|---|---|
| A-1 | `convex/opencrabActions.ts` | `syncPacksInternal` internalAction(목록 완주 diff→변경 배치 fetch→배치 단위 업서트+run 기록→실패 격리) + `syncPacksManual`(관리자 인증, packageIds 선택). 기존 `syncJournalists` 유지 |
| A-2 | `convex/crons.ts` | 기존 **`process due scheduled sends` 등록 아래** `crons.daily("sync journalist packs", …)` 1건 (파일이 13줄로 짧아 라인 번호 앵커 대신 내용 앵커 사용) |
| A-3 | `convex/admin.ts` | 집계 쿼리(배치별 상태·source별 카운트·데이터 기준일·신규 시리즈 감지·**stale 임계 초과 카운트**) — **PII 미포함 projection 강제** |
| A-4 | `app/(app)/admin/page.tsx` | 동기화 상태 카드 + 전체 동기화/실패 재시도 버튼 + **stale 임계(예: 마지막 전체 동기화 2회 연속 `lastSeenInPackAt` 미확인) 초과 레코드의 매칭 기본 제외 토글**. 개별 기자 열람 UI 없음 |
| A-5 | `.env.example`, `docs/DEPLOY.md` | 운영 문서(신규 env 없음 — 기존 `OPENCRAB_API_URL/KEY` 재사용) |
| A-6 | `convex/lib/packSync.test.ts` 등 | 파서 단위 테스트: 익명화 batch-025 fixture, split, partial 판정, candidate 강제 |

**M2 — 트랙 B** (F7 후, M1과 병행 가능)

| ID | 파일 | 작업 |
|---|---|---|
| B-1 | `convex/lib/pressLint.ts` + test (신규) | `lintPressRelease(title, body)` — F7 소비, 오탐 케이스 테스트 포함, warn-only |
| B-2 | `convex/lib/anthropicEnhance.ts` + test | `pressPolishSystemPrompt` v2(요약 규칙 주입), `PolishPressInput.boilerplate?`, 파서 테스트 갱신 |
| B-3 | `convex/aiActions.ts` | `polishPressRelease`에 `boilerplate` optional + 반환에 `lint` 동봉 |
| B-4 | `app/(app)/campaigns/new/page.tsx` | 보일러플레이트 입력(미디어킷 불러오기) + lint 위반 배지·suggestion(warn-only) |
| B-5 | `skills-public/skills/press-release-writer/SKILL.md` | v2 개정(분량 크면 `references/` 분리). F7과 상호 참조 주석. **정본 트리(skills-public) 소속 — D-9의 정본 선언과 정합** |
| B-6 | `convex/mcpHttp.ts` | `crabpitch_press_guide` TOOLS 정의 + dispatch |
| B-7 | `convex/mcpInternal.ts` | `pressGuide` internalQuery(기존 인증 패턴, B-1·F7 소비) |

**M3 — 트랙 D** (F1~F7 + B-2·B-3 완료 후 — 공유 파일 직렬화)

| ID | 파일 | 작업 |
|---|---|---|
| D-1 | `convex/lib/emailTemplate.ts` + test | 7블록 재구성(후킹 기사 선택기+날짜 인용+generic 폴백·신선도 강등, 앵글 재프레이밍, 엠바고 이중 표기, 매체 유형별 CTA 1개, OPT_OUT·PII 불변). **프리셋·커스텀 승계**: `buildEmailDraftWithPreset` 3종 프리셋(data/story/brief)도 7블록 규칙 중 컴플라이언스 요소(엠바고 최상단 표기·CTA 정확히 1개·OPT_OUT 최종 블록)와 후킹 신선도 강등을 공통 헬퍼(personalHook·signature 확장)로 승계. `renderCustomTemplate`에 `{{엠바고}}`·`{{매체CTA}}` 자리표시자 추가, `{{후킹}}`·`{{최근기사}}`를 `referenceArticles[]` 기반으로 갱신. **프리셋별 본문 구조의 완전 7블록 재설계는 2차로 미루며, 근거는 '컴플라이언스는 발송 게이트(D-4)가 3경로에서 최종 커버'** — 본 항에 명기 |
| D-2 | `convex/lib/emailCompliance.ts` + test (신규) | L1/L4/분량/수신거부/CTA 개수 + FAIL/WARN 게이트 — **F7 상수 공유** |
| D-3 | `convex/lib/sendGuard.ts` + test | `partitionByCooldown`(7일, 캠페인 무관, **사용자 단위** — 입력은 해당 사용자의 캠페인에 속한 초안의 `sentAt`만: F1 `by_user_journalist` 인덱스 조회 또는 초안→캠페인→userId 조인, 교차 사용자 이력 미사용) 순수 함수 — **`cooldown.ts` 신설 안 함(통합 결정 #1)** |
| D-4 | `convex/drafts.ts` | `generateForCampaign` 확장 컨텍스트+검증 결과 저장. **발송 확정 로직을 `finalizeCampaignSend` 공통 내부 함수로 추출해 `sendCampaign`·`executeScheduledSend`·`processDueSends`(크론 백업) 3경로가 동일하게 suppression 재대조→쿨다운 partition→emailCompliance critical FAIL 차단→캠페인당 상한 재검증을 통과하도록 단일화**(제외분 초안 유지·사유 기록). **`processDueSends`가 현재 suppression 재대조를 누락하는 기존 결함(`drafts.ts:273-307` — `filterSuppressed` 미호출로 수신거부 재대조가 새는 경로)도 이 커밋에서 함께 수정하며, 3경로 각각에 대한 차단 테스트를 추가한다.** **캠페인당 발송 통수 상한**을 `plans.ts` 플랜 상수로 도입해 `scheduleCampaign`·`sendCampaign` 진입 시 초과 차단(원칙 ④·5-1 참조). `listDraftsForEnhance` 확장 |
| D-5 | `convex/lib/anthropicEnhance.ts` + test | `EnhanceEmailInput` 확장, 시스템 프롬프트 7규칙, `parseEnhanceEmailResult`에 compliance 연동(critical 시 템플릿 폴백) — **B-2 뒤 직렬** |
| D-6 | `convex/aiActions.ts` | `enhanceCampaignDrafts` 확장 필드 전달 — **B-3 뒤 직렬** |
| D-7 | `convex/lib/replyClassifier.ts` + test | 신호어 보강, question 5하위, complaint 플래그, materials 링크 인자화, published 문구, 3단 초안, `matched` 확장 |
| D-8 | `convex/replies.ts` | `add`에서 pressRelease.links 조회·전달, subtype/escalation 저장. **수신거부 억제 등록 불변** |
| D-9 | `skills-public/skills/journalist-outreach/SKILL.md`, `reply-handler/SKILL.md` + 루트 `skills/` 4종 | **스킬 문서 정본을 `skills-public/skills/` 트리로 선언.** journalist-outreach·reply-handler 코드 변경 동기화(7블록·프리셋 승계·매체 표·게이트·팔로업 자체 표준 / 5하위·3단 포맷·에스컬레이션). **루트 `skills/` 4종(journalist-outreach-email·media-kit-builder·press-distribution·reply-handler)은 1차에서 정본 참조 스텁으로 교체하거나 정본과 동기화**하며, 특히 오케스트레이터인 `skills/press-distribution/SKILL.md`(:38 7일 규칙 명문)의 7일 규칙·승인 게이트 서술을 **"서버가 강제(발송 확정 3경로 차단)"로 갱신** — 문서와 실동작의 어긋남 방지 |
| D-10 | `app/(app)/campaigns/[id]/page.tsx` | 승인 게이트에 WARN/FAIL·쿨다운 제외 사유 표시(익명 코드 유지) + **"팩 최종 확인 N일 경과" 배지(`lastSeenInPackAt` 파생, PII 무관 집계값)를 승인 화면·매칭 reason에 표시** — 팩에서 사라진(이직·퇴사 추정) 기자의 낡은 이메일 발송 노출 완화(임계 초과 기본 제외 토글은 A-4, 완전한 stale 마킹·감점은 S3) |
| D-11 | `convex/mcpInternal.ts` | `emailTemplate`·`crabpitch_classify` 신규 시그니처 호환(실명·이메일 미반환 불변) — **B-7 뒤 직렬** |

**M4 — 트랙 C** (독립적이나 `aiActions.ts` 충돌 회피 위해 D-6 후)

| ID | 파일 | 작업 |
|---|---|---|
| C-1 | `skills-public/skills/media-kit-builder/SKILL.md` | 10항 재편 + 검수 5항 병합 + GEO 3대 규칙 + 자산 규정 4항 + 허브 철학 + OpenCrab 조회 단계(pr-agent 제외·합성 데모 주의·임베딩 한계 명시) — **트랙 B 2차 중복 항목 흡수**(루트 구판은 D-9 스텁화로 처리) |
| C-2 | `convex/lib/mediaKitEnhance.ts` + test (신규) | 생성/보강 프롬프트·파서(F7 금칙어 원칙 정합, placeholder 보존 테스트) |
| C-3 | `convex/aiActions.ts` | `generateMediaKit`·`enhanceMediaKit`(resolveLlm→callLlm→recordUsage, skipped 폴백) |
| C-4 | `app/(app)/media-kit/page.tsx` | AI 초안 생성/보강 버튼 + 폼 주입(저장은 사용자) + 갭 리포트 표시 |
| C-5 | `convex/lib/mediaKitCompleteness.ts` + test (신규) | 가중 배점 v1 + 항목별 미충족 사유 반환 |
| C-6 | `convex/mediaKits.ts` | 인라인 `computeCompleteness` 제거 → C-5 임포트 |

**공유 파일 직렬화 규칙**: `convex/schema.ts`는 F1 1회만 / `convex/aiActions.ts`는 B-3→D-6→C-3 순 / `convex/lib/anthropicEnhance.ts`는 B-2→D-5 순 / `convex/mcpInternal.ts`는 B-7→D-11 순 / `opencrabMap.ts`·`opencrab.ts`·`opencrabClient.ts`는 M0에서만.

**1차 완료 기준**: vitest 전체 통과(신규 테스트 포함) / admin에서 전체 동기화 실행 시 201명 기준 반입·결손 수치 표시 / 폼 "AI 다듬기"에 lint 배지 / MCP `tools/list`에 `crabpitch_press_guide` 노출 / **critical 위반·7일 쿨다운(사용자 단위)·캠페인당 상한이 발송 확정 3경로(즉시·예약·크론 백업) 전부에서 서버 차단됨 — 경로별 차단 테스트 통과** / 승인 화면에 stale 배지 표시 / 미디어킷 AI 버튼·갭 리포트 동작.

### 2차 마일스톤

| ID | 영역 | 작업 | 전제 |
|---|---|---|---|
| S1 | (레포 외부) OpenCrab 팩 | P0 전 청크 임베딩 생성, P1 데모 "합성" 태깅·v1 provenance 이관 — 1차와 병행 추진 가능하나 1차 전제 아님 | — |
| S2 | `convex/opencrabActions.ts`, MCP | PR 팩 런타임 질의 `queryPressKnowledge`(`pr-agent/` 필터) + `crabpitch_press_guide`에 `examples` 섹션(합성 라벨 강제) | S1 + F2(완료됨) + **F3의 PR 팩 package_id 확정(완료됨)** |
| S3 | `convex/opencrab.ts`, `convex/journalists.ts` | **stale 마킹 완성형**: `lastSeenInPackAt` 미갱신 레코드 처리, 매칭에서 기본 제외/감점(1차의 D-10 배지·A-4 admin 토글을 자동 정책으로 승격) | M1 |
| S4 | `convex/lib/scoring.ts` | **통합 재보정(A·D 병합)**: 활동량 정규화 상수 실데이터 조정, `MAJOR_OUTLETS`의 naver_oid 판정, `beatDistribution`·`referenceArticles` 다건·`contactEvidenceCount`를 `ScorableJournalist` 입력에 추가 | M0·M1 |
| S5 | `packRegistry.ts` + admin | 신규 시리즈(-v2/-v3) 감지→관리자 승인 전환 플로우(자동 전환 금지), 재인제스트 폴링·지문 증분 고도화. **PR 팩 신 시리즈 발행 감지 시(기자단 팩과 동일 diff 메커니즘) `pressGuide.ts` 재대조 체크 항목을 발행**하는 절차 포함 — F7의 출처 주석(문서 ID·추출일·`opencrab_pack_qa` 대조)이 재대조 기준점 | M1 |
| S6 | `convex/opencrabActions.ts` | topic-routing 팩 매칭 보조 경로 검토, reference-pack 201건 정합성 검증 잡 | M1 |
| S7 | 보도자료 스키마·게이트 | `keyTakeaways[3]`·`faq[]`·`subheads[2]` 스키마·파서·UI 확장 / pressLint 게이트화(critical 시 confirm) / L3·L6 LLM 검사(BYOK 전용) | M2 안정화·오탐률 확인 |
| S8 | `convex/lib/emailTemplate.ts` | 업종별 앵글 지식 확장(beatAngle 3분기 표 → 팩 지식 기반) — D의 매체 유형 분기와 통합 설계 + **프리셋 3종(data/story/brief) 본문 구조의 완전 7블록 재설계**(1차는 컴플라이언스 요소만 승계 — D-1 결정) | M3 |
| S9 | `pressGuide.ts` 보강 | **언론중재법(정정·반론보도) 별도 소싱** — 팩 범위 밖 결손, 신규 조사 필요 | 외부 소스 |
| S10 | mediaKits 확장 | 스키마(`oneLiner`·`visuals[]`·`assetPolicy`·`coverage[]`)·completeness v2·⑦ 비주얼 등 UI 섹션(접힘 처리 검토)·보강 프롬프트 확장(루트 `skills/` 구판 정리는 1차 D-9 스텁화로 이관되어 본 항에서 제외) | M4 |
| S11 | `convex/lib/replyLlm.ts` (신규) 등 | BYOK 회신 분류 폴백: 미매칭 한정, `mask.ts` PII 마스킹, **unsubscribe 키워드 우선·억제 등록 서버 강제** | M3 |
| S12 | `convex/replies.ts` + UI | published 정정 요청 플로우, hold 재접근 판단 플래그 UI | M3 |
| S13 | `convex/drafts.ts` + UI | 팔로업 초안 생성기(무회신 7일+새 정보 필수+복붙 금지 검증 — emailCompliance 재사용, `followUpOf`) / 방송 유형 별도 포맷(1페이저·B-roll) | M3 |
| S14 | writing_style 축 | tone/avg_length — **기자단 팩 실데이터에 없음**, 데이터 확보 시에만(조건부) | 외부 데이터 |

---

## 5. 리스크·컴플라이언스 체크리스트

### 5-1. 컴플라이언스 체크리스트 (구현·리뷰 시 필수 확인)

**PII (기자 개인정보)**
- [ ] admin 동기화 화면은 집계·메타만 — 기자 이름·이메일 열람 UI를 만들지 않음(A-3 projection 강제, A-4)
- [ ] `recordSyncRun` 저장 전 오류 메시지에서 이메일 패턴 마스킹(F6) — 오류 원문 경유 유출 차단
- [ ] `phone`(빈값)·`official_popularity_rank`(null)는 수집 자체를 안 함, `contactSourceUrls`는 감사 전용·UI 비노출(F5)
- [ ] MCP 도구는 기자 실명·이메일 미반환 불변(D-11, 기존 서버 지침 유지)
- [ ] 초안·화면에 기자 PII 미저장/미노출 — 발송 시점 Gmail 주입만(D-1 `personalizeForSend` 무변경)
- [ ] stale 배지는 `lastSeenInPackAt` 파생 경과일수만 표시(PII 무관 집계값 — D-10)
- [ ] 2차 LLM 회신 분류 폴백은 rawBody의 이메일·전화 마스킹 후 전달(S11)

**mailing_status candidate**
- [ ] 팩의 `mailing_status` 값은 **무시**하고 `"candidate"` 강제(`opencrabMap.ts` 기존 로직 불변 — F5, A-6 테스트로 고정)
- [ ] 자동 발송 금지 — 모든 발송은 사용자 승인 게이트(campaign `review`) 통과 후 본인 Gmail
- [ ] 서버 공용 LLM 키 없음 — AI 경로는 전부 BYOK, 키 없으면 `mode:"skipped"`

**쿨다운 (7일) · 발송량 상한**
- [ ] `emailDrafts.by_user_journalist` 인덱스 기반, 발송 확정 시점(suppression 재대조와 동일 지점)에서 캠페인 무관 7일 판정 — 서버 강제(D-3·D-4), 스킬 문서 규범을 코드로 승격
- [ ] **발송 확정 3경로(즉시 `sendCampaign`·예약 `executeScheduledSend`·크론 백업 `processDueSends`) 전부에서 강제** — `finalizeCampaignSend` 공통 함수 단일화 + 경로별 차단 테스트(D-4). `processDueSends`의 기존 suppression 재대조 누락 결함도 같은 커밋에서 수정
- [ ] **쿨다운 판정은 사용자 단위** — 입력은 해당 사용자 캠페인 소속 초안의 `sentAt`만, 교차 사용자 발송 이력은 판정·표시(D-10) 어디에도 사용하지 않음(suppression의 `by_user_email` 격리와 동형 — 교차 테넌트 간섭·사이드채널 차단)
- [ ] **캠페인당 발송 통수 상한**을 `plans.ts` 플랜 상수로 도입, `scheduleCampaign`·`sendCampaign` 진입 차단 + 발송 확정 공통 함수 재검증(월 한도와 별개 — 서비스기획 컴플라이언스 원칙 3 완결, D-4)
- [ ] 팩 동기화는 발송·컴플라이언스 필드를 절대 덮어쓰지 않음 — upsert 화이트리스트(F6)가 쿨다운 데이터 보호의 전제
- [ ] 제외된 초안은 삭제하지 않고 유지 + 사유 기록, 승인 화면에 표시(D-10)
- [ ] 팔로업 규칙(7일+새 정보+복붙 금지)은 팩 근거 없는 자체 표준임을 문서에 명시, "권장"으로만 제시

**수신거부**
- [ ] 억제는 `suppressionList` 별도 테이블 + 발송 확정 시 `filterSuppressed` 재대조(**3경로 공통** — D-4) — 동기화 계층은 suppression을 참조·수정하지 않음(책임 분리). 팩에 남은 수신거부 기자의 데이터 재갱신은 허용하되 발송은 sendGuard가 차단(1차 정책)
- [ ] 회신 분류에서 unsubscribe 최우선 순위 유지, **LLM 폴백 도입 후에도 키워드 매칭이 LLM 결과보다 항상 우선, 억제 등록은 분류 경로와 무관하게 서버 강제**(D-7·S11)
- [ ] OPT_OUT 문구는 모든 템플릿 변경에서 불변·항상 마지막 블록 — **standard·프리셋 3종·커스텀 템플릿 전 경로**(D-1), `hasOptOut` 검사는 emailCompliance로 이관 후에도 유지(D-2)

### 5-2. 통합 리스크 (심각도 순)

| # | 리스크 | 완화 |
|---|---|---|
| 1 | **evidence chunk 결손 리콜 손실**(batch-025: 16중 8) — 검색 기반 호출로 `reporters[]` 전체 미획득 가능 | `record_count` 대조로 결손 필수 탐지(partial) + reference-pack 병합 + admin 결손 수치 표시. **F8 스파이크에서 배치 1개 완전 취득 검증, 실패 시 reference-pack 1차 소스 승격(플랜 B)**. 결손 기자는 메일 후킹에서 generic 폴백 보장(D-1) |
| 2 | **`version` 필드 무효**(전 팩 1.0.0 고정, 갱신은 새 시리즈 발행) | version 기반 캐시/스킵 로직 금지 — 목록 diff·snapshot·지문으로만 감지. 신규 시리즈는 자동 전환 금지, 관리자 승인(S5). batch 번호를 키·조인에 쓰지 않음(email 키 원칙 코드 리뷰 강제) |
| 3 | **MCP 도구 스키마 불확실성** — pack_query 인자 형식 서버 측 변경 가능 | F2 첫 작업으로 실제 인자 스키마 확인, 쿼리 텍스트 폴백, 오류를 packSyncRuns에 기록해 조기 감지 |
| 4 | **SKT 특화 상수·합성 데모·pr-agent 노이즈 혼입**(PR 팩) | F7·C-2에 범용 표현만 baking, 회사 고유 표기는 사용자 입력 외부화. 데모는 구조만 참고·사실 이식 금지, 런타임 노출 시 "합성" 라벨 강제(S2). `pr-agent/` source_path 필터를 스킬·질의 양쪽에 명기 |
| 5 | **lint·게이트 오탐** — "절대"·"모두" 등 일상 문맥, 출처 인접 수치 오검출 | 보도자료 lint는 1차 warn-only, 메일 게이트의 critical은 최소 셋으로 한정(무근거 최초·무출처 수치+타사 비교), WARN은 승인 화면에서 사용자가 무시 가능. 분량 환산(600~800자)은 근사치라 WARN 전용 |
| 6 | **데이터 신선도** — 근거 기사가 2026-07-15~21 단일 크롤 편중, 상류 재크롤 통제 불가. 팩에서 사라진(이직·퇴사) 기자가 낡은 이메일로 매칭·발송에 잔류하는 노출 | `latestArticleAt` 기준일을 admin·매칭 화면에 노출 + 후킹의 "최근" 기준을 `packSyncedAt` 연동, 낡으면 generic 폴백 강등(통합 결정 #10). **1차에 "팩 최종 확인 N일 경과" 배지(D-10)와 stale 임계 초과 레코드 매칭 기본 제외 admin 토글(A-4)로 발송 노출을 즉시 완화**, 완전한 stale 마킹·감점은 S3 |
| 7 | **공유 파일·시그니처 파급** — `schema.ts`/`aiActions.ts`/`anthropicEnhance.ts`/`mcpInternal.ts` 4개 트랙 교차, `buildEmailDraft`(+프리셋·커스텀)/`classifyReply` 변경이 3곳 이상 파급 | 로드맵 직렬화 규칙(F1 1회 커밋, B→D→C 순) + 기존 seed/manual 레코드의 신규 필드 undefined-안전을 테스트로 강제 |
| 8 | **Convex 액션 비트랜잭션** — 동기화 중 구/신 데이터 혼재 | 팩 단위 커밋 + run 기록 + 재시도. email 단위 정합은 항상 유지되므로 허용 가능 |
| 9 | **정본 이중화 드리프트** — `pressGuide.ts` ↔ 스킬 문서 **13종(루트 `skills/` 4 + `skills-public/skills/` 4 + `skills-pro/` 5)**, 특히 서버 강제 도입 후 오케스트레이터(press-distribution)의 구 서술 잔존 | **정본은 `skills-public/skills/` 트리로 선언(D-9)**, 루트 4종은 1차에 정본 참조 스텁화 또는 동기화(press-distribution의 7일 규칙·승인 게이트 서술을 "서버가 강제"로 갱신 포함). **drift 점검 범위는 루트 4+public 4+pro 5 전체.** 상호 참조 주석 + 개정 시 동반 갱신을 PR 체크 항목화. 생성 자동화는 2차 검토 |
| 10 | **법률 커버리지 공백** — 팩은 표시광고법 계열만, 언론중재법 0건 | 스킬·UI 문구에서 "법률 검토 대체" 표현 금지, 커버 범위 명시. 보강은 S9(외부 소싱) |
| 11 | **beat 분류 편향·매칭 품질 상한** — IT/테크 10종 분류, 기사 1건 기반 medium 다수, `outlet_category` 부재 | scoring 재보정(S4) 전까지 과대 홍보 금지. 매체 유형은 확인된 naver_oid만 정적 매핑, 미등록은 기본 CTA 폴백 — "완전 분기"로 과장하지 않음 |
| 12 | **완성도 % 하락 체감**(미디어킷 배점 강화) | 항목별 미충족 사유 동시 노출(C-5 필수 요건) — "무엇을 채우면 오르는지" 제시. placeholder 저장은 채점에서 미완성 취급으로 상쇄 |
