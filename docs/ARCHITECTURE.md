# 크랩피치 아키텍처 (Convex + Next.js + Vercel)

현황·성숙도·후속 작업 범위는 **[PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md)** 를 본다.

마크다운 스킬 묶음이던 크랩피치를 **실제 풀스택 SaaS**로 고도화한 구조 문서입니다.
스킬 4종(press-distribution / journalist-outreach-email / reply-handler / media-kit-builder)의
로직은 폐기되지 않고 **Convex 백엔드의 순수 라이브러리**로 흡수되었습니다.

## 스택

| 계층 | 기술 |
|---|---|
| 프론트엔드 | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 |
| 백엔드 | Convex (스키마·쿼리·뮤테이션) |
| 인증 | Convex Auth (`@convex-dev/auth`, Password 제공자) |
| 배포 | Vercel(프론트) + Convex Cloud(백엔드) |
| 디자인 | 브랜드 디자인 시스템(🦀 오렌지/딥 네이비/틸), 라이트·다크 |

## 디렉터리

```
app/                      Next.js App Router
  page.tsx                마케팅 랜딩
  signin/                 로그인·가입
  (app)/                  인증 보호 그룹 (미들웨어 가드)
    dashboard/ campaigns/ journalists/ replies/ media-kit/ settings/
convex/                   백엔드
  schema.ts               도메인 스키마(11 테이블 + auth)
  auth.ts http.ts         Convex Auth
  lib/                    ★ 스킬 로직 흡수(순수 TS)
    scoring.ts            기자 매칭 적합도(press-distribution 랭킹 규칙)
    emailTemplate.ts      기자 배포 메일 6블록(journalist-outreach-email)
    replyClassifier.ts    회신 7유형 분류·답장 초안(reply-handler)
    plans.ts mask.ts      요금 한도 · 이메일 블러
  campaigns/ drafts/ journalists/ replies/ ... 함수 모듈
  seed.ts                 데모 기자 온톨로지 + 데모 캠페인
components/ui|app         디자인 시스템 · 앱 셸
skills/ dist/ demo/       기존 스킬 패키지(범용 Claude/GPT/Gemini, 그대로 유지)
```

## 도메인 모델 (Convex 스키마)

`profiles · journalists · pressReleases · campaigns · matches · emailDrafts ·
replies · suppressionList · mediaKits · usage` (+ Convex Auth `users`/`authSessions` 등)

## 실행 루프 (매칭 → 작성 → 발송 → 응대)

```
새 보도자료 작성 (pressReleases.create, 무료 월 3건 한도)
   → campaigns.create
   → journalists.matchForCampaign  (scoring.ts, 억제 리스트 제외, 적합도 0~100 + 근거)
   → drafts.generateForCampaign    (emailTemplate.ts, 기자별 개인화 + 수신거부 문구 필수)
   → ▣ 승인 게이트(사용자 확인) → drafts.sendCampaign (월 발송 한도 강제, 초안 기록)
   → replies.add                   (replyClassifier.ts, 7유형 분류; 수신거부→억제 리스트 자동 등록)
```

## 컴플라이언스(코드로 강제)

- 모든 기자 레코드 `mailingStatus: "candidate"`.
- 실발송은 승인 게이트(`optOutConfirmed`) 통과 후 `sendCampaign`만 호출 — 자동 발송 도구 없음.
- 메일 본문에 수신거부 문구 강제 삽입(`emailTemplate.OPT_OUT`), `hasOptOut()`로 검증.
- 수신거부(⑥) 회신 시 `suppressionList` 영구 등록 → 재매칭에서 자동 제외.
- 무료 월 10통·보도자료 3건 한도는 `usage` 테이블 + `plans.ts`로 강제.

## 통합 심(seam) — 무자격증명 데모 동작

실제 API 키 없이도 **데모 시드 데이터**로 전 기능이 동작합니다. 실서비스 배선 지점:

| 기능 | 현재(데모) | 실 배선 |
|---|---|---|
| 기자 매칭 | `seed.ts` 시드 기자 DB | `opencrabActions.syncJournalists` → `OPENCRAB_API_*` 업서트 (실패/미설정 시 시드 폴백) |
| 보도자료·메일 생성 | 템플릿(`emailTemplate.ts`) + 선택 AI | `aiActions.*` + `ANTHROPIC_API_KEY` (없으면 템플릿 유지) |
| Gmail 발송/초안 | 상태 기록만 (`drafts.sendCampaign`) | 설정에서 BYO OAuth → `gmailActions.pushCampaignToGmail` (`언론홍보` 라벨 초안) |

OpenCrab HTTP 계약: `POST OPENCRAB_API_URL` + Bearer 키, body `{ query, pack_query, top_k }`,
응답 `{ journalists: [{ reporter_name, outlet_name, email, beat_primary, ... }] }`
(변형 형태는 `convex/lib/opencrabMap.ts` 가 정규화).

Gmail 콜백: `https://<deployment>.convex.site/gmail/callback`
(`GMAIL_OAUTH_*` 는 로그인용 `AUTH_GOOGLE_*` 와 별도 클라이언트 권장).

## 로컬 실행

```bash
pnpm install
npx convex dev          # Convex 프로젝트 생성/로그인 → NEXT_PUBLIC_CONVEX_URL 자동 주입
pnpm dev                # http://localhost:3000
```
첫 로그인 후 대시보드의 **데모 데이터 생성** 버튼으로 시드.

## 배포 (Vercel + Convex)

1. **Convex 프로덕션 배포**: `npx convex deploy` → 프로덕션 배포 URL 확보.
2. **Vercel 프로젝트**: 이 저장소 임포트.
   - Build Command: `npx convex deploy --cmd 'pnpm build'`
   - 환경변수: `NEXT_PUBLIC_CONVEX_URL`(프로덕션), `CONVEX_DEPLOY_KEY`(Convex 대시보드 발급)
3. Convex 대시보드에서 `SITE_URL`을 Vercel 배포 도메인으로 설정(Auth 콜백).

> 이 세션에서는 Convex 계정 자격증명이 없어 라이브 백엔드 없이 **코드베이스 + 프로덕션 빌드 통과**까지 완료했습니다. 위 단계로 자격증명을 연결하면 그대로 라이브가 됩니다.
