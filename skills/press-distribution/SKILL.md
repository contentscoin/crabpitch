---
name: press-distribution
description: >-
  보도자료(press release)를 받아, 주제에 맞는 검증된 한국 기자를 찾아 매칭하고, 기자별로
  개인화된 배포 메일 초안을 만들고, 컴플라이언스 게이트와 발송 승인 절차를 거쳐 Gmail로
  발송·추적하는 전체 워크플로우를 오케스트레이션한다. 트리거: "보도자료 배포",
  "기자에게 뿌려줘", "언론 배포", "press release", "미디어 리스트", "기자 매칭".
license: 크랩피치(CrabPitch) 내부 사용용. 범용(Claude/GPT/Gemini) 호환.
---

# 보도자료 배포 오케스트레이터 (press-distribution) — 정본 참조 스텁

> ## ⚠️ 이 문서는 요약본이다. **정본은 `skills-public/skills/journalist-outreach/SKILL.md`.**
>
> 절차·템플릿·게이트 규칙은 모두 정본에 있다. 실제 작업을 할 때는 정본을 열어 그대로 따른다.
> 이 파일은 구판 경로 호환을 위해 남겨 둔 요약이며, 정본과 어긋나면 **정본이 맞다.**

| 필요한 것 | 정본 문서 |
|---|---|
| 매칭 → 메일 → 승인 → 발송 전체 절차 | `skills-public/skills/journalist-outreach/SKILL.md` |
| 메일 7블록 구조·CTA·엠바고·프리셋 | 위 문서의 「③ 개인화 메일 초안 — 7블록」 |
| 보도자료 작성 | `skills-public/skills/press-release-writer/SKILL.md` (+ `references/`) |
| 프레스킷 | `skills-public/skills/media-kit-builder/SKILL.md` |
| 회신 응대 | `skills-public/skills/reply-handler/SKILL.md` |

**코드 정본**: 규범 상수 `convex/lib/pressGuide.ts` · 메일 구조 `convex/lib/emailTemplate.ts` ·
발송 게이트 `convex/lib/emailCompliance.ts` · 쿨다운 `convex/lib/sendGuard.ts` ·
발송 확정 `convex/drafts.ts`의 `finalizeCampaignSend`.

## 5단계 흐름 (요약)

```
① 보도자료 정리 → ② 기자 매칭 → ③ 개인화 메일 초안(7블록) → ④ 게이트 + 승인 → ⑤ 발송·추적
```

사용자 승인 없이 실제 메일을 발송하지 않는다. 기본 산출물은 항상 초안(draft)이다.

## ⛔ 컴플라이언스 원칙 (요약)

기자 데이터는 `mailing_status: "candidate"`(발송 미승인) 전제다. "공개된 직무 연락처를
검색·분류하는 것"과 "실제 콜드메일을 보내는 것"은 다른 문제다.

1. **매칭·리스트업은 자유롭게**, **발송은 항상 사용자의 명시적 승인** 후.
2. 모든 메일에 수신거부 문구가 들어간다. 없으면 발송이 차단된다.
3. **동일 기자 7일 내 재발송 금지 — 이것은 안내 문구가 아니라 서버가 강제한다.**
   발송 확정 3경로(**즉시 발송 · 예약 발송 · 크론 백업**) 전부가 같은 공통 함수를 지나며,
   그 함수가 ① 수신거부 재대조 ② 7일 쿨다운(사용자 본인 발송 이력 기준, 캠페인 무관)
   ③ 컴플라이언스 critical FAIL 차단 ④ 캠페인당 발송 통수 상한 ⑤ 월 발송 한도를
   순서대로 재검증한다. 걸린 초안은 삭제하지 않고 사유를 기록한다.
4. **캠페인당 발송 통수 상한**이 월 한도와 별개로 존재한다(플랜별 상수). 한 번에 수백 통을
   뿌리는 대량발송을 구조적으로 막는 장치이며, 위 3경로에서 재검증된다.
5. 기자가 "수신거부/그만" 의사를 밝히면 즉시 억제 리스트에 추가하고 다시는 발송하지 않는다.
   → `reply-handler`가 담당하며, 억제 등록은 분류 경로와 무관하게 서버가 강제한다.
6. **기자 PII 비노출** — 실명·이메일·연락처는 채팅 응답·리스트·표·초안 어디에도 출력하지 않는다.
   익명 코드(`기자 #A3F1`) + 매체 + beat + 신뢰도 + 적합도만 노출하고, 실명·이메일은
   Gmail 초안 생성 시점의 수신자(To)·본문 인사말에만 주입한다.
7. **AI 실행은 사용자 본인 키(BYOK)·본인 챗으로만.** 크랩피치는 공용 LLM 키를 제공하지 않는다.

## 다른 스킬과의 연결

- 메일 문구 → **journalist-outreach-email**(스텁) → 정본 `journalist-outreach`
- 기자 답장 → **reply-handler**
- 회사 소개 자료 부실 → **media-kit-builder** 먼저

**Pro(유료) 확장 — `skills-pro/`**: 성과 집계 `campaign-report`(Solo+) · 팔로업/예약
`follow-up-scheduler`(Growth+) · 경쟁사 노출 비교 `competitor-coverage`(Growth+) ·
인터뷰 준비 `interview-prep`(Solo+) · 대행사 멀티 클라이언트 `agency-multi-client`(Agency).

## 절대 하지 말 것

- 사용자 승인 없는 실발송 · 연락처 신뢰도 low 기자에게 발송
- 7일 내 재발송·캠페인 상한 우회 시도(서버가 차단한다)
- 수신거부 문구 없는 메일 · 팩트체크 안 된 숫자
