/**
 * BYO AI — 사용자 본인 Claude / ChatGPT / Gemini 에서
 * 크랩피치 스킬·MCP를 쓰는 런치 헬퍼.
 *
 * 제약(의도적):
 * - PC/모바일 앱에 저장된 OAuth 토큰을 웹이 스캔·탈취하는 것은 불가능하며 구현하지 않음.
 * - Claude 구독 OAuth를 서드파티 SaaS가 대행 호출하는 것도 Anthropic 약관상 불가.
 * - 대신 공식 앱/웹으로 원클릭 실행 + 스킬 부트스트랩 + MCP 설정 제공.
 */

export type AiProviderId = "claude" | "chatgpt" | "gemini";

export type SkillId =
  | "press-release-writer"
  | "media-kit-builder"
  | "journalist-outreach"
  | "reply-handler";

export interface AiProviderMeta {
  id: AiProviderId;
  label: string;
  short: string;
  webNewChat: string;
  /** 모바일/데스크톱 앱 스킴 (지원 기기에서만 동작, 실패 시 web으로 폴백) */
  appSchemes: string[];
  skillInstallHint: string;
}

export const AI_PROVIDERS: Record<AiProviderId, AiProviderMeta> = {
  claude: {
    id: "claude",
    label: "Claude",
    short: "Anthropic Claude",
    webNewChat: "https://claude.ai/new",
    appSchemes: ["claude://new", "claude://"],
    skillInstallHint:
      "Claude 프로젝트/스킬에 crabpitch-skill 의 SKILL.md를 추가하거나, 아래 프롬프트를 새 채팅에 붙여넣으세요.",
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT",
    short: "OpenAI ChatGPT",
    webNewChat: "https://chatgpt.com/",
    appSchemes: ["chatgpt://", "openai://"],
    skillInstallHint:
      "커스텀 GPT Instructions 또는 새 채팅에 아래 프롬프트를 붙여넣으세요. Codex면 시스템 프롬프트로 사용합니다.",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    short: "Google Gemini",
    webNewChat: "https://gemini.google.com/app",
    appSchemes: ["googleapp://", "gemini://"],
    skillInstallHint:
      "Gem 또는 새 채팅에 아래 프롬프트를 붙여넣으세요. Google 계정으로 로그인한 Gemini를 그대로 씁니다.",
  },
};

export const SKILL_PACK_URL =
  "https://github.com/contentscoin/crabpitch-skill";

export const SKILL_RAW_BASE =
  "https://raw.githubusercontent.com/contentscoin/crabpitch-skill/main/skills";

export function skillRawUrl(skill: SkillId): string {
  return `${SKILL_RAW_BASE}/${skill}/SKILL.md`;
}

export interface LaunchContext {
  skill: SkillId;
  companyName?: string;
  who?: string;
  headline?: string;
  bodyHint?: string;
  topicTags?: string[];
  extraNotes?: string;
}

export function buildSkillBootstrapPrompt(ctx: LaunchContext): string {
  const tags = (ctx.topicTags ?? []).filter(Boolean).join(", ") || "IT·스타트업";
  const lines = [
    `당신은 크랩피치(CrabPitch) 스킬 \`${ctx.skill}\` 를 실행 중입니다.`,
    `스킬 원문: ${skillRawUrl(ctx.skill)}`,
    `공개 스킬 팩: ${SKILL_PACK_URL}`,
    "",
    "규칙:",
    "- 기자 실명·이메일은 출력에 넣지 말고 `기자 #XXXX` 형태로 마스킹한다.",
    "- 발송은 사용자가 명시 승인한 뒤에만, 본인 Gmail `언론홍보` 라벨 워크플로우를 따른다.",
    "- 한국어로 간결·담백하게 작성한다.",
    "",
    "사용자 컨텍스트:",
    ctx.companyName ? `- 회사/브랜드: ${ctx.companyName}` : null,
    ctx.who ? `- Who: ${ctx.who}` : null,
    ctx.headline ? `- 헤드라인/소식: ${ctx.headline}` : null,
    `- 주제 태그: ${tags}`,
    ctx.bodyHint ? `- 초안/힌트:\n${ctx.bodyHint}` : null,
    ctx.extraNotes ? `- 메모: ${ctx.extraNotes}` : null,
    "",
    ctx.skill === "media-kit-builder"
      ? "요청: 인터뷰형 미디어킷(프레스킷) 초안을 섹션별로 작성해 주세요."
      : ctx.skill === "press-release-writer"
        ? "요청: 5W1H·역피라미드 보도자료와 헤드라인 3안을 작성해 주세요."
        : `요청: \`${ctx.skill}\` 스킬 절차를 시작해 주세요.`,
  ];
  return lines.filter((l) => l != null).join("\n");
}

/** 브라우저에서 앱 스킴 시도 후 웹으로 폴백할 때 쓰는 URL 목록 */
export function resolveLaunchUrls(provider: AiProviderId): {
  primary: string;
  fallbacks: string[];
} {
  const meta = AI_PROVIDERS[provider];
  return {
    primary: meta.webNewChat,
    fallbacks: [...meta.appSchemes, meta.webNewChat],
  };
}

/** Cursor / Claude Desktop 용 MCP 스니펫 (OpenCrab). 키는 사용자가 채움. */
export function buildOpenCrabMcpSnippet(apiKeyPlaceholder = "ocm_YOUR_KEY"): string {
  return JSON.stringify(
    {
      mcpServers: {
        opencrab: {
          url: `https://opencrab.sh/api/mcp/${apiKeyPlaceholder}`,
        },
      },
    },
    null,
    2,
  );
}

export function isAiProviderId(v: string): v is AiProviderId {
  return v === "claude" || v === "chatgpt" || v === "gemini";
}
