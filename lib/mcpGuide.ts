/** 사용자용 AI 연결 안내 (대시보드·랜딩 공용) */

export type McpToolId =
  | "crabpitch_status"
  | "crabpitch_match_journalists"
  | "crabpitch_email_template"
  | "crabpitch_classify";

export interface McpToolInfo {
  name: McpToolId;
  title: string;
  description: string;
  /** 채팅에 그대로 붙여넣을 수 있는 말 */
  examplePrompt: string;
}

export interface McpPlatformGuide {
  id: "cursor" | "claude" | "chatgpt" | "gemini";
  label: string;
  short: string;
  steps: string[];
  /** 키 발급 후 무엇을 복사하면 되는지 */
  copyHint: "url" | "json";
}

export const MCP_TOOLS: McpToolInfo[] = [
  {
    name: "crabpitch_status",
    title: "연결 확인",
    description: "내 AI와 크랩피치가 잘 연결됐는지 확인합니다.",
    examplePrompt: "크랩피치 연결 상태와 내 플랜을 확인해줘.",
  },
  {
    name: "crabpitch_match_journalists",
    title: "기자 찾기",
    description: "주제·키워드에 맞는 기자 후보를 골라 줍니다. (실명·이메일은 안 나옵니다)",
    examplePrompt:
      "주제가 AI SaaS 시리즈A야. 크랩피치로 기자 10명 찾아줘. 코드로만 보여줘.",
  },
  {
    name: "crabpitch_email_template",
    title: "메일 초안",
    description: "피치 메일 제목·본문 초안을 만듭니다. 실제 발송은 웹앱에서만 합니다.",
    examplePrompt:
      "앵글이 '시리즈A 50억 유치'야. 크랩피치로 피치 메일 초안을 만들어줘.",
  },
  {
    name: "crabpitch_classify",
    title: "회신 분류",
    description: "기자 회신이 인터뷰·자료요청·게재 등 어떤 유형인지 분류합니다.",
    examplePrompt:
      "기자 회신: '인터뷰 가능할까요?' — 크랩피치로 유형 분류하고 응대 톤을 알려줘.",
  },
];

export const MCP_PLATFORMS: McpPlatformGuide[] = [
  {
    id: "claude",
    label: "Claude",
    short: "연결 주소만 붙이면 됩니다",
    copyHint: "url",
    steps: [
      "아래에서 연결 키를 만들고 「연결 주소 복사」를 누릅니다.",
      "Claude 설정에서 커넥터(또는 MCP) 추가를 엽니다.",
      "복사한 주소를 붙여넣고 저장합니다.",
      "채팅에서 「크랩피치 연결 확인해줘」라고 말해 보세요.",
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    short: "커스텀 GPT·커넥터에 주소 등록",
    copyHint: "url",
    steps: [
      "아래에서 연결 키를 만들고 「연결 주소 복사」를 누릅니다.",
      "ChatGPT에서 커스텀 GPT 또는 커넥터 설정으로 갑니다.",
      "원격 서버(MCP)에 주소를 등록합니다.",
      "「기자 찾아줘」처럼 말해 보며 동작을 확인합니다.",
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    short: "Gem·커넥터에 주소 등록",
    copyHint: "url",
    steps: [
      "아래에서 연결 키를 만들고 「연결 주소 복사」를 누릅니다.",
      "Gemini Gem 또는 커넥터 설정에 주소를 넣습니다.",
      "채팅에서 기자 찾기·메일 초안을 요청해 봅니다.",
      "실제 발송은 크랩피치 웹앱의 Gmail 연동에서만 하세요.",
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    short: "설정 파일에 한 블록 붙여넣기",
    copyHint: "json",
    steps: [
      "아래에서 연결 키를 만들고 「설정 복사」를 누릅니다.",
      "Cursor 설정 → MCP → 설정 파일을 엽니다.",
      "복사한 내용을 붙여넣고 저장합니다.",
      "채팅에서 「크랩피치 연결 확인해줘」라고 말해 보세요.",
    ],
  },
];

export const MCP_PRIVACY_RULES = [
  "기자 실명·이메일은 AI 응답에 나오지 않습니다. 기자 코드만 표시됩니다.",
  "실제 메일 발송은 크랩피치 웹앱 + 내 Gmail에서만 합니다.",
  "연결 키는 남에게 공유하지 마세요. 유출되면 바로 폐기 후 다시 만드세요.",
];

/** 공개 스킬 팩 · 상세 문서 (필요할 때만) */
export const CRABPITCH_SKILL_REPO_URL =
  "https://github.com/contentscoin/crabpitch-skill";
export const CRABPITCH_MCP_DOCS_URL =
  "https://github.com/contentscoin/crabpitch/blob/main/docs/MCP-SETUP.md";
