# 크랩피치 스킬 팩 (CrabPitch Skills)

**Codex · Claude · Gemini** 어디서나 쓰는 이식형 AI 스킬 묶음.
보도문 작성 → 미디어킷 → 기자 배포 메일(Gmail) → 회신 응대까지, 대화로 언론 홍보를 실행합니다.

> 이 저장소는 **공개(public)** 이며 **기자 개인정보(실명·이메일·연락처)를 포함하지 않습니다.**
> 스킬은 템플릿·지침일 뿐이고, 실제 기자 데이터는 사용자의 OpenCrab/연락처에서만 다룹니다.

## 스킬 4종

| 스킬 | 하는 일 | 트리거 예시 |
|---|---|---|
| `press-release-writer` | 5W1H·역피라미드 보도자료 + 헤드라인 3안 | "보도자료 써줘", "이 소식 알리고 싶어" |
| `media-kit-builder` | 인터뷰형 미디어킷(보일러플레이트·팩트시트·인용문) | "미디어킷 만들어줘", "프레스킷" |
| `journalist-outreach` | 주제-기자 매칭 + 개인화 메일 + Gmail '언론홍보' 라벨 초안 | "기자에게 뿌려줘", "언론 배포" |
| `reply-handler` | 회신 7유형 분류·응대 + '언론홍보' 라벨 모니터링 | "기자 답장", "회신 왔어" |

## 플랫폼별 사용법

- **Claude / Cowork** — 각 `skills/<name>/SKILL.md`를 스킬로 추가하면 트리거로 자동 로드. **CrabPitch MCP**(유료 `cp_mcp_…`) 연결 시 매칭·템플릿 도구까지 사용. Gmail MCP는 라벨·초안 자동화용.
- **ChatGPT / Codex** — `SKILL.md` 본문을 커스텀 GPT Instructions(또는 Codex 시스템 프롬프트)에 붙여넣기. CrabPitch MCP 커넥터 + Gmail 연동으로 발송.
- **Gemini** — 동일 `SKILL.md`를 Gem/프롬프트로 사용, CrabPitch MCP + Google Workspace 연동으로 Gmail 발송.
- **Cursor** — `docs/MCP-SETUP.md`의 `mcp.json` 스니펫으로 CrabPitch MCP 등록.

> 스킬은 **마크다운 하나로 세 플랫폼 공용**입니다. 자동화 깊이(MCP/커넥터 연결 여부)만 다릅니다.
> MCP 키 발급·등록 → [`docs/MCP-SETUP.md`](./docs/MCP-SETUP.md) (CrabPitch 유료 플랜 전용).

## 두 가지 필수 원칙

1. **기자 개인정보 보호** — 실명·이메일·연락처는 화면/출력에 **절대 표시하지 않는다**(익명 코드로 대체). 실제 이메일·실명은 **실제 발송 시점**에 Gmail 수신자·본문으로만 사용한다. 자세히 → `docs/PRIVACY.md`
2. **Gmail '언론홍보' 라벨** — 모든 배포 메일과 회신을 Gmail의 **`언론홍보`** 라벨(그룹) 안에서 주고받는다. 설정 → `docs/GMAIL-SETUP.md`

## 컴플라이언스

기자 연락처는 공개된 직무 정보이며 `mailing_status: candidate`(발송 미승인)를 전제로 한다.
매칭·리스트업은 자유롭게, **실제 발송은 사용자 명시 승인 후에만**. 모든 메일에 수신거부 문구 삽입,
수신거부 회신은 즉시 억제 리스트 등록, 동일 기자 7일 내 재발송 금지, 발송은 **사용자 본인 Gmail(BYO-Email)**.

## 더 필요하면 — Pro 스킬 (CrabPitch 유료 구독)

이 공개 팩은 "첫 게재"까지를 담당합니다. **반복·규모·자동화**는 유료 구독자 전용 Pro 스킬 5종이 담당합니다:
성과 리포트(회신율·게재율·관계 스코어) · 팔로업/예약 발송(D+7 규칙) · 경쟁사 노출 비교 ·
인터뷰 준비(캘린더·모의 인터뷰) · 대행사 멀티 클라이언트(화이트라벨). → [crabpitch.vercel.app](https://crabpitch.vercel.app)

## 라이선스
MIT — `LICENSE` 참조. (Pro 스킬은 이 저장소에 포함되지 않으며 별도 상용 라이선스입니다.)
