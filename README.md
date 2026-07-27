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
- **MCP**: `/ai`에서 `cp_mcp_…` 키 발급(Free 포함) → Claude/ChatGPT/Gemini/Cursor 플러그인 등록. **Free는 보도자료 작성 도구까지**, 기자 매칭·메일 템플릿·회신 분류는 Solo 이상(웹앱에서는 Free도 이용 가능). 가이드: **`docs/MCP-SETUP.md`**

### 🔒 기자 개인정보 보호 (앱 기본값)
기자 **실명·이메일·연락처는 화면에 절대 표시하지 않습니다**(익명 코드 `기자 #XXXX`로 대체).
실제 이메일·실명은 **메일 발송 시점**에 Gmail 수신자·본문으로만 사용됩니다. 서버 쿼리도 클라이언트로
PII를 내려보내지 않습니다.

## 📦 공개 스킬 팩 (`skills-public/`)
Codex/Claude/Gemini에서 바로 쓰는 **공개 배포용** 스킬 묶음(보도문·미디어킷·기자배포·회신).
Gmail **`언론홍보`** 라벨 워크플로우 + PII 보호가 내장돼 있으며, 기자 실데이터를 포함하지 않습니다.
게시 저장소: **[`contentscoin/crabpitch-skill`](https://github.com/contentscoin/crabpitch-skill)** (public) — 절차는 `skills-public/PUBLISH.md` 참조.
동기화: `pnpm sync:skills-public`

## 💎 Pro 스킬 팩 (`skills-pro/`) — 유료 구독자 전용
요금제 기능표(기획서 6.3)에 대응하는 유료 스킬 5종(4종 직접 매핑 + interview-prep은 '답장 응대'
고도화·3차 로드맵 선행 구현). **공개 repo에 게시하지 않습니다.**

| 스킬 | 플랜 | 하는 일 |
|---|---|---|
| `campaign-report` | Solo+ | 발송·회신율·게재율 집계 + 게재 확인 + 개선 제안 + 기자 관계 스코어 |
| `interview-prep` | Solo+ | 인터뷰 일정(캘린더)·예상 질문 15·답변 브리지·모의 인터뷰 |
| `follow-up-scheduler` | Growth+ | 무응답 팔로업(D+7 규칙)·발송 타이밍·예약 리마인더·엠바고 |
| `competitor-coverage` | Growth+ | 경쟁사 노출 매트릭스·갭 분석·뉴스재킹 앵글·신규 기자 발굴 |
| `agency-multi-client` | Agency | 클라이언트 라벨 격리·이해충돌 관리·2단계 승인·화이트라벨 리포트 |

상세와 파이프라인 다이어그램은 `skills-pro/README.md` 참조.

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
skills-pro/                           💎 유료 전용 5종 (성과리포트·팔로업·경쟁사·인터뷰·대행사)
dist/
  press-distribution.skill 등 9종     Claude/Cowork 설치용 .skill 패키지 (무료 4 + Pro 5)
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

`dist/*.skill`는 각 `skills/<name>/SKILL.md`(및 `skills-pro/<name>/SKILL.md`)를
**SKILL.md 하나만 담아 zip으로 압축**한 것입니다. (아카이브 루트에 `SKILL.md` 단일 엔트리)
SKILL.md를 수정한 뒤에는 아래로 다시 생성해 소스와 배포물이 어긋나지 않게 하세요:

```bash
for d in skills/*/ skills-pro/*/; do n=$(basename "$d"); [ -f "$d/SKILL.md" ] && (cd "$d" && zip -q -j "../../dist/$n.skill" SKILL.md); done
```

## 내 AI로 작성 (BYO) — 유저 자신의 LLM만 사용

크랩피치는 **자체 LLM·공용 API 키를 제공하지 않습니다.** 앱 메뉴 **내 AI** (`/ai`)에서
유저가 자신의 GPT·Claude·Gemini를 연결하는 방법은 두 가지입니다.

### ① 스킬·MCP 연결 — 쓰던 구독형 AI 채팅에서 ★기본
유저가 이미 구독 OAuth로 로그인돼 있는 본인 ChatGPT·Claude·Gemini에서 실행합니다
(3사 모두 서드파티가 유저 구독을 서버에서 대신 호출하는 OAuth 위임을 제공하지 않으므로,
이 방향이 유저 구독을 활용하는 유일한 구조입니다):

1. `/ai`에서 스킬 프롬프트 복사 → 내 AI 채팅에 붙여넣기 (공개 스킬 팩 기준)
2. MCP 연결 키 발급(Free 포함) → 채팅에서 도구 직접 호출. Free는 「보도자료 규범 알려줘」까지, 「기자 찾아줘」는 Solo 이상
3. (선택) **CLI 설치 스크립트** (`/crabpitch-byo-ai-setup.sh` · `.ps1`) — 터미널 사용자용

### ② 본인 API 키 연결 (BYOK) — 웹에서 바로 실행 (선택·고급)
웹 화면 안에서 「AI로 다듬기」를 쓰고 싶은 유저만 본인 API 키를 등록합니다.
사용량만큼 본인 계정으로 과금되며, 키는 서버에만 저장되고 화면에는 마스킹만 표시.
서버 환경변수 폴백 없음(BYOK 전용). 상세: **`docs/AI-PROVIDERS.md`**

## 다음에 이어서 할 것

1. Convex prod에 OpenCrab MCP 키 설정 + Google `/gmail/callback` 등록
2. 설정 → **서버 연동 상태** / **내 AI** 확인
3. (선택) 로드맵 3차 — 2차(성과 추적·예약 발송·캘린더 인터뷰·경쟁사 비교·멀티클라이언트)의
   스킬 레이어는 **Pro 스킬 팩(`skills-pro/`)으로 구현 완료**. 남은 것: 웹앱 대시보드 성과 리포트
   화면 통합, 결제 연동, 대행사 API.

상세: `docs/PROJECT_ANALYSIS.md` · 배포: `docs/DEPLOY.md`
