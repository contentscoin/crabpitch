/** 랜딩/설정 공용 데이터 */

export interface PlanCard {
  id: "free" | "solo" | "growth" | "agency";
  name: string;
  price: string; // 표시용
  unit: string;
  who: string;
  features: string[];
  cta: string;
  popular: boolean;
}

export const PLANS: PlanCard[] = [
  {
    id: "free",
    name: "Free",
    price: "0",
    unit: "원",
    who: "체험 · 초기 창업가",
    features: [
      "보도자료 작성 월 3건",
      "기자 매칭 미리보기 (상위 5명, 이메일 3명 공개)",
      "내 Gmail로 발송 월 10통",
      "미디어킷 1개 (웹 링크)",
    ],
    cta: "무료로 시작",
    popular: false,
  },
  {
    id: "solo",
    name: "Solo",
    price: "19,000",
    unit: "원/월",
    who: "1인 창업가 · 소상공인",
    features: ["기자 매칭 무제한 공개", "발송 월 100통", "답장 자동 분류·응대 초안", "미디어킷 3개 · 성과 리포트"],
    cta: "Solo 시작하기",
    popular: true,
  },
  {
    id: "growth",
    name: "Growth",
    price: "49,000",
    unit: "원/월",
    who: "성장 스타트업",
    features: ["발송 월 500통", "예약·반복 발송", "경쟁사 노출 비교", "미디어킷 무제한 · 우선 지원"],
    cta: "Growth 선택",
    popular: false,
  },
  {
    id: "agency",
    name: "Agency",
    price: "149,000",
    unit: "원~/월",
    who: "PR 대행사",
    features: ["멀티 클라이언트 · 팀 시트", "화이트라벨", "발송 무제한", "API 연동"],
    cta: "문의하기",
    popular: false,
  },
];

export const COMPARE_ROWS = [
  { feat: "핵심 가치", neusral: "뉴스 모니터링·PR 성과분석", us: "매칭 → 작성 → 발송 → 응대 실행" },
  { feat: "기자 매칭", neusral: "기자 검색 제공", us: "주제 기반 적합도 자동 랭킹 + 매칭 이유" },
  { feat: "메일 작성", neusral: "템플릿", us: "기자 최근 기사 반영 AI 개인화" },
  { feat: "답장 응대", neusral: "—", us: "회신 7유형 자동 분류·답장 초안" },
  { feat: "미디어킷", neusral: "—", us: "인터뷰형 자동 생성" },
  { feat: "타깃", neusral: "기업 홍보팀", us: "1인 창업가·소상공인" },
  { feat: "사용 방식", neusral: "웹 대시보드", us: "AI 대화(Claude·GPT·Gemini) + 웹" },
];

export const STEPS = [
  { n: 1, title: "보도자료 정리", desc: '"이 소식 알리고 싶어"라고 말하면 5W1H를 묻고 표준 보도자료와 헤드라인 3안을 만들어 줍니다.' },
  { n: 2, title: "기자 매칭", desc: "주제에 맞는 현역 기자를 적합도 점수와 매칭 이유(최근 기사)까지 근거로 제시합니다." },
  { n: 3, title: "개인화 메일", desc: "기자별 최근 기사를 언급하는 서로 다른 메일 초안. 무작위 대량발송이 아닌 정밀 피치." },
  { n: 4, title: "발송·응대", desc: "승인 후 내 Gmail로 발송. 답장은 7유형으로 자동 분류해 답장 초안까지 만들어 줍니다." },
];
