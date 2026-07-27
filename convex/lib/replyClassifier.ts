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
    signals: [
      "수신거부", "수신 거부", "그만", "빼주세요", "빼 주세요", "unsubscribe", "메일 그만",
      "발송 중지", "메일링 제외", "더 이상 보내지", "구독 해지", "opt out", "opt-out",
    ],
  },
  {
    type: "published",
    label: "게재 통보",
    priority: "🟢",
    signals: [
      "기사 나갔", "기사가 나갔", "게재", "실렸", "보도했", "링크입니다", "기사 링크",
      "송고", "지면", "온라인에 올라", "기사화했", "다뤘습니다",
    ],
  },
  {
    type: "interview",
    label: "인터뷰 요청",
    priority: "🔴 즉시",
    signals: [
      "인터뷰", "통화 가능", "통화가능", "일정", "미팅", "취재 요청", "만나",
      "취재하고", "방문", "일정 조율", "시간 되시", "코멘트 받고",
    ],
  },
  {
    type: "materials",
    label: "자료 요청",
    priority: "🔴 즉시",
    signals: [
      "고화질", "이미지", "추가 자료", "자료 부탁", "매출 자료", "사진", "보도자료 원문",
      "프레스킷", "로고", "raw", "원본 파일", "b-roll", "영상 자료", "팩트시트",
    ],
  },
  {
    type: "complaint",
    label: "부정/컴플레인",
    priority: "🔴 즉시",
    signals: [
      "사실과 다릅", "사실이 아닙", "항의", "정정", "틀렸", "오류", "과장",
      "허위", "왜곡", "부풀", "근거 없", "문제가 있", "유감",
    ],
  },
  {
    type: "question",
    label: "확인 질문",
    priority: "🟠 당일",
    signals: [
      "맞나요", "맞습니까", "근거", "출처", "수치", "확인 부탁", "사실인가",
      "어떻게 산출", "기준이", "why", "이유가", "계획인가", "검증",
    ],
  },
  {
    type: "hold",
    label: "보류/거절",
    priority: "🟢",
    signals: [
      "이번엔 어렵", "이번에는 어렵", "다음 기회", "다음에", "어렵겠", "보류", "관심 없",
      "적합하지 않", "지면이 없", "우선순위", "일정상", "패스",
    ],
  },
];

/* ── question 하위 5분류 ─────────────────────────────────────
 * "확인 질문"은 실제로는 성격이 아주 다른 다섯 가지가 섞여 있고, 각각 답변 전략이 다르다.
 * 특히 negative(부정적 맥락)는 complaint 직전 단계라 담당자 확인이 필요하다.
 */

export type QuestionSubtype = "numbers" | "competitor" | "intent" | "roadmap" | "negative";

const QUESTION_SUBTYPE_SIGNALS: Array<{ subtype: QuestionSubtype; label: string; signals: string[] }> = [
  { subtype: "negative", label: "부정적 맥락", signals: ["논란", "우려", "리스크", "부작용", "비판", "소송", "적자", "문제 제기"] },
  { subtype: "competitor", label: "경쟁사 비교", signals: ["경쟁사", "타사", "대비", "차별", "비교", "다른 업체", "기존 서비스"] },
  { subtype: "numbers", label: "수치 검증", signals: ["산출", "기준", "모수", "출처", "검증", "수치", "몇 %", "집계"] },
  { subtype: "roadmap", label: "향후 계획", signals: ["계획", "로드맵", "출시", "언제", "다음 단계", "확장"] },
  { subtype: "intent", label: "전략 의도", signals: ["왜", "이유", "배경", "의도", "결정", "노린"] },
];

export function classifyQuestionSubtype(rawBody: string): QuestionSubtype | undefined {
  const text = rawBody.toLowerCase().replace(/\s+/g, " ");
  for (const entry of QUESTION_SUBTYPE_SIGNALS) {
    if (entry.signals.some((s) => text.includes(s.toLowerCase()))) return entry.subtype;
  }
  return undefined;
}

export interface ClassifyResult {
  type: ReplyType;
  label: string;
  priority: string;
  /** 실제로 걸린 신호어 — 왜 이렇게 분류됐는지 사용자가 확인할 수 있게 */
  matched?: string;
  questionSubtype?: QuestionSubtype;
  /** 담당자 직접 확인이 필요한 회신인가 */
  needsEscalation?: boolean;
}

export function classifyReply(rawBody: string): ClassifyResult {
  const text = rawBody.toLowerCase().replace(/\s+/g, " ");
  for (const rule of RULES) {
    const matched = rule.signals.find((s) => text.includes(s.toLowerCase()));
    if (!matched) continue;
    const base: ClassifyResult = {
      type: rule.type,
      label: rule.label,
      priority: rule.priority,
      matched,
    };
    if (rule.type === "complaint") return { ...base, needsEscalation: true };
    if (rule.type === "question") {
      const subtype = classifyQuestionSubtype(rawBody);
      return {
        ...base,
        ...(subtype ? { questionSubtype: subtype } : {}),
        // 부정적 맥락 질문은 컴플레인 직전 단계 — 자동 답변으로 넘기지 않는다.
        ...(subtype === "negative" ? { needsEscalation: true } : {}),
      };
    }
    return base;
  }
  // 기본값: 확인 질문(당일 응대)로 안전하게 분류 — 기존 동작 유지
  const subtype = classifyQuestionSubtype(rawBody);
  return {
    type: "question",
    label: "확인 질문",
    priority: "🟠 당일",
    ...(subtype ? { questionSubtype: subtype } : {}),
    ...(subtype === "negative" ? { needsEscalation: true } : {}),
  };
}

export interface ReplyDraftContext {
  // ⚠️ 실명 미사용. 실제 회신 발송 시점(Gmail)에서만 수신자 실명을 주입한다.
  slots?: [string, string, string]; // 인터뷰 일정 3안
  /** 보도자료에 실제로 걸어둔 자료 링크 — "약속한 자료만" 안내하기 위해 필요하다 */
  links?: string[];
  questionSubtype?: QuestionSubtype;
  /** 게재 기사에서 무엇이 어떻게 다른지 — 정정 요청 초안에 그대로 들어간다 */
  correctionNote?: string;
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

/**
 * 보도자료에 실제로 걸어둔 링크만 나열한다.
 * 없는 자료를 "보내드리겠다"고 약속하면 지키지 못할 약속이 된다.
 */
function promisedLinks(ctx: ReplyDraftContext): string {
  const links = (ctx.links ?? []).filter(Boolean);
  if (links.length === 0) {
    return "· (보도자료에 등록된 자료 링크가 없습니다 — 실제 보유한 자료만 적어 보내세요)";
  }
  return links.map((l) => `· ${l}`).join("\n");
}

/**
 * 질문 응대 3단 스캐폴드 — 공식 답변 / 대체 표현 2개 / Do Not Say.
 * 빈칸 슬롯으로 두고 **사실을 지어내지 않는다**. 담당자가 채워 넣는 구조다.
 */
function questionScaffold(headline: string, guidance: string[], doNotSay: string[]): string {
  return [
    `${NAME}, 문의 주신 내용 확인해 답변드립니다.`,
    "",
    `[공식 답변] ${headline}`,
    "· (확인된 사실을 한 문장으로)",
    "· (근거: 출처·기준·시점)",
    "",
    "[대체 표현 — 상황에 맞게 하나 고르세요]",
    ...guidance.map((g) => `· ${g}`),
    "",
    "[이렇게는 말하지 않기]",
    ...doNotSay.map((d) => `· ${d}`),
  ].join("\n");
}

/** 질문 하위 유형별 스캐폴드. 빈칸은 담당자가 채운다 — 사실을 생성하지 않는다. */
function questionScaffoldFor(subtype: QuestionSubtype | undefined): string {
  switch (subtype) {
    case "numbers":
      return questionScaffold(
        "수치의 산출 기준을 그대로 공개합니다.",
        [
          "\"(기간·모수) 기준 (수치)입니다. 원자료도 보내드릴 수 있습니다.\"",
          "\"내부 집계라 외부 검증본은 없습니다. 산출 방식을 그대로 공유드립니다.\"",
        ],
        ["확인되지 않은 수치를 반올림해 말하기", "출처 없이 '업계 최고 수준'이라고 표현하기"],
      );
    case "competitor":
      return questionScaffold(
        "자사 사실만 기술하고 타사 평가는 하지 않습니다.",
        [
          "\"타사 상황은 저희가 평가할 위치가 아닙니다. 저희 수치는 (값)입니다.\"",
          "\"공개된 제3자 자료 기준으로는 (출처)에 비교가 나와 있습니다.\"",
        ],
        [
          "타사를 직접 깎아내리는 비교(표시광고법 제3조 부당비교광고 소지)",
          "\"경쟁사보다 우수하다\"는 근거 없는 단정",
        ],
      );
    case "intent":
      return questionScaffold(
        "결정의 배경을 사실 중심으로 설명합니다.",
        [
          "\"(문제 상황)이 있었고, 그래서 (결정)했습니다.\"",
          "\"내부 논의 과정은 공개하기 어렵지만 판단 근거는 (사실)입니다.\"",
        ],
        ["확정되지 않은 내부 논의를 확정처럼 말하기", "경영진 개인 의견을 회사 공식 입장처럼 전달하기"],
      );
    case "roadmap":
      return questionScaffold(
        "확정된 일정만 말하고 미확정은 미확정이라고 밝힙니다.",
        [
          "\"(확정 일정)은 확정입니다. 그 이후는 아직 확정 전입니다.\"",
          "\"시점은 말씀드리기 어렵지만 방향은 (내용)입니다.\"",
        ],
        ["미확정 출시일을 확정처럼 말하기", "'곧'·'조만간'처럼 검증 불가능한 시점 표현"],
      );
    case "negative":
      return questionScaffold(
        "⚠️ 담당자 확인이 필요한 질문입니다. 아래는 초안일 뿐 그대로 보내지 마세요.",
        [
          "\"확인해서 (시한) 안에 정확히 회신드리겠습니다.\"",
          "\"현재 확인된 사실은 (내용)이며, 나머지는 확인 중입니다.\"",
        ],
        ["추측으로 답하기", "확인 전에 부인하기", "질문 자체를 회피하기"],
      );
    default:
      return questionScaffold(
        "확인된 사실만 답하고 모르는 것은 모른다고 밝힙니다.",
        [
          "\"확인된 내용은 (사실)입니다.\"",
          "\"그 부분은 확인 후 회신드리겠습니다.\"",
        ],
        ["확인되지 않은 내용을 추정해서 답하기"],
      );
  }
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
      build: (ctx) =>
        `${NAME}, 요청하신 자료 전달드립니다.\n${promisedLinks(ctx)}\n추가로 필요하신 것 있으면 언제든 말씀 주세요.`,
    },
    {
      id: "detailed",
      label: "자료 목록 정리형",
      description: "자료가 여러 개일 때 — 이름·형식·용도를 표처럼 정리합니다.",
      build: (ctx) =>
        `${NAME}, 요청하신 자료를 정리해 보내드립니다.\n${promisedLinks(ctx)}\n각 파일의 형식·캡션·출처 표기를 함께 정리했습니다.\n형식 변환이나 추가 컷이 필요하시면 바로 준비하겠습니다.`,
    },
    {
      id: "upsell",
      label: "자료 + 인터뷰 제안",
      description: "자료 전달과 함께 대표 코멘트·인터뷰를 가볍게 제안합니다.",
      build: (ctx) =>
        `${NAME}, 요청하신 자료 전달드립니다.\n${promisedLinks(ctx)}\n기사에 대표 코멘트가 필요하시면 서면·전화 모두 빠르게 지원 가능합니다. 편하게 말씀 주세요.`,
    },
  ],
  question: [
    {
      id: "default",
      label: "3단 스캐폴드",
      description: "질문 성격에 맞춰 공식 답변·대체 표현·금지 표현을 함께 제시합니다.",
      build: (ctx) => questionScaffoldFor(ctx.questionSubtype),
    },
    {
      id: "evidence",
      label: "근거 상세형",
      description: "수치 검증 질문일 때 — 산출 방식·모수·출처까지 붙입니다.",
      build: () =>
        `${NAME}, 문의 주신 내용 확인해 답변드립니다.\n· 답변: (정확한 답)\n· 산출 방식: (기간·모수·기준)\n· 출처: (링크/문서)\n원자료가 필요하시면 원본 데이터도 보내드리겠습니다.`,
    },
    {
      id: "brief",
      label: "간결 답변",
      description: "단순 확인 질문일 때 — 답과 근거 한 줄만.",
      build: () =>
        `${NAME}, 문의 주신 내용 확인해 답변드립니다.\n(질문) → (정확한 답). (근거: 링크/출처)`,
    },
  ],
  published: [
    {
      id: "default",
      label: "감사 인사",
      description: "기본형 — 게재 감사와 관계 유지.",
      build: () =>
        `${NAME}, 좋은 기사로 다뤄주셔서 진심으로 감사합니다.\n덕분에 좋은 반응 있었습니다. 앞으로도 의미 있는 소식 있을 때 먼저 전해드리겠습니다.\n\n※ 보내기 전 확인: 기사에 인용된 수치·직함·회사 표기가 저희 자료와 일치하는지 점검하세요. 다르면 감사 인사가 아니라 정정 요청으로 시작해야 합니다.`,
    },
    {
      id: "followup",
      label: "감사 + 후속 예고",
      description: "감사 인사에 다음 소식 예고와 채널 공유 안내를 더합니다.",
      build: () =>
        `${NAME}, 좋은 기사로 다뤄주셔서 진심으로 감사합니다.\n기사는 저희 채널에도 출처와 함께 소개하겠습니다.\n다음 분기 (예: 신제품/실적) 소식이 준비되는 대로 기자님께 가장 먼저 전해드리겠습니다.\n\n※ 보내기 전 확인: 기사에 인용된 수치·직함·회사 표기가 저희 자료와 일치하는지 점검하세요.`,
    },
    {
      id: "correction",
      label: "정정 요청",
      description: "기사에 사실과 다른 내용이 있을 때 — 감사 인사보다 정정이 먼저입니다.",
      build: (ctx) =>
        [
          `${NAME}, 기사 잘 보았습니다. 다만 확인이 필요한 부분이 있어 먼저 말씀드립니다.`,
          "",
          ctx.correctionNote?.trim()
            ? `· 확인 요청: ${ctx.correctionNote.trim()}`
            : "· 확인 요청: (무엇이 어떻게 다른지 한 문장으로)",
          "· 저희 자료 기준: (정확한 값과 출처)",
          "",
          "저희 쪽 자료 전달 과정에서 혼선이 있었다면 사과드립니다. 확인해 주시면 감사하겠습니다.",
        ].join("\n"),
    },
  ],
  hold: [
    {
      id: "default",
      label: "깔끔한 수용",
      description: "기본형 — 부담 없이 다음을 기약합니다.",
      build: () =>
        `${NAME}, 검토해 주셔서 감사합니다. 다음에 더 의미 있는 소식으로 다시 찾아뵙겠습니다.\n\n※ 이 기자에게는 자동으로 다시 접근하지 않습니다. 새 소식이 생겼을 때 담당자가 직접 판단해 보내세요.`,
    },
    {
      id: "keepwarm",
      label: "관계 유지형",
      description: "미디어킷을 남기고, 다음 소식 때 다시 연락드려도 될지 여쭙니다.",
      build: () =>
        `${NAME}, 검토해 주셔서 감사합니다. 이번엔 시의가 맞지 않았던 것 같습니다.\n참고용 미디어킷만 남겨두겠습니다: (링크)\n${NAME} 출입 분야에 맞는 소식이 있을 때 가끔 전해드려도 괜찮을까요?\n\n※ 동의 회신을 받기 전에는 자동 재발송 대상이 아닙니다.`,
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
