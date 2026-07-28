# CrabPitch MCP 설정

CrabPitch는 **유저별 MCP 키**(`cp_mcp_…`)를 발급합니다.
Claude Desktop · Cursor · ChatGPT 커스텀 커넥터 · Gemini 등에서 플러그인으로 등록해
보도자료 작성·기자 매칭·이메일 템플릿·회신 분류 도구를 호출할 수 있습니다.

> **키는 Free 플랜도 발급받습니다.** 다만 채팅에 노출되는 **도구가 플랜마다 다릅니다** — §3 참조.
> 잠긴 도구는 목록에 보이지도 않고, 직접 호출해도 막힙니다.
>
> 잠긴 것은 *채팅이라는 창구*일 뿐입니다. 기자 매칭·메일 초안·회신 응대·미디어킷은
> **CrabPitch 웹앱에서 Free 플랜으로도 그대로 이용**할 수 있습니다.

## 1. 키 발급

1. [CrabPitch](https://crabpitch.com)에 로그인 → **내 AI 연동** (`/ai`)
2. **CrabPitch MCP 키**에서 키 이름 입력 후 발급
3. 표시된 `cp_mcp_…` 키와 JSON 스니펫을 **즉시 복사** (재표시 없음)

## 2. 등록 방법

엔드포인트 (배포 URL은 Convex `.convex.site` 기준):

```
https://<YOUR_DEPLOYMENT>.convex.site/api/mcp/<cp_mcp_키>
```

또는 Bearer:

```
POST https://<YOUR_DEPLOYMENT>.convex.site/api/mcp
Authorization: Bearer cp_mcp_…
```

### Cursor / Claude Desktop (`mcp.json`)

```json
{
  "mcpServers": {
    "crabpitch": {
      "url": "https://YOUR_DEPLOYMENT.convex.site/api/mcp/cp_mcp_YOUR_KEY"
    }
  }
}
```

### ChatGPT / Claude / Gemini

각 제품의 **Custom Connector / MCP 플러그인** 설정에 위 URL(또는 Bearer 키)을 등록합니다.
제품 UI는 자주 바뀌므로, 앱의 **내 AI 연동** 화면에 있는 최신 스니펫을 복사하는 것을 권장합니다.

## 3. 제공 도구 (플랜별)

| 도구 | 설명 | Free | Solo 이상 |
|---|---|:--:|:--:|
| `crabpitch_status` | 연결·플랜 상태, 사용 가능/잠긴 스킬 | ✅ | ✅ |
| `crabpitch_press_guide` | 보도자료 작성 규범(구조·GEO·표시광고법) + 초안 규칙 검사 | ✅ | ✅ |
| `crabpitch_mail_setup` | 발신 메일(SMTP) 연결 상태 + 제공자별 설정 절차 안내 | ✅ | ✅ |
| `crabpitch_match_journalists` | 주제 태그 매칭 (응답: `기자 #XXXX` 코드만, 실명·이메일 없음) | — | ✅ |
| `crabpitch_email_template` | 피치 메일 제목/본문 템플릿 | — | ✅ |
| `crabpitch_classify` | 회신 텍스트 7유형 분류 | — | ✅ |

무료 플랜에서 잠긴 도구는 `tools/list`에 **아예 나오지 않습니다.** 목록을 건너뛰고 직접 호출해도
막히며, 어떤 도구가 잠겼는지는 `crabpitch_status`의 `lockedSkills`로 확인할 수 있습니다.

> **왜 MCP만 좁은가** — 웹앱은 사람이 화면을 보며 한 건씩 승인하지만, MCP는 에이전트가 반복
> 호출합니다. 기자단 데이터와 발송 인프라를 무료로 자동화 대상에 올려 두면 남용 비용이
> 곧바로 커집니다. 그래서 *기능*이 아니라 *자동화 창구*를 플랜으로 나눴습니다.

`crabpitch_mail_setup`은 **무료에도 열려 있습니다.** 무료 사용자도 웹앱에서 발송할 수 있고,
그러려면 메일 계정을 연결해야 합니다. 설정을 막으면 잠기는 건 발송이 아니라 온보딩입니다.

> **이 도구는 비밀번호를 받지 않습니다.** 입력 스키마에 자리가 없습니다. MCP 인자는 대화
> 기록에 남고, 그곳은 우리 DB보다 통제가 약합니다. 도구는 제공자별 절차와 설정 화면 주소만
> 돌려주고, 실제 입력은 사용자가 웹에서 직접 합니다.

실제 메일 발송·실명 주입은 **CrabPitch 웹앱**에서만 합니다. 발송 경로는 두 가지이고
(Gmail 초안 생성 · SMTP 직접 발송) **둘 다 같은 승인·수신거부·쿨다운·표현 규정·한도 게이트**를
통과합니다.

## 4. OpenCrab MCP와의 차이

| | CrabPitch MCP | OpenCrab MCP |
|---|---|---|
| 키 | `cp_mcp_…` (앱에서 발급) | `ocm_…` (OpenCrab) |
| 용도 | 피치 워크플로 도구 | 기자 온톨로지 심 |
| 플랜 | Free는 보도자료 도구까지 · 나머지는 Solo 이상 | OpenCrab 계정 |

둘 다 등록해도 됩니다. 스킬 팩과 함께 쓰는 기본 경로는 **CrabPitch MCP**입니다.

## 5. 연결이 안 될 때 (트러블슈팅)

### ① 먼저 브라우저로 확인 — 30초 진단
MCP URL을 **브라우저 주소창에 그대로 붙여넣습니다**(엔드포인트는 GET도 지원).

| 응답 | 의미 | 조치 |
|---|---|---|
| `{"ok":true,"server":{"name":"crabpitch"},"plan":"solo",…}` | 서버·키 모두 정상 | 클라이언트(② 이하) 문제 |
| `{"error":"유효하지 않거나 해지된 MCP 키입니다…"}` (401) | 키 폐기됨 · 오타 | `/ai`에서 재발급 |
| `{"error":"Authorization: Bearer cp_mcp_... 가 필요합니다"}` (401) | URL에서 키 부분이 잘림 | 전체 URL 복사 확인 |
| 404 / Convex 기본 페이지 | 배포에 MCP 라우트가 없음 | 저장소 루트에서 `npx convex deploy` |
| 연결은 되는데 **매칭·회신 분류 도구만 안 보임** | Free 플랜 — 정상 동작입니다 | 해당 기능은 웹앱에서 이용하거나 Solo 이상으로 업그레이드 |

키는 `cp_mcp_` + **16진수 48자**입니다. 길이가 다르면 복사가 잘린 것입니다.

### ② 클라이언트별 등록
```bash
# Claude Code (로컬 터미널)
claude mcp add --transport http crabpitch "https://<DEPLOYMENT>.convex.site/api/mcp/<키>"
claude mcp list        # 상태 확인
```
Cursor·Claude Desktop은 위 §2의 `mcp.json` 스니펫을 사용합니다.

### ③ 방화벽·egress 정책
사내망·CI·**Claude Code 웹(원격 컨테이너)** 처럼 아웃바운드가 허용 목록으로 제한된 환경에서는
`*.convex.site` 연결이 프록시 단계에서 **403**으로 막힙니다. 이때 MCP 클라이언트는 흔히
"Needs authentication"으로 표시하지만 **키 문제가 아닙니다.** 해당 호스트를 네트워크 정책에
허용하거나, 로컬 머신에서 등록해 사용하세요.

> 서버 응답 계약(JSON-RPC `initialize`·`tools/list`·`tools/call`, 401 분기, CORS)은
> `convex/mcpHttp.test.ts`가 회귀 테스트로 고정합니다.

## 6. 보안

- 키를 채팅·이슈·커밋에 붙이지 마세요.
- 유출 시 앱에서 즉시 **폐기** 후 재발급하세요.
- Free로 다운그레이드해도 키는 살아 있지만, 보도자료 도구만 남고 나머지는 목록에서 사라집니다.
  (다운그레이드 전에 만든 캠페인·초안은 웹앱에서 그대로 볼 수 있습니다.)
