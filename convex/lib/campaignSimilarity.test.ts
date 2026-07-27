import { describe, expect, it } from "vitest";
import {
  MIN_DRAFTS_FOR_CHECK,
  checkCampaignSimilarity,
  personalizedRegion,
} from "./campaignSimilarity";

/** 실제 초안 골격 — 개인화 구간(후킹)만 바꿔 가며 쓴다. */
function draft(hook: string): string {
  return [
    "기자님, 안녕하세요. 홍길동입니다.",
    hook,
    "",
    "크랩피치는 시리즈A를 유치했습니다. 누적 이용자 30만 명을 확보했습니다.",
    "· 자료: https://example.com/kit",
    "",
    "관련 자료가 준비돼 있습니다. 필요하시면 회신 주세요.",
    "",
    "홍길동 드림",
    "크랩피치",
    "",
    "──",
    "본 메일 수신을 원치 않으시면 회신으로 '수신거부'라 남겨주세요. 즉시 명단에서 제외하겠습니다.",
  ].join("\n");
}

const HOOKS = [
  "지난 3월 12일 '스타트업 투자 혹한기' 기사 잘 보았습니다. 관련해 먼저 전해드릴 소식이 있습니다.",
  "기자님의 '핀테크 규제 샌드박스 1년' 기사 잘 보았습니다. 관련해 먼저 전해드릴 소식이 있습니다.",
  "커머스 분야를 취재하시는 기자님께 먼저 전해드릴 소식이 있습니다.",
  "지난 5월 2일 'B2B SaaS 시장 재편' 기사 잘 보았습니다. 관련해 먼저 전해드릴 소식이 있습니다.",
];

describe("캠페인 내 메일 상호 유사도", () => {
  it("표본이 적으면 검사하지 않는다", () => {
    const few = HOOKS.slice(0, MIN_DRAFTS_FOR_CHECK - 1).map(draft);
    expect(checkCampaignSimilarity(few).status).toBe("skipped");
  });

  it("공통 골격은 유사도 판정에서 걷어낸다 — 같은 캠페인은 원래 대부분 같다", () => {
    const r = checkCampaignSimilarity(HOOKS.map(draft));
    expect(r.status).toBe("pass");
    expect(r.distinctVariants).toBe(HOOKS.length);
    expect(r.notes).toEqual([]);
  });

  it("본문이 완전히 동일하면 개인화 없음으로 잡는다", () => {
    const same = [draft(HOOKS[0]!), draft(HOOKS[0]!), draft(HOOKS[0]!)];
    const r = checkCampaignSimilarity(same);
    expect(r.status).toBe("warn");
    expect(r.emptyPersonalization).toBe(3);
    expect(r.notes[0]).toContain("개인화가 적용되지 않았습니다");
  });

  it("후킹이 전부 같은 generic 폴백이면 잡는다", () => {
    // 실명은 초안에 없고 회사·자료도 같으므로, 후킹이 같으면 남는 차이가 없다.
    const generic = "테크 분야를 취재하시는 기자님께 먼저 전해드릴 소식이 있습니다.";
    const bodies = [draft(generic), draft(generic), draft(generic), draft(generic)];
    const r = checkCampaignSimilarity(bodies);
    expect(r.status).toBe("warn");
  });

  it("일부만 겹쳐도 알린다 — 전체의 과반일 필요는 없다", () => {
    // 4건 중 2건만 같은 후킹(같은 기사를 쓴 두 기자). 6쌍 중 1쌍뿐이라 비율로는 묻힌다.
    const bodies = [draft(HOOKS[0]!), draft(HOOKS[1]!), draft(HOOKS[2]!), draft(HOOKS[1]!)];
    const r = checkCampaignSimilarity(bodies);
    expect(r.status).toBe("warn");
    expect(r.duplicatePairs).toBe(1);
    expect(r.notes[0]).toContain("1쌍");
  });

  it("어미만 손본 재탕은 잡지 못한다 — 오탐을 피하려고 임계값을 높게 뒀다", () => {
    // 개인화 구간이 한두 문장뿐이라, 이 정도 차이를 잡는 임계값이면 서로 다른 기사를
    // 인용한 정상 초안(템플릿 꼬리가 같다)도 함께 걸린다. 실제 중복은 바이트 단위로
    // 같게 나오므로 이 한계를 감수한다.
    const base = "지난 3월 12일 '스타트업 투자 혹한기' 기사 잘 보았습니다. 관련해 먼저 전해드릴 소식이 있습니다.";
    const bodies = [
      draft(base),
      draft(base.replace("잘 보았습니다", "잘 봤습니다")),
      draft(base.replace("먼저", "우선")),
    ];
    const r = checkCampaignSimilarity(bodies);
    expect(r.maxPairSimilarity).toBeLessThan(0.9);
    expect(r.status).toBe("pass");
  });

  it("개인화 구간만 남기고 공통 줄은 지운다", () => {
    const shared = new Set(["가나다라", "마바사"]);
    expect(personalizedRegion("가나다라\n특별한 줄\n마바사", shared)).toBe("특별한 줄");
  });

  it("초안 수는 잘라 낸 표본이 아니라 실제 건수를 보고한다", () => {
    const many = Array.from({ length: 80 }, (_, i) => draft(`${HOOKS[i % HOOKS.length]} (${i})`));
    expect(checkCampaignSimilarity(many).draftCount).toBe(80);
  });
});
