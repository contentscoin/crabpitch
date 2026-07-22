# 크랩피치(CrabPitch) 패키지 — 사용 안내

OpenCrab 한국 기자 온톨로지 + Gmail 기반 **보도자료 배포 SaaS** 기획과 실제 스킬 묶음입니다.
타깃: 1인 창업가·소상공인 · 스킬: Claude/GPT/Gemini 범용.

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

## 다음에 이어서 할 것 (2차)
성과 추적·예약 발송·대시보드 구현, 캘린더 연동 인터뷰 예약, 대행사용 멀티테넌시·API.
자세한 로드맵은 기획서 9장 참조.
