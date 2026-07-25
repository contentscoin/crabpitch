/** 대시보드·MCP HTTP가 공유하는 도구/플랫폼 안내 카탈로그 */

export type McpToolId =
  | "crabpitch_status"
  | "crabpitch_match_journalists"
  | "crabpitch_email_template"
  | "crabpitch_classify";

export interface McpToolInfo {
  name: McpToolId;
  title: string;
  description: string;
  exampleArgs: string;
  examplePrompt: string;
}

export interface McpPlatformGuide {
  id: "cursor" | "claude" | "chatgpt" | "gemini";
  label: string;
  short: string;
  steps: string[];
}

export const MCP_TOOLS: McpToolInfo[] = [
  {
    name: "crabpitch_status",
    title: "연결·플랜 확인",
    description:
      "MCP 연결 상태, 현재 요금제, 사용 가능 스킬 목록을 확인합니다. 등록 직후 스모크 테스트용.",
    exampleArgs: "{}",
    examplePrompt: "crabpitch_status로 내 플랜과 MCP 연결 상태를 확인해줘.",
  },
  {
    name: "crabpitch_match_journalists",
    title: "기자 매칭",
    description:
      "주제·키워드로 기자 후보를 매칭합니다. 응답은 기자 코드·매체·beat·점수만 포함하며 실명·이메일은 절대 반환하지 않습니다.",
    exampleArgs: '{"query":"AI SaaS 투자유치","limit":10}',
    examplePrompt:
      "보도자료 주제가 AI SaaS 시리즈A야. crabpitch_match_journalists로 기자 10명 매칭해줘. 실명 없이 코드로만 보여줘.",
  },
  {
    name: "crabpitch_email_template",
    title: "피치 메일 템플릿",
    description:
      "보도자료 앵글·초안을 바탕으로 이메일 제목/본문 템플릿을 만듭니다. 실제 발송은 CrabPitch 웹앱 Gmail 연동에서만 합니다.",
    exampleArgs:
      '{"angle":"시리즈A 50억 유치","releaseDraft":"…","outlet":"매체","beat":"투자"}',
    examplePrompt:
      "앵글이 '시리즈A 50억 유치'야. crabpitch_email_template로 피치 메일 초안을 만들어줘. 인사말은 기자님으로.",
  },
  {
    name: "crabpitch_classify",
    title: "회신 분류",
    description:
      "기자 회신 텍스트를 인터뷰·자료요청·질문·게재·보류·수신거부·컴플레인 등 7유형으로 분류합니다.",
    exampleArgs: '{"text":"인터뷰 가능할까요? 다음 주 일정 알려주세요."}',
    examplePrompt:
      "기자 회신: '인터뷰 가능할까요?' — crabpitch_classify로 유형 분류하고 응대 톤을 알려줘.",
  },
];

export const MCP_PLATFORMS: McpPlatformGuide[] = [
  {
    id: "cursor",
    label: "Cursor",
    short: "mcp.json에 URL 스니펫 붙여넣기",
    steps: [
      "위에서 MCP 키를 발급하고 「JSON 복사」를 누릅니다.",
      "Cursor Settings → MCP → 설정 파일(mcp.json)을 엽니다.",
      "복사한 crabpitch 서버 블록을 붙여넣고 저장합니다.",
      "채팅에서 crabpitch_status를 호출해 연결을 확인합니다.",
    ],
  },
  {
    id: "claude",
    label: "Claude Desktop / Cowork",
    short: "커스텀 커넥터 또는 mcp.json",
    steps: [
      "키 발급 후 MCP URL(키 포함) 또는 JSON 스니펫을 복사합니다.",
      "Claude Desktop: 설정 → Developer → Edit Config (mcp.json)에 붙여넣습니다.",
      "또는 Cowork/커스텀 커넥터 UI에 MCP URL을 등록합니다.",
      "공개 스킬 팩(journalist-outreach 등)과 함께 쓰면 매칭→메일 초안까지 이어집니다.",
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    short: "Custom GPT / Connector에 MCP URL",
    steps: [
      "키 발급 후 MCP URL을 복사합니다.",
      "ChatGPT → Custom GPT 또는 Connectors/MCP 설정에서 원격 MCP 서버로 등록합니다.",
      "Instructions에 crabpitch-skill 스킬 본문을 붙여 MCP 도구 사용을 명시합니다.",
      "실발송·실명은 ChatGPT가 아니라 CrabPitch 웹앱에서만 진행합니다.",
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    short: "Gem / 확장·커넥터에 MCP URL",
    steps: [
      "키 발급 후 MCP URL을 복사합니다.",
      "Gemini Gem 또는 지원되는 MCP/커넥터 설정에 URL을 등록합니다.",
      "동일 스킬 마크다운을 시스템 지침으로 넣고 도구 호출을 허용합니다.",
      "Gmail 발송은 Google Workspace/CrabPitch BYO Gmail로만 합니다.",
    ],
  },
];

export const MCP_PRIVACY_RULES = [
  "기자 실명·이메일·연락처는 MCP 응답에 포함되지 않습니다. 표시는 기자 #XXXX 코드만.",
  "실제 이메일·실명은 CrabPitch 웹앱에서 Gmail 발송 시에만 주입됩니다.",
  "발송은 사용자 명시 승인 후에만. MCP는 매칭·템플릿·분류만 제공합니다.",
  "유료 플랜(Solo/Growth/Agency) 전용. Free는 키 발급·호출이 거부됩니다.",
  "키가 유출되면 즉시 폐기 후 재발급하세요. 채팅·이슈·커밋에 붙이지 마세요.",
];

export const MCP_VS_OPENCRAB = [
  {
    label: "CrabPitch MCP",
    key: "cp_mcp_…",
    use: "피치 워크플로(매칭·메일 템플릿·회신 분류)",
    plan: "유료 필수",
  },
  {
    label: "OpenCrab MCP",
    key: "ocm_…",
    use: "기자 온톨로지 심(서버 동기화용)",
    plan: "OpenCrab 계정",
  },
];

/** 공개 스킬 팩 · MCP 문서 (랜딩/대시보드 공용) */
export const CRABPITCH_SKILL_REPO_URL =
  "https://github.com/contentscoin/crabpitch-skill";
export const CRABPITCH_MCP_DOCS_URL =
  "https://github.com/contentscoin/crabpitch/blob/main/docs/MCP-SETUP.md";
