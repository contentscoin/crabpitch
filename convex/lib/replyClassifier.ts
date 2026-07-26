/**
 * 기자 회신 7유형 분류 + 유형별 답장 초안 — reply-handler 스킬을 코드로 흡수.
 */

export type ReplyType =
  | "interview"
  | "materials"
  | "question"
  | "published"
  | "hold"
  | "unsubscribe"
  | "complaint";

interface Rule {
  type: ReplyType;
  label: string;
  priority: "🔴 즉시" | "🟠 당일" | "🟢" | "⚫ 즉시";
  signals: string[];
}

// 우선순위 높은(명확한) 신호부터 검사 — 수신거부/게재/인터뷰가 먼저.
const RULES: Rule[] = [
  {
    type: "unsubscribe",
    label: "수신거부",
    priority: "⚫ 즉시",
    signals: ["수신거부", "수신 거부", "그만", "빼주세요", "빼 주세요", "unsubscribe", "메일 그만"],
  },
  {
    type: "published",
    label: "게재 통보",
    priority: "🟢",
    signals: ["기사 나갔", "기사가 나갔", "게재", "실렸", "보도했", "링크입니다", "기사 링크"],
  },
  {
    type: "interview",
    label: "인터뷰 요청",
    priority: "🔴 즉시",
    signals: ["인터뷰", "통화 가능", "통화가능", "일정", "미팅", "취재 요청", "만나"],
  },
  {
    type: "materials",
    label: "자료 요청",
    priority: "🔴 즉시",
    signals: ["고화질", "이미지", "추가 자료", "자료 부탁", "매출 자료", "사진", "보도자료 원문"],
  },
  {
    type: "complaint",
    label: "부정/컴플레인",
    priority: "🔴 즉시",
    signals: ["사실과 다릅", "사실이 아닙", "항의", "정정", "틀렸", "오류", "과장"],
  },
  {
    type: "question",
    label: "확인 질문",
    priority: "🟠 당일",
    signals: ["맞나요", "맞습니까", "근거", "출처", "수치", "확인 부탁", "사실인가"],
  },
  {
    type: "hold",
    label: "보류/거절",
    priority: "🟢",
    signals: ["이번엔 어렵", "이번에는 어렵", "다음 기회", "다음에", "어렵겠", "보류", "관심 없"],
  },
];

export function classifyReply(rawBody: string): { type: ReplyType; label: string; priority: string } {
  const text = rawBody.toLowerCase().replace(/\s+/g, " ");
  for (const rule of RULES) {
    if (rule.signals.some((s) => text.includes(s.toLowerCase()))) {
      return { type: rule.type, label: rule.label, priority: rule.priority };
    }
  }
  // 기본값: 확인 질문(당일 응대)로 안전하게 분류
  return { type: "question", label: "확인 질문", priority: "🟠 당일" };
}

export interface ReplyDraftContext {
  // ⚠️ 실명 미사용. 실제 회신 발송 시점(Gmail)에서만 수신자 실명을 주입한다.
  slots?: [string, string, string]; // 인터뷰 일정 3안
}

/* ── 유형별 응대 템플릿 변형 ──────────────────────────────────
 * 같은 유형이라도 상황·톤이 달라 변형을 고를 수 있게 한다.
 * 수신거부는 컴플라이언스상 단일 응답(즉시 수용)만 둔다.
 */

export interface ReplyTemplateVariant {
  id: string;
  label: string;
  description: string;
}

type VariantBuilder = (ctx: ReplyDraftContext) => string;

const NAME = "기자님";

function slots3(ctx: ReplyDraftContext): [string, string, string] {
  return ctx.slots ?? ["(일정1)", "(일정2)", "(일정3)"];
}

const VARIANT_BUILDERS: Record<ReplyType, Array<ReplyTemplateVariant & { build: VariantBuilder }>> = {
  interview: [
    {
      id: "default",
      label: "일정 3안 제시",
      description: "기본형 — 가능한 시간 3개를 제시하고 방식은 열어둡니다.",
      build: (ctx) => {
        const s = slots3(ctx);
        return `${NAME}, 관심 가져주셔서 감사합니다. 대표 인터뷰 가능합니다.\n아래 중 편하신 시간 알려주시면 맞추겠습니다.\n· ${s[0]} · ${s[1]} · ${s[2]}\n대면/화상/전화 모두 가능하며, 필요하신 자료 미리 보내드리겠습니다.`;
      },
    },
    {
      id: "proactive",
      label: "적극형 (자료 선제공)",
      description: "일정 제시 + 사전 자료 패키지·예상 질문지를 먼저 제안합니다.",
      build: (ctx) => {
        const s = slots3(ctx);
        return `${NAME}, 관심 가져주셔서 감사합니다. 대표 인터뷰 바로 잡겠습니다.\n· 가능 시간: ${s[0]} · ${s[1]} · ${s[2]} (이 외 시간도 조율 가능합니다)\n· 사전 자료: 회사 소개·핵심 수치·고화질 이미지를 미리 보내드리겠습니다.\n질문지를 먼저 주시면 답변을 준비해 인터뷰 밀도를 높이겠습니다.`;
      },
    },
    {
      id: "written",
      label: "서면 인터뷰 제안",
      description: "일정 조율이 어려울 때 — 서면 답변 옵션을 함께 제안합니다.",
      build: (ctx) => {
        const s = slots3(ctx);
        return `${NAME}, 관심 가져주셔서 감사합니다.\n대면/화상이 편하시면 ${s[0]} · ${s[1]} · ${s[2]} 중 알려주시고,\n일정이 빠듯하시면 서면 인터뷰도 가능합니다 — 질문 주시면 24시간 내 답변드리겠습니다.`;
      },
    },
  ],
  materials: [
    {
      id: "default",
      label: "즉시 전달",
      description: "기본형 — 요청 자료를 바로 전달합니다.",
      build: () =>
        `${NAME}, 요청하신 자료 전달드립니다.\n· (요청 자료1): (링크)\n· (요청 자료2): (링크)\n추가로 필요하신 것 있으면 언제든 말씀 주세요.`,
    },
    {
      id: "detailed",
      label: "자료 목록 정리형",
      description: "자료가 여러 개일 때 — 이름·형식·용도를 표처럼 정리합니다.",
      build: () =>
        `${NAME}, 요청하신 자료를 정리해 보내드립니다.\n· 보도자료 원문(docx): (링크)\n· 고화질 이미지 3종(zip): (링크) — 캡션 포함\n· 핵심 수치 팩트시트(pdf): (링크) — 출처 표기\n형식 변환이나 추가 컷이 필요하시면 바로 준비하겠습니다.`,
    },
    {
      id: "upsell",
      label: "자료 + 인터뷰 제안",
      description: "자료 전달과 함께 대표 코멘트·인터뷰를 가볍게 제안합니다.",
      build: () =>
        `${NAME}, 요청하신 자료 전달드립니다.\n· (요청 자료): (링크)\n기사에 대표 코멘트가 필요하시면 서면·전화 모두 빠르게 지원 가능합니다. 편하게 말씀 주세요.`,
    },
  ],
  question: [
    {
      id: "default",
      label: "간결 답변",
      description: "기본형 — 질문에 정확한 답과 근거 한 줄.",
      build: () =>
        `${NAME}, 문의 주신 내용 확인해 답변드립니다.\n(질문) → (정확한 답). (근거: 링크/출처)`,
    },
    {
      id: "evidence",
      label: "근거 상세형",
      description: "수치 검증 질문일 때 — 출처·산출 방식까지 붙입니다.",
      build: () =>
        `${NAME}, 문의 주신 내용 확인해 답변드립니다.\n· 답변: (정확한 답)\n· 산출 방식: (기간·모수·기준)\n· 출처: (링크/문서)\n원자료가 필요하시면 원본 데이터도 보내드리겠습니다.`,
    },
  ],
  published: [
    {
      id: "default",
      label: "감사 인사",
      description: "기본형 — 게재 감사와 관계 유지.",
      build: () =>
        `${NAME}, 좋은 기사로 다뤄주셔서 진심으로 감사합니다.\n덕분에 좋은 반응 있었습니다. 앞으로도 의미 있는 소식 있을 때 먼저 전해드리겠습니다.`,
    },
    {
      id: "followup",
      label: "감사 + 후속 예고",
      description: "감사 인사에 다음 소식 예고와 채널 공유 안내를 더합니다.",
      build: () =>
        `${NAME}, 좋은 기사로 다뤄주셔서 진심으로 감사합니다.\n기사는 저희 채널에도 출처와 함께 소개하겠습니다.\n다음 분기 (예: 신제품/실적) 소식이 준비되는 대로 기자님께 가장 먼저 전해드리겠습니다.`,
    },
  ],
  hold: [
    {
      id: "default",
      label: "깔끔한 수용",
      description: "기본형 — 부담 없이 다음을 기약합니다.",
      build: () =>
        `${NAME}, 검토해 주셔서 감사합니다. 다음에 더 의미 있는 소식으로 다시 찾아뵙겠습니다.`,
    },
    {
      id: "keepwarm",
      label: "관계 유지형",
      description: "미디어킷을 남기고, 다음 소식 때 다시 연락드려도 될지 여쭙니다.",
      build: () =>
        `${NAME}, 검토해 주셔서 감사합니다. 이번엔 시의가 맞지 않았던 것 같습니다.\n참고용 미디어킷만 남겨두겠습니다: (링크)\n${NAME} 출입 분야에 맞는 소식이 있을 때 가끔 전해드려도 괜찮을까요?`,
    },
  ],
  unsubscribe: [
    {
      id: "default",
      label: "즉시 수용",
      description: "컴플라이언스 — 변명·설득 없이 즉시 수용하고 종료. (단일 템플릿)",
      build: () =>
        `${NAME}, 알겠습니다. 명단에서 즉시 제외했습니다. 좋은 하루 보내세요.`,
    },
  ],
  complaint: [
    {
      id: "default",
      label: "정정 안내",
      description: "기본형 — 확인된 사실관계와 정정 내용을 바로 안내합니다.",
      build: () =>
        `${NAME}, 지적 감사합니다. 확인 결과 (사실관계).\n(정정 내용). 혼선 드려 죄송하며, 정확한 자료 다시 보내드리겠습니다.`,
    },
    {
      id: "investigate",
      label: "확인 후 회신형",
      description: "즉답이 어려울 때 — 확인 절차와 회신 시한을 먼저 약속합니다.",
      build: () =>
        `${NAME}, 지적 주셔서 감사합니다. 가볍게 넘기지 않겠습니다.\n지금 바로 사실관계를 확인해 (오늘 중/24시간 내) 정확한 내용으로 다시 회신드리겠습니다.\n그때까지 해당 내용 인용은 보류 부탁드립니다.`,
    },
  ],
};

/** UI 노출용 변형 목록 (build 함수 제외). */
export const REPLY_TEMPLATE_VARIANTS: Record<ReplyType, ReplyTemplateVariant[]> =
  Object.fromEntries(
    (Object.keys(VARIANT_BUILDERS) as ReplyType[]).map((t) => [
      t,
      VARIANT_BUILDERS[t].map(({ id, label, description }) => ({ id, label, description })),
    ]),
  ) as Record<ReplyType, ReplyTemplateVariant[]>;

/** 변형 지정 초안 생성. 모르는 variantId는 default로 폴백. */
export function buildReplyDraftVariant(
  type: ReplyType,
  variantId: string,
  ctx: ReplyDraftContext = {},
): string {
  const variants = VARIANT_BUILDERS[type];
  const v = variants.find((x) => x.id === variantId) ?? variants[0]!;
  return v.build(ctx);
}

export function buildReplyDraft(type: ReplyType, ctx: ReplyDraftContext = {}): string {
  return buildReplyDraftVariant(type, "default", ctx);
}
