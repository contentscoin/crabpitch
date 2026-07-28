import { describe, expect, it } from "vitest";
import {
  GMAIL_OAUTH_PLAN,
  PLAN_LIMITS,
  gmailOAuthUpgradeMessage,
  planAllowsGmailOAuth,
} from "./plans";
import { journalistCode, maskEmailStrong } from "./mask";
import {
  extractJournalistsFromResponse,
  normalizeJournalistRecord,
} from "./opencrabMap";
import { buildRawEmail, encodeSubject } from "./gmailMime";

describe("plans", () => {
  it("Free 한도를 정의한다", () => {
    expect(PLAN_LIMITS.free.sends).toBe(10);
    expect(PLAN_LIMITS.free.pressReleases).toBe(3);
  });
});

describe("Gmail 연동 플랜", () => {
  it("Agency만 허용한다", () => {
    expect(GMAIL_OAUTH_PLAN).toBe("agency");
    expect(planAllowsGmailOAuth("agency")).toBe(true);
    for (const p of ["free", "solo", "growth"]) {
      expect(planAllowsGmailOAuth(p)).toBe(false);
    }
  });

  it("모르는 값·미설정은 거부한다 — 권한은 실패 시 좁은 쪽으로 간다", () => {
    for (const p of [undefined, "", "enterprise", "AGENCY"]) {
      expect(planAllowsGmailOAuth(p)).toBe(false);
    }
  });

  it("막을 때 대안(SMTP)을 함께 알린다", () => {
    // 잠긴 건 전송 수단 하나이지 발송 기능이 아니다. 그 사실을 말하지 않으면
    // 사용자는 발송 자체가 유료로 바뀐 줄 안다.
    const msg = gmailOAuthUpgradeMessage();
    expect(msg).toContain("Agency");
    expect(msg).toMatch(/SMTP/);
  });
});

describe("mask", () => {
  it("익명 코드를 만든다", () => {
    expect(journalistCode("abc1234xyz")).toMatch(/^기자 #/);
  });

  it("이메일을 강하게 마스킹한다", () => {
    expect(maskEmailStrong("leespot@zdnet.co.kr")).not.toContain("@");
  });
});

describe("opencrabMap", () => {
  it("snake_case 레코드를 정규화한다", () => {
    const n = normalizeJournalistRecord({
      reporter_name: "이도원",
      outlet_name: "지디넷코리아",
      email: "leespot@zdnet.co.kr",
      beat_primary: "플랫폼/인터넷",
      contact_confidence: "high",
      reference_article_count: 14,
    });
    expect(n?.name).toBe("이도원");
    expect(n?.source).toBe("opencrab");
    expect(n?.mailingStatus).toBe("candidate");
  });

  it("journalists 배열 응답을 추출한다", () => {
    const list = extractJournalistsFromResponse({
      journalists: [
        {
          reporter_name: "박진형",
          outlet_name: "전자신문",
          email: "jin@etnews.com",
          beat_primary: "소프트웨어",
        },
        { name: "불완전" },
      ],
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.email).toBe("jin@etnews.com");
  });
});

describe("gmailMime", () => {
  it("ASCII 제목은 그대로 둔다", () => {
    expect(encodeSubject("Hello")).toBe("Hello");
  });

  it("raw 메시지를 base64url로 만든다", () => {
    const raw = buildRawEmail({
      to: "a@b.com",
      subject: "테스트",
      body: "본문",
    });
    expect(raw).not.toMatch(/[+/=]/);
    expect(Buffer.from(raw, "base64url").toString("utf8")).toContain("To: a@b.com");
  });
});
