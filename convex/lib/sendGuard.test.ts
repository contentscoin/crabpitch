import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  partitionBySuppression,
  suppressedEmailSet,
} from "./sendGuard";

describe("발송 직전 수신거부 가드", () => {
  it("억제된 기자를 발송 대상에서 제외한다", () => {
    const suppressed = suppressedEmailSet(["out@zdnet.co.kr"]);
    const { sendable, blocked } = partitionBySuppression(
      [{ email: "keep@zdnet.co.kr" }, { email: "out@zdnet.co.kr" }],
      suppressed,
    );
    expect(sendable).toEqual([{ email: "keep@zdnet.co.kr" }]);
    expect(blocked).toEqual([{ email: "out@zdnet.co.kr" }]);
  });

  it("대소문자·공백 차이로 새지 않는다", () => {
    const suppressed = suppressedEmailSet(["  OUT@ZDNet.co.kr "]);
    const { sendable, blocked } = partitionBySuppression(
      [{ email: "out@zdnet.co.kr" }],
      suppressed,
    );
    expect(sendable).toHaveLength(0);
    expect(blocked).toHaveLength(1);
  });

  it("억제 리스트가 비면 전부 발송 가능", () => {
    const { sendable, blocked } = partitionBySuppression(
      [{ email: "a@x.com" }, { email: "b@x.com" }],
      suppressedEmailSet([]),
    );
    expect(sendable).toHaveLength(2);
    expect(blocked).toHaveLength(0);
  });

  it("이메일을 찾지 못한 초안(빈 문자열)은 억제로 오판하지 않는다", () => {
    const { sendable } = partitionBySuppression(
      [{ email: "" }],
      suppressedEmailSet(["out@zdnet.co.kr"]),
    );
    expect(sendable).toHaveLength(1);
  });

  it("normalizeEmail은 트림·소문자화만 한다", () => {
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
  });
});
