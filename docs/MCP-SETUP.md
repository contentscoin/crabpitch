# CrabPitch MCP 설정 (유료)

CrabPitch는 **유저별 MCP 키**(`cp_mcp_…`)를 발급합니다.
Claude Desktop · Cursor · ChatGPT 커스텀 커넥터 · Gemini 등에서 플러그인으로 등록해
기자 매칭·이메일 템플릿·회신 분류 도구를 호출할 수 있습니다.

> **유료 전용:** Solo / Growth / Agency. Free 플랜은 키 발급·호출이 거부됩니다.

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

## 3. 제공 도구

| 도구 | 설명 |
|---|---|
| `crabpitch_status` | 연결·플랜 상태 |
| `crabpitch_match_journalists` | 주제 태그 매칭 (응답: `기자 #XXXX` 코드만, 실명·이메일 없음) |
| `crabpitch_email_template` | 피치 메일 제목/본문 템플릿 |
| `crabpitch_classify` | 회신 텍스트 7유형 분류 |

실제 Gmail 발송·실명 주입은 **CrabPitch 웹앱**에서만 합니다.

## 4. OpenCrab MCP와의 차이

| | CrabPitch MCP | OpenCrab MCP |
|---|---|---|
| 키 | `cp_mcp_…` (앱에서 발급) | `ocm_…` (OpenCrab) |
| 용도 | 피치 워크플로 도구 | 기자 온톨로지 심 |
| 플랜 | 유료 필수 | OpenCrab 계정 |

둘 다 등록해도 됩니다. 스킬 팩과 함께 쓰는 기본 경로는 **CrabPitch MCP**입니다.

## 5. 보안

- 키를 채팅·이슈·커밋에 붙이지 마세요.
- 유출 시 앱에서 즉시 **폐기** 후 재발급하세요.
- Free로 다운그레이드하면 기존 키 호출이 실패합니다.
