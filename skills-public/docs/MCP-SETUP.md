# CrabPitch MCP 설정 (유료)

크랩피치 스킬과 함께 **유저별 MCP 키**(`cp_mcp_…`)를 Claude · ChatGPT · Gemini · Cursor에 등록합니다.

> MCP는 CrabPitch **유료 플랜(Solo/Growth/Agency)** 전용입니다.
> 키 발급: CrabPitch 웹앱 → **내 AI 연동** (`/ai`)

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

발송은 스킬 지침대로 **사용자 Gmail(BYO)** + CrabPitch 웹앱에서만 합니다.
자세한 보안·플랜 정책은 앱 문서 `docs/MCP-SETUP.md`(crabpitch 저장소)를 보세요.

## OpenCrab MCP

기자 온톨로지 심이 필요하면 별도로 `ocm_…` 키를 OpenCrab에서 받아 등록할 수 있습니다.
일상적인 보도자료·피치 워크플로는 **CrabPitch MCP**를 쓰세요.
