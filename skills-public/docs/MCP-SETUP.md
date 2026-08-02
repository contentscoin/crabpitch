# CrabPitch MCP 설정

크랩피치 스킬과 함께 **유저별 MCP 키**(`cp_mcp_…`)를 Claude · ChatGPT · Gemini · Cursor에 등록합니다.

> 연결 키는 **무료 플랜도 발급**할 수 있습니다. 다만 채팅에 노출되는 **도구가 플랜마다 다릅니다.**
> 키 발급: CrabPitch 웹앱 → **내 AI 연동** (`/ai`)

## 플랜별로 열리는 도구

| 도구 | Free | Solo 이상 |
|---|:--:|:--:|
| `crabpitch_status` | ✅ | ✅ |
| `crabpitch_press_guide` (보도자료 규범·규칙 검사) | ✅ | ✅ |
| `crabpitch_mail_setup` (발신 메일 설정 안내) | ✅ | ✅ |
| `crabpitch_match_journalists` (기자 매칭) | — | ✅ |
| `crabpitch_email_template` (피치 메일 템플릿) | — | ✅ |
| `crabpitch_classify` (회신 분류) | — | ✅ |
| `crabpitch_campaign_list` · `_create` · `_status` (캠페인 관리) | ✅ | ✅ |
| `crabpitch_campaign_match` · `_match_select` · `_drafts_generate` · `_drafts_approve` (매칭·대상 선별·초안·승인) | — | ✅ |
| `crabpitch_campaign_send` (**실제 발송**) | — | ✅ |
| `crabpitch_journalist_note` · `crabpitch_replies` (기자 메모·회신) | — | ✅ |

무료 플랜에서는 잠긴 도구가 **목록에 아예 보이지 않습니다.** 직접 호출해도 막히고,
어떤 도구가 잠겼는지는 `crabpitch_status`의 `lockedSkills`로 확인할 수 있습니다.

> **중요** — 잠긴 것은 *채팅(MCP) 창구*일 뿐입니다.
> 기자 매칭·메일 초안·회신 응대·미디어킷은 **CrabPitch 웹앱에서 무료 플랜으로도 그대로 이용**할 수 있습니다.
> 업그레이드는 "기능을 사는 것"이 아니라 "채팅에서도 쓰는 것"에 가깝습니다.

## 빠른 등록

앱에서 키를 발급하면 아래 형태 스니펫이 나옵니다.

```json
{
  "mcpServers": {
    "crabpitch": {
      "url": "https://YOUR_DEPLOYMENT.convex.site/api/mcp/cp_mcp_YOUR_KEY"
    }
  }
}
```

- **Cursor / Claude Desktop** — `mcp.json`에 붙여넣기
- **ChatGPT / Claude / Gemini** — Custom Connector / MCP 플러그인에 URL 등록

## 도구

- `crabpitch_status` — 연결·플랜 확인
- `crabpitch_match_journalists` — 매칭 (기자 코드만, 실명·이메일 없음)
- `crabpitch_email_template` — 피치 메일 템플릿
- `crabpitch_classify` — 회신 분류
- `crabpitch_press_guide` — 보도자료 규범 조회 + 초안 규칙 검사
- `crabpitch_mail_setup` — 발신 메일(SMTP) 연결 상태 + 제공자별 설정 절차

### `crabpitch_mail_setup`

| 인자 | 설명 |
|---|---|
| `email` | (선택) 발송에 쓸 주소. 주면 Gmail·네이버·다음·아웃룩·회사 메일별 절차로 좁혀 준다 |

**비밀번호를 받는 인자는 없습니다.** MCP 인자는 대화 기록에 남으므로 자격증명을 그쪽으로
흘려보내지 않습니다. 도구는 절차와 설정 화면 주소만 돌려주고, 입력은 사용자가 웹에서 합니다.
비밀번호를 대신 받아 주겠다고 제안하지 마세요.

### `crabpitch_press_guide`

| 인자 | 설명 |
|---|---|
| `section` | `structure` · `writing` · `geo` · `adlaw` · `presskit` · `all`(기본) |
| `draft` / `title` | 주면 규칙 검사 결과(`lint`)를 함께 돌려준다 |
| `boilerplate` | 미디어킷 회사 소개 원문. 주면 본문이 이 문단을 그대로 실었는지 대조 |
| `factSheet` | `[{label, value}]`. 주면 본문 수치가 이 집합의 부분집합인지 대조 |

`boilerplate`·`factSheet`는 **주지 않으면 해당 검사가 아예 돌지 않는다.** 대조할 원본이
없는데 "근거 없음"을 띄우면 전부 오탐이기 때문이다.

## 발송까지 채팅에서 — 다만 확인은 사용자가

```
crabpitch_campaign_create → _match
  → _match_select    (대상 확인 · keepOnly로 좁히기)
  → _drafts_generate
  → _campaign_status (초안을 사용자에게 보여 준다)
  → _drafts_approve  (사용자가 확인한 draftId만)
  → _campaign_send   (confirm=true)
```

**`_match_select`를 건너뛰지 마라.** `_match`는 상위 N명을 잡고 `_drafts_generate`는 그
전원에게 초안을 만든다. 특정 기자에게만 보내려면 `keepOnly`로 먼저 좁혀야 한다.

**`crabpitch_campaign_send`는 `confirm` 없이는 보내지 않는다.** 대상 수와 제외 사유만
돌려준다. 발송은 되돌릴 수 없다 — 사용자에게 누구에게 몇 통이 나가는지 보여 주고
동의를 받은 뒤에만 `confirm=true`로 다시 부른다. **에이전트가 임의로 넣지 마라.**

`crabpitch_drafts_approve`에 일괄 승인은 없다. `draftId`를 하나씩 받는다 — 승인은
사용자가 내용을 확인했다는 표시다.

발송은 사용자 본인 메일에서 나가고(SMTP 전 플랜 · Gmail 연동 Agency), 승인·수신거부·
쿨다운·표현 규정·한도 게이트는 웹앱과 **똑같은 코드**를 지나간다.

기자 실명·이메일은 어떤 응답에도 들어가지 않는다 — 초안 목록도 익명 코드로만 나간다.
자세한 보안·플랜 정책은 앱 문서 `docs/MCP-SETUP.md`(crabpitch 저장소)를 보세요.

## OpenCrab MCP

기자 온톨로지 심이 필요하면 별도로 `ocm_…` 키를 OpenCrab에서 받아 등록할 수 있습니다.
일상적인 보도자료·피치 워크플로는 **CrabPitch MCP**를 쓰세요.
