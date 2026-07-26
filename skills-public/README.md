# 크랩피치 스킬 팩 (CrabPitch Skills)

**ChatGPT · Claude · Gemini** 어디서나 쓰는 이식형 AI 스킬 묶음.
보도문 작성 → 미디어킷 → 기자 배포 메일(Gmail) → 회신 응대까지, 대화로 언론 홍보를 실행합니다.

> 이 저장소는 **공개(public)** 이며 **기자 개인정보(실명·이메일·연락처)를 포함하지 않습니다.**
> 스킬은 템플릿·지침일 뿐이고, 실제 기자 데이터는 사용자의 OpenCrab/연락처에서만 다룹니다.

## ⚡ 3분 퀵스타트

가장 빠른 방법은 **통합 프롬프트 한 개**를 복사해 쓰는 AI 채팅에 붙여넣는 것입니다.

<details>
<summary><b>📋 통합 부트스트랩 프롬프트 (복사해서 붙여넣기)</b></summary>

```
당신은 크랩피치(CrabPitch) 언론 홍보 어시스턴트입니다. 아래 4개 스킬 원문을 읽고
(웹 접근이 안 되면 필요한 스킬의 SKILL.md 본문을 붙여달라고 요청하세요),
지금부터 제 요청에 맞는 스킬을 골라 그 절차대로 진행하세요.

- 보도자료 작성: https://raw.githubusercontent.com/contentscoin/crabpitch-skill/main/skills/press-release-writer/SKILL.md
- 미디어킷 작성: https://raw.githubusercontent.com/contentscoin/crabpitch-skill/main/skills/media-kit-builder/SKILL.md
- 기자 배포: https://raw.githubusercontent.com/contentscoin/crabpitch-skill/main/skills/journalist-outreach/SKILL.md
- 회신 응대: https://raw.githubusercontent.com/contentscoin/crabpitch-skill/main/skills/reply-handler/SKILL.md

규칙:
1) 기자 실명·이메일은 출력에 넣지 말고 「기자 #XXXX」로 마스킹.
2) 실제 발송은 제가 명시적으로 승인한 뒤에만, 제 Gmail 「언론홍보」 라벨 워크플로우로.
3) 모든 메일에 수신거부 문구 포함. 한국어로 간결하게.

준비되면 "어떤 소식을 알리고 싶으신가요?"라고 물어보세요.
```

</details>

플랫폼별 설치(권장, 매번 붙여넣기 불필요):

| 플랫폼 | 설치 방법 |
|---|---|
| **Claude** (웹/데스크톱) | 설정 → 기능(Capabilities) → 스킬 추가, 또는 프로젝트 지식에 `skills/<name>/SKILL.md` 4개 업로드. 이후 "보도자료 써줘"라고 말하면 자동 발동 |
| **ChatGPT** | 커스텀 GPT 생성 → Instructions에 위 통합 프롬프트(또는 개별 SKILL.md 본문) 붙여넣기 → Knowledge에 SKILL.md 업로드 |
| **Gemini** | Gem 만들기 → 지침에 통합 프롬프트 붙여넣기. Google Workspace 연동 시 Gmail 초안까지 |
| **Cursor / Claude Code** | 저장소를 클론하고 `skills/`를 프로젝트 스킬로 등록. MCP는 [`docs/MCP-SETUP.md`](./docs/MCP-SETUP.md) |

단계별 상세 절차 → [`docs/QUICKSTART.md`](./docs/QUICKSTART.md)

## 스킬 4종과 사용 순서

```
① media-kit-builder ──(회사 기본 자료)──▶ ② press-release-writer
        (처음 1회)                              (소식이 생길 때마다)
                                                      │
                                    ③ journalist-outreach (매칭→메일→승인→발송)
                                                      │
                                    ④ reply-handler (회신 오면 7유형 분류·응대)
```

| 스킬 | 하는 일 | 트리거 예시 |
|---|---|---|
| `press-release-writer` | 5W1H·역피라미드 보도자료 + 헤드라인 3안 | "보도자료 써줘", "이 소식 알리고 싶어" |
| `media-kit-builder` | 인터뷰형 미디어킷(보일러플레이트·팩트시트·인용문) | "미디어킷 만들어줘", "프레스킷" |
| `journalist-outreach` | 주제-기자 매칭 + 개인화 메일 + Gmail '언론홍보' 라벨 초안 | "기자에게 뿌려줘", "언론 배포" |
| `reply-handler` | 회신 7유형 분류·응대 + '언론홍보' 라벨 모니터링 | "기자 답장", "회신 왔어" |

## 자동화 깊이 3단계

스킬 마크다운은 세 플랫폼 공용이고, 연결을 더할수록 자동화가 깊어집니다.

1. **스킬만** — 보도문·미디어킷·메일 문안 작성 (복붙 워크플로우)
2. **+ CrabPitch MCP** (유료 `cp_mcp_…` 키) — 채팅에서 기자 매칭·메일 템플릿·회신 분류 도구 직접 호출 → [`docs/MCP-SETUP.md`](./docs/MCP-SETUP.md)
3. **+ Gmail 연동** — '언론홍보' 라벨에 초안 자동 생성, 회신 모니터링 → [`docs/GMAIL-SETUP.md`](./docs/GMAIL-SETUP.md)

> 💡 **크랩피치 웹앱**([crabpitch](https://github.com/contentscoin/crabpitch))을 쓰면 반대 방향도 가능합니다 —
> 웹앱 「내 AI」에 본인 GPT·Claude·Gemini **API 키(BYOK)** 를 등록하면 보도문 다듬기·메일
> 개인화가 웹 화면 안에서 바로 실행됩니다. 스킬 복붙 없이 매칭→발송까지 한 화면에서 끝.

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
