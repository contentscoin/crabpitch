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

/** 스킬별 한글 이름 + 요약 절차 — 웹 접근이 없는 AI도 이 요약만으로 진행 가능해야 한다. */
const SKILL_BRIEFS: Record<SkillId, { nameKo: string; steps: string[]; kickoff: string }> = {
  "press-release-writer": {
    nameKo: "보도자료 작성",
    steps: [
      "5W1H·핵심 수치·대표 인용문 중 빠진 항목을 한 번에 하나씩 질문해 확보한다.",
      "역피라미드 3문단 본문을 쓴다 — 첫 문단에 핵심 사실과 수치, 둘째 문단에 배경·의미, 셋째 문단에 인용문.",
      "서로 다른 앵글의 헤드라인 3안(사실형/숫자형/트렌드형)을 25자 내외로 제시한다.",
      "과장·미확인 수치는 쓰지 않고, 입력에 없는 사실을 지어내지 않는다.",
    ],
    kickoff: "어떤 소식을 알리고 싶으신가요? 아는 내용부터 편하게 말씀해 주세요.",
  },
  "media-kit-builder": {
    nameKo: "미디어킷(프레스킷) 작성",
    steps: [
      "8개 섹션을 인터뷰하듯 하나씩 채운다 — ①한 줄 소개(보일러플레이트) ②핵심 메시지 3개 ③팩트시트(수치+출처) ④창업 스토리 ⑤대표 프로필 ⑥인용문 뱅크 ⑦비주얼 자료 목록 ⑧미디어 연락처.",
      "섹션마다 진행률(예: 3/8)을 알려주고, 모르는 항목은 건너뛴 뒤 마지막에 미완성 목록을 정리한다.",
      "완성되면 전체를 하나의 문서로 묶어 제공한다.",
    ],
    kickoff: "회사(브랜드)를 한 문장으로 소개해 주시겠어요? 거기서부터 시작하겠습니다.",
  },
  "journalist-outreach": {
    nameKo: "기자 배포",
    steps: [
      "확정된 보도자료를 확인하고, 기자 후보를 매칭한다 — CrabPitch/OpenCrab MCP가 연결돼 있으면 도구로, 없으면 사용자가 붙여넣은 기자 리스트로.",
      "기자별 개인화 메일을 6블록(호칭→후킹→핵심→수치→자료→수신거부)으로 작성한다.",
      "발송 전 반드시 사용자 승인을 받고, 승인 후에는 사용자 본인 Gmail의 「언론홍보」 라벨 워크플로우로 초안을 만든다.",
    ],
    kickoff: "배포할 보도자료가 준비돼 있나요? 있다면 붙여넣어 주세요.",
  },
  "reply-handler": {
    nameKo: "기자 회신 응대",
    steps: [
      "기자 회신을 7유형(인터뷰 요청/자료 요청/확인 질문/게재 통보/보류/수신거부/컴플레인)으로 분류한다.",
      "유형별 응대 초안을 만든다 — 인터뷰는 일정 3안 제시, 수신거부는 변명 없이 즉시 수용하고 명단 제외를 안내.",
      "수신거부 기자는 이후 어떤 발송 대상에도 넣지 않는다.",
    ],
    kickoff: "받으신 기자 회신을 붙여넣어 주세요. 유형을 분류하고 답장 초안을 만들어 드리겠습니다.",
  },
};

export function buildSkillBootstrapPrompt(ctx: LaunchContext): string {
  const tags = (ctx.topicTags ?? []).filter(Boolean).join(", ") || "IT·스타트업";
  const brief = SKILL_BRIEFS[ctx.skill];
  const contextLines = [
    ctx.companyName ? `- 회사/브랜드: ${ctx.companyName}` : null,
    ctx.who ? `- 주체: ${ctx.who}` : null,
    ctx.headline ? `- 알리려는 소식: ${ctx.headline}` : null,
    `- 주제 분야: ${tags}`,
    ctx.bodyHint ? `- 지금까지 쓴 초안/메모:\n${ctx.bodyHint}` : null,
    ctx.extraNotes ? `- 참고: ${ctx.extraNotes}` : null,
  ].filter((l) => l != null);

  const lines = [
    `당신은 크랩피치(CrabPitch)의 언론 홍보 어시스턴트입니다. 지금부터 「${brief.nameKo}」 작업을 아래 절차대로 도와주세요.`,
    "",
    "진행 절차:",
    ...brief.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `(웹을 읽을 수 있다면 상세 절차 원문을 참고해도 됩니다: ${skillRawUrl(ctx.skill)})`,
    "",
    "반드시 지킬 규칙:",
    "- 기자 실명·이메일·연락처는 출력하지 않는다. 기자를 지칭할 땐 「기자 #XXXX」 익명 코드만 쓴다.",
    "- 어떤 메일도 스스로 발송하지 않는다. 발송은 내가 명시적으로 승인한 뒤, 내 Gmail 「언론홍보」 라벨로만 진행한다.",
    "- 기자에게 보내는 메일에는 항상 수신거부 안내 문구를 포함한다.",
    "- 한국어로 간결하고 담백하게 쓴다. 과장·확인 안 된 수치는 금지.",
    "",
    "제 상황:",
    ...contextLines,
    "",
    `준비되셨으면 이렇게 시작해 주세요: "${brief.kickoff}"`,
  ];
  return lines.join("\n");
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
