# AGENTS.md

크랩피치(CrabPitch) — Convex(백엔드) + Next.js 15 App Router(프론트) 풀스택 SaaS.
표준 실행/배포 명령은 `README.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, `package.json` scripts를 우선 참조하세요.

## Cursor Cloud specific instructions

환경 부팅 시 업데이트 스크립트가 `pnpm install`을 이미 실행합니다. 아래는 이 저장소에서
서비스를 띄우고 검증할 때의 **비자명한 주의사항**입니다.

### 서비스 실행 (두 프로세스 필요)
- Convex 로컬 백엔드: `CONVEX_AGENT_MODE=anonymous npx convex dev`
  - `CONVEX_AGENT_MODE=anonymous` 가 **필수**. 클라우드 VM에는 Convex 계정이 없어, 이 값 없이
    `npx convex dev`를 실행하면 대화형 로그인 단계에서 멈춥니다. 이 모드는 로그인 없이 로컬
    익명 배포(포트 3210/3211)를 띄우고 `.env.local`(git-ignored)에 `NEXT_PUBLIC_CONVEX_URL` 등을 자동 주입합니다.
  - Convex 관련 CLI(`convex run`, `convex env set` 등)는 모두 `CONVEX_AGENT_MODE=anonymous` 를 붙여 실행하세요.
- 프론트엔드: `pnpm dev` (http://localhost:3000). 반드시 위 Convex dev가 먼저 떠 있어야 합니다.
- 두 프로세스는 장시간 실행이므로 tmux 등 백그라운드 세션에서 각각 띄우세요.

### 인증(중요한 제약)
- 로그인은 **Google OAuth 전용**(`convex/auth.ts`). 클라우드 VM에서 대화형 Google 로그인은
  `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`(Convex 배포 env)와 실제 Google 계정 없이는 완료할 수 없습니다.
  따라서 `/dashboard` 등 보호 라우트는 로그인 없이 UI로 직접 진입할 수 없습니다(미들웨어가 `/signin`으로 리다이렉트).
- Convex Auth JWT 키(`JWT_PRIVATE_KEY`, `JWKS`)와 `SITE_URL`은 로컬 익명 배포의 env로 설정합니다
  (`npx convex env set ...`). 이 값들은 로컬 배포에 저장되며 프론트 `.env.local`이 아닙니다.
  Google 자격증명이 없어도 이 키만으로는 로그인이 되지 않습니다(위 제약 참조).

### 로그인 없이 코어 기능 검증하기
- 핵심 비즈니스 로직(매칭·메일 초안·회신 분류)은 `convex/lib/`의 순수 모듈에 있습니다:
  `scoring.ts`(기자 적합도), `emailTemplate.ts`(메일 6블록+수신거부), `replyClassifier.ts`(회신 7유형).
- 앱 함수(`convex/*.ts`)는 대부분 `requireUser`(로그인)이 필요합니다. 로그인이 불가한 환경에서
  파이프라인을 end-to-end로 돌려보려면, 위 순수 모듈을 재사용하는 **임시 `internalMutation`**을
  `convex/`에 만들어 `CONVEX_AGENT_MODE=anonymous npx convex run <module>:<fn>` 으로 실행한 뒤
  삭제하세요(실제 스키마/런타임에 대해 seed→match→draft→send→reply까지 검증 가능).

### 품질 게이트
- 린트는 설정되어 있지 않습니다(ESLint 설정/의존성 없음, `next.config.ts`가 빌드 시 lint를 무시).
  품질 게이트는 **`pnpm typecheck`**(=`tsc --noEmit`)입니다.
- 프로덕션 빌드 확인: `pnpm build`. 단, dev 서버와 `.next/` 디렉터리를 공유하므로 dev 서버를
  잠시 멈춘 뒤 빌드하고 다시 `pnpm dev` 로 재시작하는 것이 안전합니다.
- 자동화된 테스트 스위트는 저장소에 없습니다.

### 통합(선택)
- `OPENCRAB_API_*`, `ANTHROPIC_API_KEY`, `GMAIL_OAUTH_*` 미설정 시 데모 시드/템플릿으로 동작합니다(`.env.example` 참조).
