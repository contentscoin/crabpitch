import { describe, expect, it } from "vitest";
import {
  buildOnboardingChecklist,
  parseSnoozedUntil,
  SENDER_BANNER_SNOOZE_MS,
  shouldShowSenderBanner,
  toCampaignState,
  type OnboardingServerState,
} from "./onboarding";

const BASE: OnboardingServerState = {
  profileDone: false,
  senderKind: "none",
  senderNeedsCheck: false,
  isClientScoped: false,
};

const NO_CAMPAIGNS = { count: 0, anyMatched: false, anySent: false };
const ALL_CAMPAIGNS = { count: 2, anyMatched: true, anySent: true };

describe("buildOnboardingChecklist", () => {
  it("5단계를 정의하고 아무것도 안 했으면 0/5", () => {
    const c = buildOnboardingChecklist(BASE, NO_CAMPAIGNS);
    expect(c.steps.map((s) => s.id)).toEqual([
      "profile",
      "sender",
      "campaign",
      "match",
      "send",
    ]);
    expect(c.doneCount).toBe(0);
    expect(c.totalCount).toBe(5);
    expect(c.allDone).toBe(false);
  });

  it("전부 마치면 allDone — 체크리스트를 렌더하지 않는 조건", () => {
    const c = buildOnboardingChecklist(
      { ...BASE, profileDone: true, senderKind: "smtp" },
      ALL_CAMPAIGNS,
    );
    expect(c.doneCount).toBe(5);
    expect(c.allDone).toBe(true);
    expect(c.nextStep).toBeNull();
  });

  it("다음 단계는 미완료 중 첫 번째다 — 한 걸음만 강조한다", () => {
    const c = buildOnboardingChecklist({ ...BASE, profileDone: true }, NO_CAMPAIGNS);
    expect(c.nextStep?.id).toBe("sender");
  });

  it("캠페인 판정은 각 축을 독립으로 본다", () => {
    // 캠페인은 있지만 매칭·발송은 안 한 상태.
    const c = buildOnboardingChecklist(BASE, { count: 1, anyMatched: false, anySent: false });
    const by = Object.fromEntries(c.steps.map((s) => [s.id, s.done]));
    expect(by.campaign).toBe(true);
    expect(by.match).toBe(false);
    expect(by.send).toBe(false);
  });
});

/**
 * Gmail 연결만으로는 기자에게 메일이 나가지 않는다(`schema.ts` `sendModeValidator` 주석:
 * 실제 메일이 나가는 것은 `smtp`뿐). 완료로 표시하되 그 사실을 문구로 알려야 한다 —
 * 그러지 않으면 "연결했으니 나간다"고 믿고 발송을 누르게 된다.
 */
describe("② 발신 수단 — Gmail은 부분 완료", () => {
  function senderStep(state: Partial<OnboardingServerState>) {
    const c = buildOnboardingChecklist({ ...BASE, ...state }, NO_CAMPAIGNS);
    return c.steps.find((s) => s.id === "sender")!;
  }

  it("smtp: 완료 + 실제 발송 안내", () => {
    const s = senderStep({ senderKind: "smtp" });
    expect(s.done).toBe(true);
    expect(s.warn).toBe(false);
    expect(s.description).toContain("실제 메일이 나갑니다");
  });

  it("smtp인데 마지막 연결 실패: 완료로 두되 경고 — '저장됐다 ≠ 붙는다'", () => {
    const s = senderStep({ senderKind: "smtp", senderNeedsCheck: true });
    expect(s.done).toBe(true);
    expect(s.warn).toBe(true);
    expect(s.description).toContain("실패");
  });

  it("gmail: 완료로 표시하되 초안 생성까지만 가능함을 알린다", () => {
    const s = senderStep({ senderKind: "gmail" });
    expect(s.done).toBe(true);
    expect(s.warn).toBe(true);
    expect(s.description).toContain("초안 생성까지만");
    expect(s.description).toContain("SMTP");
  });

  it("none: 미완료 + 메일이 나가지 않는다는 경고", () => {
    const s = senderStep({ senderKind: "none" });
    expect(s.done).toBe(false);
    expect(s.description).toContain("나가지 않습니다");
  });
});

/**
 * ①②는 사용자 축(`profiles`/`gmailAccounts`/`smtpAccounts`에 `agencyClientId`가 없다),
 * ③④⑤는 클라이언트 축(`campaigns.list`가 `activeClientId`를 존중)이다.
 * 한 진행률에 섞으면 클라이언트를 바꿀 때 의미가 붕괴한다.
 */
describe("에이전시 클라이언트 컨텍스트", () => {
  it("③④⑤만 세어 n/3으로 낸다", () => {
    const c = buildOnboardingChecklist({ ...BASE, isClientScoped: true }, NO_CAMPAIGNS);
    expect(c.totalCount).toBe(3);
    expect(c.counted.map((s) => s.id)).toEqual(["campaign", "match", "send"]);
  });

  it("①②는 '계정 공통'으로 분리되고 진행률에 들어가지 않는다", () => {
    const c = buildOnboardingChecklist(
      { ...BASE, isClientScoped: true, profileDone: true, senderKind: "smtp" },
      NO_CAMPAIGNS,
    );
    // 계정 공통 2단계를 마쳤어도 클라이언트 진행률은 0/3이다.
    expect(c.doneCount).toBe(0);
    expect(c.totalCount).toBe(3);
    expect(c.allDone).toBe(false);
    const scoped = c.steps.filter((s) => s.accountScoped).map((s) => s.id);
    expect(scoped).toEqual(["profile", "sender"]);
  });

  it("클라이언트 축 3단계를 마치면 allDone — 계정 공통 미완료는 막지 않는다", () => {
    // 새 클라이언트를 추가하면 ③④⑤가 리셋돼 체크리스트가 다시 나타난다(의도된 동작).
    const c = buildOnboardingChecklist({ ...BASE, isClientScoped: true }, ALL_CAMPAIGNS);
    expect(c.allDone).toBe(true);
  });

  it("계정 공통 단계가 미완료면 여전히 다음 단계로 안내한다", () => {
    const c = buildOnboardingChecklist({ ...BASE, isClientScoped: true }, ALL_CAMPAIGNS);
    // 진행률에서는 빠지지만 "할 일"에서 사라지면 안 된다.
    expect(c.nextStep?.id).toBe("profile");
  });
});

describe("toCampaignState", () => {
  it("로딩 중(undefined)은 null", () => {
    expect(toCampaignState(undefined)).toBeNull();
  });

  it("빈 배열은 전부 false", () => {
    expect(toCampaignState([])).toEqual({ count: 0, anyMatched: false, anySent: false });
  });

  it("하나라도 있으면 해당 축이 true", () => {
    expect(
      toCampaignState([
        { matchCount: 0, sentCount: 0 },
        { matchCount: 3, sentCount: 0 },
      ]),
    ).toEqual({ count: 2, anyMatched: true, anySent: false });
  });
});

describe("shouldShowSenderBanner", () => {
  const NOW = 1_700_000_000_000;
  const OK = {
    senderKind: "none" as const,
    pathname: "/campaigns",
    mounted: true,
    snoozedUntil: 0,
    now: NOW,
  };

  it("기본 조건이 맞으면 띄운다", () => {
    expect(shouldShowSenderBanner(OK)).toBe(true);
  });

  it("서버 렌더(mounted=false)에서는 띄우지 않는다 — localStorage를 읽을 수 없다", () => {
    expect(shouldShowSenderBanner({ ...OK, mounted: false })).toBe(false);
  });

  it("발신 수단이 있으면 띄우지 않는다", () => {
    expect(shouldShowSenderBanner({ ...OK, senderKind: "smtp" })).toBe(false);
    expect(shouldShowSenderBanner({ ...OK, senderKind: "gmail" })).toBe(false);
  });

  it("로딩 중(null)에는 띄우지 않는다", () => {
    expect(shouldShowSenderBanner({ ...OK, senderKind: null })).toBe(false);
  });

  it("설정 화면에서는 띄우지 않는다 — 이미 고칠 수 있는 곳이다", () => {
    expect(shouldShowSenderBanner({ ...OK, pathname: "/settings" })).toBe(false);
    // 하위 경로도 포함한다.
    expect(shouldShowSenderBanner({ ...OK, pathname: "/settings/anything" })).toBe(false);
  });

  it("대시보드에서는 띄우지 않는다 — 체크리스트 ②가 같은 말을 한다", () => {
    // senderKind가 none이면 ②가 미완료이므로 체크리스트는 항상 렌더된다.
    expect(shouldShowSenderBanner({ ...OK, pathname: "/dashboard" })).toBe(false);
  });

  it("스누즈 중이면 띄우지 않고, 만료되면 다시 띄운다", () => {
    const until = NOW + SENDER_BANNER_SNOOZE_MS;
    expect(shouldShowSenderBanner({ ...OK, snoozedUntil: until })).toBe(false);
    expect(shouldShowSenderBanner({ ...OK, snoozedUntil: until, now: until + 1 })).toBe(true);
  });
});

describe("parseSnoozedUntil", () => {
  it("숫자 문자열을 읽는다", () => {
    expect(parseSnoozedUntil("1700000000000")).toBe(1_700_000_000_000);
  });

  it("없거나 손상된 값은 0 — 스누즈 안 된 것으로 본다", () => {
    for (const v of [null, "", "abc", "NaN", "-1", "0"]) {
      expect(parseSnoozedUntil(v), String(v)).toBe(0);
    }
  });
});
