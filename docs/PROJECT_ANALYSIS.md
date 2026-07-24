# CrabPitch 프로젝트 분석

워크스페이스 `crabpitch`(SaaS) + `crabpitch-skill`(공개 스킬 팩) 기준 현황 정리.
관련 문서: [ARCHITECTURE.md](./ARCHITECTURE.md), [DEPLOY.md](./DEPLOY.md), [`../크랩피치_서비스기획서.md`](../크랩피치_서비스기획서.md)

---

## 1. 한줄 요약

**크랩피치**는 OpenCrab 한국 기자 온톨로지 + BYO Gmail로 1인 창업가·소상공인의 보도자료 배포를 돕는 제품이다.
동일 워크플로우를 **풀스택 SaaS**와 **Claude/GPT/Gemini용 공개 스킬 팩** 두 경로로 제공한다.

---

## 2. 저장소 구성

| 저장소 | 역할 | 원격 |
|---|---|---|
| `crabpitch` (이 저장소) | Next.js + Convex 웹앱, 스킬 로직을 `convex/lib`에 흡수, `skills-public/` 소스 | `contentscoin/crabpitch` |
| `crabpitch-skill` | 공개 배포용 마크다운 스킬 4종 (기자 PII 없음) | `contentscoin/crabpitch-skill` |

관계: [`skills-public/`](../skills-public/) 내용이 `crabpitch-skill`로 게시된다.
(`PUBLISH.md`의 목표 이름 `crabpitch-skills`와 실제 공개 repo `crabpitch-skill` 표기 차이를 인지할 것.)

---

## 3. 제품 핵심 루프

```
보도자료 작성 → 기자 매칭 → 메일 초안 → 승인 게이트 → Gmail 발송 → 회신 분류
                                                              └─ 수신거부 → 억제 리스트
```

스킬·코드가 공유하는 규칙:

- 매칭 점수 0–100 (beat 40 · 유사기사 25 · 활동 15 · 신뢰 15 · 매체 5) — `convex/lib/scoring.ts`
- 발송 전 **사용자 승인 필수** (자동 발송 없음)
- 수신거부 문구 강제, 회신 7유형 분류, 억제 리스트
- 화면에는 기자 실명/이메일 미노출 (`기자 #XXXX` 마스킹) — `convex/lib/mask.ts`

---

## 4. SaaS 앱 (`crabpitch`)

### 스택

| 계층 | 기술 |
|---|---|
| 프론트 | Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS v4 · pnpm |
| 백엔드/DB | Convex (스키마·쿼리·뮤테이션) |
| 인증 | `@convex-dev/auth` + Google OAuth |
| 배포 | Vercel(프론트) + Convex Cloud(백엔드) |

### 주요 경로

| 영역 | 경로 |
|---|---|
| 랜딩/인증 | `app/page.tsx`, `app/signin/`, `middleware.ts` |
| 앱 화면 | `app/(app)/` — dashboard, campaigns, journalists, replies, media-kit, settings |
| 스키마 | `convex/schema.ts` |
| 스킬 로직 | `convex/lib/` — scoring, emailTemplate, replyClassifier, plans, mask |
| 시드/데모 | `convex/seed.ts` |

### 도메인 테이블

`profiles` · `journalists` · `pressReleases` · `campaigns` · `matches` · `emailDrafts` · `replies` · `suppressionList` · `mediaKits` · `usage` (+ `authTables`)

### 요금제 (코드 기준, `convex/lib/plans.ts`)

| Plan | 월 요금 | 발송 | 보도자료 | 매칭 공개 | 미디어킷 |
|---|---|---|---|---|---|
| Free | 0 | 10 | 3 | 3 | 1 |
| Solo | ₩19,000 | 100 | 무제한급 | 무제한급 | 3 |
| Growth | ₩49,000 | 500 | 무제한급 | 무제한급 | 무제한급 |
| Agency | ₩149,000 | 사실상 무제한 | 무제한급 | 무제한급 | 무제한급 |

### 통합 심(seam) — 현재 vs 실배선

| 기능 | 현재(데모) | 실서비스 |
|---|---|---|
| 기자 매칭 | `seed.ts` 데모 기자 DB | `OPENCRAB_API_*` |
| 메일 개인화 | `emailTemplate.ts` 템플릿 | `ANTHROPIC_API_KEY` |
| 발송 | 상태 기록만 | Gmail OAuth (`GMAIL_OAUTH_*`) |

자격증명 없이 대시보드 **데모 데이터 생성**으로 전 플로우 시연 가능하다.

---

## 5. 공개 스킬 팩 (`crabpitch-skill` / `skills-public/`)

Cursor 플러그인이 **아님** (`.cursor-plugin` 없음). 마크다운 스킬만 존재.

| 스킬 | 역할 |
|---|---|
| `press-release-writer` | 보도문 작성 (5W1H, 헤드라인 3안) |
| `media-kit-builder` | 인터뷰형 미디어킷 8섹션 |
| `journalist-outreach` | 매칭 → 초안 → 승인 → Gmail `언론홍보` 라벨 |
| `reply-handler` | 회신 7유형 + 수신거부 처리 |

문서: `skills-public/docs/PRIVACY.md`, `skills-public/docs/GMAIL-SETUP.md`

앱 내부 스킬명(`press-distribution` 등)과 공개 스킬명(`press-release-writer` 등)은 일부 다르다 — 동일 파이프라인의 공개용 리네이밍.

---

## 6. 현재 성숙도

| 항목 | 상태 |
|---|---|
| 버전 | `0.1.0` (private SaaS) |
| UI / 도메인 / 승인·한도·마스킹 | 구현됨 |
| OpenCrab HTTP 동기화 | `opencrabActions.syncJournalists` 배선 (미설정 시 시드 폴백) |
| Gmail BYO OAuth / 언론홍보 초안 | `gmailActions` + `/gmail/callback` 배선 |
| 단위 테스트 | `convex/lib/*.test.ts` (vitest) |
| CI | `.github/workflows/ci.yml` (typecheck · test · lint) |
| Phase-2 (README) | Anthropic 개인화, 분석 대시보드, 예약 발송, 인터뷰 캘린더, 에이전시 API |

---

## 7. 아키텍처 개요

```
Browser (Next.js App Router)
  → middleware (Convex Auth 가드)
  → React pages under app/(app)/
  → Convex client (NEXT_PUBLIC_CONVEX_URL)
       ↓
Convex Cloud
  · authTables + domain tables
  · queries/mutations
  · lib/* = skill rules (scoring, email, reply, plans, mask)
  · seed.ts = demo ontology
       ⋮ (optional seams)
  OpenCrab · Anthropic · Gmail
```

상세: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 8. 분석 결론

1. **이중 배포 전략:** SaaS 앱 + 플랫폼 공용 스킬 팩으로 동일 워크플로우 제공.
2. **차별점:** OpenCrab 기자 온톨로지 + 컴플라이언스(승인·수신거부·억제·PII 마스킹)를 코드/스킬에 강제.
3. **당장 가능한 것:** 시드 기반 데모 풀스택 플로우.
4. **프로덕션 갭:** 실 API 배선, 테스트/CI, Gmail 실발송.

---

## 9. 확정된 후속 작업 범위 (우선순위)

분석 갭을 기준으로 **다음 구현 백로그 범위를 아래처럼 확정**한다.
(Phase-2 기능보다 프로덕션 배선·품질을 먼저 둔다.)

### P0 — 라이브 배선 (프로덕션 필수) — 코드 완료, 자격증명 연결 필요

1. **OpenCrab 연동** — `opencrabActions.syncJournalists` + `opencrabMap` (시드 폴백 유지). Convex에 `OPENCRAB_API_*` 설정 후 실검증.
2. **Gmail BYO OAuth** — 설정 연결 · `/gmail/callback` · `pushCampaignToGmail` (`언론홍보` 라벨). `GMAIL_OAUTH_*` + 콜백 URI 등록 후 실검증.
3. **배포 런북 검증** — [DEPLOY.md](./DEPLOY.md)대로 Convex prod + Vercel + Google OAuth 콜백 확인

### P1 — 품질·안전망 — 코드 완료

4. **단위 테스트** — `convex/lib` scoring / emailTemplate / replyClassifier / plans / mask / opencrabMap / gmailMime
5. **CI** — `.github/workflows/ci.yml` (lint + typecheck + test)
6. **공개 스킬 동기화** — `skills-public/` ↔ `contentscoin/crabpitch-skill` 게시 이름/절차 정리 (잔여)

### P2 — Phase-2 제품 (README)

7. 메일 개인화 Anthropic 강화 (`ANTHROPIC_API_KEY`)
8. 분석 대시보드, 예약 발송, 인터뷰 캘린더, 에이전시/멀티테넌트 API

새 작업은 **P0 자격증명 실검증** → P1 잔여(스킬 동기화) → P2 순서를 기본으로 한다.
