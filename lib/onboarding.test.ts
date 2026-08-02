import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOnboardingChecklist,
  parseSnoozedUntil,
  readSnoozedUntil,
  SENDER_BANNER_SNOOZE_MS,
  senderBannerSnoozeKey,
  senderBannerState,
  toCampaignState,
  writeSnoozedUntil,
  type OnboardingServerState,
} from "./onboarding";

const BASE: OnboardingServerState = {
  profileDone: false,
  senderKind: "none",
  smtpStatus: null,
  isClientScoped: false,
};

const NO_CAMPAIGNS = { count: 0, anyMatched: false, anySent: false };
const ALL_CAMPAIGNS = { count: 2, anyMatched: true, anySent: true };
const SMTP_OK: Partial<OnboardingServerState> = { senderKind: "smtp", smtpStatus: "ok" };

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
      { ...BASE, ...SMTP_OK, profileDone: true },
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
describe("② 발신 수단 문구", () => {
  function senderStep(state: Partial<OnboardingServerState>) {
    const c = buildOnboardingChecklist({ ...BASE, ...state }, NO_CAMPAIGNS);
    return c.steps.find((s) => s.id === "sender")!;
  }

  it("smtp + ok: 완료 + 실제 발송 안내", () => {
    const s = senderStep(SMTP_OK);
    expect(s.done).toBe(true);
    expect(s.warn).toBe(false);
    expect(s.description).toContain("실제 메일이 나갑니다");
  });

  it("smtp + error: 완료로 두되 경고 — '저장됐다 ≠ 붙는다'", () => {
    const s = senderStep({ senderKind: "smtp", smtpStatus: "error" });
    expect(s.done).toBe(true);
    expect(s.warn).toBe(true);
    expect(s.description).toContain("실패");
  });

  /**
   * `smtpAccounts`는 접속 정보를 저장할 때 `lastStatus`를 지운다(이전 테스트 결과가 더
   * 이상 유효하지 않으므로). 한 번도 검증되지 않은 계정을 `ok`로 취급하면 세 상태 중
   * 가장 단정적인 문구를 근거 없이 주게 된다.
   */
  it("smtp + unverified: 나간다고 단정하지 않는다", () => {
    const s = senderStep({ senderKind: "smtp", smtpStatus: "unverified" });
    expect(s.done).toBe(true);
    expect(s.warn).toBe(true);
    expect(s.description).not.toContain("실제 메일이 나갑니다");
    expect(s.description).toContain("확인하지 않았습니다");
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
 * ①②는 사용자 축(`profiles`/`gmailAccounts`/`smtpAccounts`에 클라이언트 구분이 없다),
 * ③④⑤는 클라이언트 축(`campaigns.list`가 활성 클라이언트를 존중)이다.
 * 한 진행률에 섞으면 클라이언트를 바꿀 때 의미가 붕괴한다.
 */
describe("에이전시 클라이언트 컨텍스트", () => {
  const SCOPED = { ...BASE, isClientScoped: true };

  it("③④⑤만 세어 n/3으로 낸다", () => {
    const c = buildOnboardingChecklist(SCOPED, NO_CAMPAIGNS);
    expect(c.totalCount).toBe(3);
    expect(c.counted.map((s) => s.id)).toEqual(["campaign", "match", "send"]);
  });

  it("①②는 진행률에 들어가지 않는다", () => {
    const c = buildOnboardingChecklist(
      { ...SCOPED, ...SMTP_OK, profileDone: true },
      NO_CAMPAIGNS,
    );
    // 계정 공통 2단계를 마쳤어도 클라이언트 진행률은 0/3이다.
    expect(c.doneCount).toBe(0);
    expect(c.totalCount).toBe(3);
    const scoped = c.steps.filter((s) => s.accountScoped).map((s) => s.id);
    expect(scoped).toEqual(["profile", "sender"]);
  });

  it("정본 순서를 유지한다 — 화면이 목록을 쪼개지 않게 한다", () => {
    // 두 개의 <ol>로 쪼개면 번호가 각각 1부터 다시 시작해 "5단계 중 어디"가 사라진다.
    const c = buildOnboardingChecklist(SCOPED, NO_CAMPAIGNS);
    expect(c.steps.map((s) => s.id)).toEqual([
      "profile",
      "sender",
      "campaign",
      "match",
      "send",
    ]);
  });

  /**
   * ⚠️ 진행률에서 빼는 것과 화면에서 없애는 것은 다르다.
   *
   * `allDone`이 `counted`만 봤다면: 클라이언트 축 3단계를 마친 순간 카드가 사라지고,
   * 대시보드에서는 배너도 스스로를 끄므로 "발신 수단 미연결"을 **아무도 말하지 않는다**.
   * `record_only` 발송(메일 0통 + sent 기록)은 발신 계정을 요구하지 않으므로
   * 발신 수단 없이 ⑤가 완료되는 조합은 실제로 도달 가능하다.
   */
  it("클라이언트 축을 다 마쳐도 계정 공통이 남으면 allDone이 아니다", () => {
    const c = buildOnboardingChecklist(SCOPED, ALL_CAMPAIGNS);
    expect(c.doneCount).toBe(3);
    expect(c.totalCount).toBe(3);
    expect(c.allDone).toBe(false);
    expect(c.nextStep?.id).toBe("profile");
  });

  it("계정 공통까지 마치면 allDone", () => {
    const c = buildOnboardingChecklist(
      { ...SCOPED, ...SMTP_OK, profileDone: true },
      ALL_CAMPAIGNS,
    );
    expect(c.allDone).toBe(true);
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

/**
 * 배너 임계값은 "발신 계정 행이 있는가"가 아니라 **"기자에게 메일이 나가는가"**다.
 * 행 존재로 판정하면 Gmail 전용·SMTP 고장 — 실제로 막히는 두 상태 — 가 경고를 못 받고,
 * 이 기능이 없애려던 실패 경로(발송 버튼을 눌러야 알게 됨)가 그대로 남는다.
 */
describe("senderBannerState", () => {
  const NOW = 1_700_000_000_000;
  const OK = {
    senderKind: "none" as const,
    smtpStatus: null,
    pathname: "/campaigns",
    mounted: true,
    snoozedUntil: 0,
    now: NOW,
  };

  it("미연결이면 blocked 톤", () => {
    expect(senderBannerState(OK)?.tone).toBe("blocked");
    expect(senderBannerState(OK)?.message).toContain("나가지 않습니다");
  });

  it("Gmail만 연결이면 partial 톤 — SMTP가 필요함을 알린다", () => {
    const s = senderBannerState({ ...OK, senderKind: "gmail" });
    expect(s?.tone).toBe("partial");
    expect(s?.message).toContain("SMTP");
  });

  it("SMTP 마지막 연결 실패면 check 톤", () => {
    const s = senderBannerState({ ...OK, senderKind: "smtp", smtpStatus: "error" });
    expect(s?.tone).toBe("check");
  });

  it("SMTP가 정상이거나 미검증이면 침묵한다 — 알려진 고장이 아니다", () => {
    for (const smtpStatus of ["ok", "unverified"] as const) {
      expect(
        senderBannerState({ ...OK, senderKind: "smtp", smtpStatus }),
        smtpStatus,
      ).toBeNull();
    }
  });

  it("서버 렌더(mounted=false)에서는 띄우지 않는다 — localStorage를 읽을 수 없다", () => {
    expect(senderBannerState({ ...OK, mounted: false })).toBeNull();
  });

  it("로딩 중(null)에는 아무 주장도 하지 않는다", () => {
    expect(senderBannerState({ ...OK, senderKind: null })).toBeNull();
  });

  it("설정 화면에서는 띄우지 않는다 — 이미 고칠 수 있는 곳이다", () => {
    expect(senderBannerState({ ...OK, pathname: "/settings" })).toBeNull();
    expect(senderBannerState({ ...OK, pathname: "/settings/anything" })).toBeNull();
  });

  /**
   * 대시보드에서 감추는 것은 `blocked`뿐이다.
   *
   * `blocked`는 체크리스트 ②가 미완료라는 뜻이고 `allDone`이 모든 단계를 보므로
   * 체크리스트가 반드시 렌더된다 → 같은 말을 두 곳에서 하게 된다.
   * `partial`·`check`는 ②가 완료(경고)라서 `allDone`이 참일 수 있다 → 체크리스트가
   * 사라진 자리에서 배너가 말해야 한다. 이걸 구분하지 않으면 Gmail 전용 사용자는
   * 대시보드에서 어떤 경고도 못 본다.
   */
  it("대시보드에서는 blocked만 감춘다", () => {
    const dash = { ...OK, pathname: "/dashboard" };
    expect(senderBannerState(dash)).toBeNull();
    expect(senderBannerState({ ...dash, senderKind: "gmail" })?.tone).toBe("partial");
    expect(
      senderBannerState({ ...dash, senderKind: "smtp", smtpStatus: "error" })?.tone,
    ).toBe("check");
  });

  it("스누즈 중이면 띄우지 않고, 만료되면 다시 띄운다", () => {
    const until = NOW + SENDER_BANNER_SNOOZE_MS;
    expect(senderBannerState({ ...OK, snoozedUntil: until })).toBeNull();
    expect(senderBannerState({ ...OK, snoozedUntil: until, now: until + 1 })?.tone).toBe(
      "blocked",
    );
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

/**
 * `localStorage` 접근은 사파리 프라이빗 모드 등에서 **던진다**. 감싸지 않으면 배너 하나
 * 때문에 앱 셸 전체가 죽는다.
 */
describe("스누즈 저장", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("키를 사용자별로 나눈다 — 브라우저를 공유하는 다른 계정이 상속하지 않게", () => {
    expect(senderBannerSnoozeKey("user_a")).not.toBe(senderBannerSnoozeKey("user_b"));
    expect(senderBannerSnoozeKey("user_a")).toContain("user_a");
  });

  it("사용자별로 따로 읽고 쓴다", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });

    writeSnoozedUntil("user_a", 111);
    expect(readSnoozedUntil("user_a")).toBe(111);
    // 다른 계정은 영향받지 않는다.
    expect(readSnoozedUntil("user_b")).toBe(0);
  });

  it("getItem이 던져도 0을 돌려준다 — 경고를 띄우는 쪽으로 실패한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
    });
    expect(() => readSnoozedUntil("user_a")).not.toThrow();
    expect(readSnoozedUntil("user_a")).toBe(0);
  });

  it("setItem이 던져도 호출부로 전파하지 않는다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(() => writeSnoozedUntil("user_a", 111)).not.toThrow();
  });

  it("localStorage 자체가 없어도 죽지 않는다", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readSnoozedUntil("user_a")).toBe(0);
    expect(() => writeSnoozedUntil("user_a", 111)).not.toThrow();
  });
});
