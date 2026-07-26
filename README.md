# 크랩피치(CrabPitch) 패키지 — 사용 안내

OpenCrab 한국 기자 온톨로지 + Gmail 기반 **보도자료 배포 SaaS** 기획과 실제 스킬 묶음,
그리고 이를 구현한 **풀스택 웹 앱(Convex + Next.js + Vercel)** 입니다.
타깃: 1인 창업가·소상공인 · 스킬: Claude/GPT/Gemini 범용.

## 🚀 웹 앱 (Convex + Next.js + Vercel)

스킬 4종의 로직(매칭 점수·메일 프레임·회신 7유형 분류)을 그대로 흡수한 실제 SaaS 웹 앱입니다.
매칭 → 작성 → 발송(승인 게이트) → 회신 응대까지 대시보드에서 실행합니다.

```bash
pnpm install
npx convex dev     # Convex 로그인/프로젝트 생성 → NEXT_PUBLIC_CONVEX_URL 자동 주입
pnpm dev           # http://localhost:3000  (로그인 후 대시보드 '데모 데이터 생성')
```

- 아키텍처·도메인 모델·통합 심(seam)·배포 절차: **`docs/ARCHITECTURE.md`**
- 프로젝트 현황·성숙도·후속 백로그: **`docs/PROJECT_ANALYSIS.md`**
- 자격증명 없이도 데모 시드로 전 기능 동작. OpenCrab/Anthropic/Gmail 실 배선 지점은 `.env.example` 참조.
- **유료 MCP**: Solo/Growth/Agency에서 `/ai`로 `cp_mcp_…` 키 발급 → Claude/ChatGPT/Gemini/Cursor 플러그인 등록. 가이드: **`docs/MCP-SETUP.md`**

### 🔒 기자 개인정보 보호 (앱 기본값)
기자 **실명·이메일·연락처는 화면에 절대 표시하지 않습니다**(익명 코드 `기자 #XXXX`로 대체).
실제 이메일·실명은 **메일 발송 시점**에 Gmail 수신자·본문으로만 사용됩니다. 서버 쿼리도 클라이언트로
PII를 내려보내지 않습니다.

## 📦 공개 스킬 팩 (`skills-public/`)
Codex/Claude/Gemini에서 바로 쓰는 **공개 배포용** 스킬 묶음(보도문·미디어킷·기자배포·회신).
Gmail **`언론홍보`** 라벨 워크플로우 + PII 보호가 내장돼 있으며, 기자 실데이터를 포함하지 않습니다.
`contentscoin/crabpitch-skill` (public)로 게시하는 절차는 `skills-public/PUBLISH.md` 참조.
동기화: `pnpm sync:skills-public`

아래는 **범용 스킬 패키지**(Claude/GPT/Gemini에 그대로 붙여 쓰는 마크다운) 안내입니다.

## 구성물

```
크랩피치_서비스기획서.md      ← 전체 기획 + 비용정책(무료/유료 티어, 가격 근거)
README.md                     ← (이 파일) 스킬 설치·범용 사용법
skills/
  press-distribution/SKILL.md        기자 매칭·발송 오케스트레이터(전체 지휘)
  journalist-outreach-email/SKILL.md  기자 배포 메일 템플릿 프레임
  reply-handler/SKILL.md              기자 답장 7유형 분류·응대
  media-kit-builder/SKILL.md          인터뷰형 미디어킷 생성
dist/
  press-distribution.skill 등 4종     Claude/Cowork 설치용 .skill 패키지
  크랩피치_랜딩.html                   제품소개/가격표 랜딩 페이지
demo/
  데모_실행기록.md                     실제 OpenCrab 매칭 + Gmail 초안 시연 기록
```

## 스킬 4종은 이렇게 맞물립니다

```
media-kit-builder → (회사 자료 확보) → press-distribution(지휘)
                                          ├─ journalist-outreach-email(메일 작성)
                                          └─ reply-handler(회신 응대)
```

## 플랫폼별 사용법 (범용 우선)

### ① Claude / Cowork
`dist/*.skill` 파일을 스킬로 추가하면 트리거 문구로 자동 로드됩니다. OpenCrab MCP와
Gmail MCP를 연결하면 매칭→초안→라벨링까지 완전 자동화됩니다.

### ② ChatGPT 웹
`skills/press-distribution/SKILL.md`(및 나머지 3종) 본문을 **커스텀 GPT의 Instructions**에
붙여넣으세요. MCP가 없으므로 기자 리스트는 사용자가 붙여넣거나 OpenCrab 결과를 복사해
넣고, 메일은 웹 로그인 상태의 Gmail로 발송합니다(반자동).

### ③ Gemini 웹
동일한 SKILL.md 본문을 Gem 또는 프롬프트로 사용하고, Google Workspace 연동으로
Gmail 발송을 진행합니다.

> 핵심: **스킬은 마크다운 하나로 세 플랫폼 공용**입니다. 자동화 깊이(MCP 연결 여부)만
> 플랫폼별로 다릅니다.

## ⚠️ 반드시 지킬 컴플라이언스

OpenCrab 기자 데이터는 모두 `mailing_status: candidate` (발송 미승인) 상태입니다. 그래서:
- 매칭·리스트업은 자유롭게, **실제 발송은 사용자 명시 승인 후에만**
- 모든 메일에 **수신거부 문구** 삽입, 회신 시 즉시 억제 리스트 등록
- 동일 기자 7일 내 재발송 금지
- 발송은 **사용자 본인 Gmail(BYO-Email)** 로

## 개발 메모: `.skill` 빌드 (재생성)

`dist/*.skill`는 각 `skills/<name>/SKILL.md`를 **SKILL.md 하나만 담아 zip으로 압축**한 것입니다.
(아카이브 루트에 `SKILL.md` 단일 엔트리) SKILL.md를 수정한 뒤에는 아래로 다시 생성해
소스와 배포물이 어긋나지 않게 하세요:

```bash
for d in skills/*/; do n=$(basename "$d"); (cd "$d" && zip -q -j "../../dist/$n.skill" SKILL.md); done
```

## 내 AI로 작성 (BYO) — 두 가지 방법

앱 메뉴 **내 AI** (`/ai`)에서 GPT·Claude·Gemini를 연결하는 방법은 두 가지입니다.

### ① API 키 연결 (BYOK) — 웹에서 바로 실행 ★추천
OpenAI·Anthropic·Google 중 **하나의 API 키만 등록**하면 보도자료 다듬기·메일 개인화가
웹 화면 안에서 직접 작동합니다(복붙 불필요). 키는 서버에만 저장되고 화면에는 마스킹만
표시되며, 「연결 테스트」로 즉시 확인할 수 있습니다.
우선순위: **사용자 키 → 서버 환경변수**(`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY`).
상세: **`docs/AI-PROVIDERS.md`**

### ② 스킬·MCP 연결 — 쓰던 구독형 AI 채팅에서
API 키 없이 ChatGPT·Claude·Gemini 구독만 있다면:

1. `/ai`에서 스킬 프롬프트 복사 → 내 AI 채팅에 붙여넣기 (공개 스킬 팩 기준)
2. (Solo 이상) MCP 연결 키 발급 → 채팅에서 「기자 찾아줘」 직접 호출
3. (선택) **CLI 설치 스크립트** (`/crabpitch-byo-ai-setup.sh` · `.ps1`) — 터미널 사용자용

## 다음에 이어서 할 것

1. Convex prod에 OpenCrab MCP 키 설정 + Google `/gmail/callback` 등록
2. 설정 → **서버 연동 상태** / **내 AI** 확인
3. (선택) 경쟁사 모니터링 등 로드맵 3차

상세: `docs/PROJECT_ANALYSIS.md` · 배포: `docs/DEPLOY.md`
