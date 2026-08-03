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

  it("첨부가 없으면 예전처럼 단일 text/plain이다", () => {
    const decoded = decode(buildRawEmail({ to: "a@b.com", subject: "제목", body: "본문" }));
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).not.toContain("multipart/mixed");
  });

  it("첨부가 있으면 multipart/mixed로 본문과 파일을 함께 싣는다", () => {
    const decoded = decode(
      buildRawEmail({
        to: "a@b.com",
        subject: "제목",
        body: "본문",
        attachments: [{ filename: "보도자료_신제품.txt", text: "전문 내용" }],
      }),
    );
    expect(decoded).toContain("multipart/mixed");
    expect(decoded).toContain("본문");
    expect(decoded).toContain("Content-Disposition: attachment;");
    // 첨부 내용은 base64로 실린다.
    expect(decoded).toContain(Buffer.from("전문 내용", "utf8").toString("base64"));
  });

  it("한글 파일명을 RFC 2231로 싣고 ASCII 폴백을 함께 둔다", () => {
    const decoded = decode(
      buildRawEmail({
        to: "a@b.com",
        subject: "제목",
        body: "본문",
        attachments: [{ filename: "보도자료_신제품.txt", text: "전문" }],
      }),
    );
    expect(decoded).toContain(`filename*=UTF-8''${encodeURIComponent("보도자료_신제품.txt")}`);
    // 폴백 파일명에는 비ASCII가 남지 않는다.
    const fallback = decoded.match(/filename="([^"]+)"/)![1]!;
    // eslint-disable-next-line no-control-regex
    expect(fallback).toMatch(/^[\x20-\x7E]+$/);
  });

  it("경계 문자열이 내용과 겹치면 겹치지 않을 때까지 늘린다", () => {
    const collide = "==crabpitch-boundary==";
    const decoded = decode(
      buildRawEmail({
        to: "a@b.com",
        subject: "제목",
        body: `본문에 ${collide} 가 들어 있다`,
        attachments: [{ filename: "a.txt", text: "전문" }],
      }),
    );
    const boundary = decoded.match(/boundary="([^"]+)"/)![1]!;
    expect(boundary.length).toBeGreaterThan(collide.length);
    // 경계로 쪼갰을 때 본문 파트 + 첨부 파트 두 개가 나온다.
    expect(decoded.split(`--${boundary}`).length).toBe(4); // 앞머리 + 2파트 + 종료
  });

  it("빈 첨부는 무시한다 — 빈 파일을 기자에게 보내지 않는다", () => {
    const decoded = decode(
      buildRawEmail({
        to: "a@b.com",
        subject: "제목",
        body: "본문",
        attachments: [{ filename: "a.txt", text: "" }],
      }),
    );
    expect(decoded).not.toContain("multipart/mixed");
  });
});

function decode(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}
