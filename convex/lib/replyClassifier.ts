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
  lastName: string; // 기자 성
  slots?: [string, string, string]; // 인터뷰 일정 3안
}

export function buildReplyDraft(type: ReplyType, ctx: ReplyDraftContext): string {
  const name = `${ctx.lastName} 기자님`;
  const slots = ctx.slots ?? ["(일정1)", "(일정2)", "(일정3)"];
  switch (type) {
    case "interview":
      return `${name}, 관심 가져주셔서 감사합니다. 대표 인터뷰 가능합니다.\n아래 중 편하신 시간 알려주시면 맞추겠습니다.\n· ${slots[0]} · ${slots[1]} · ${slots[2]}\n대면/화상/전화 모두 가능하며, 필요하신 자료 미리 보내드리겠습니다.`;
    case "materials":
      return `${name}, 요청하신 자료 전달드립니다.\n· (요청 자료1): (링크)\n· (요청 자료2): (링크)\n추가로 필요하신 것 있으면 언제든 말씀 주세요.`;
    case "question":
      return `${name}, 문의 주신 내용 확인해 답변드립니다.\n(질문) → (정확한 답). (근거: 링크/출처)`;
    case "published":
      return `${name}, 좋은 기사로 다뤄주셔서 진심으로 감사합니다.\n덕분에 좋은 반응 있었습니다. 앞으로도 의미 있는 소식 있을 때 먼저 전해드리겠습니다.`;
    case "hold":
      return `${name}, 검토해 주셔서 감사합니다. 다음에 더 의미 있는 소식으로 다시 찾아뵙겠습니다.`;
    case "unsubscribe":
      // 컴플라이언스 핵심: 변명·설득·사과 없이 즉시 수용 + 억제 리스트 등록
      return `${name}, 알겠습니다. 명단에서 즉시 제외했습니다. 좋은 하루 보내세요.`;
    case "complaint":
      return `${name}, 지적 감사합니다. 확인 결과 (사실관계).\n(정정 내용). 혼선 드려 죄송하며, 정확한 자료 다시 보내드리겠습니다.`;
  }
}
