import { describe, expect, it } from "vitest";
import { buildMailSetupGuide } from "./smtpSetupGuide";

const URL = "https://crabpitch.app/settings";
const NOT_CONNECTED = { connected: false };

function guide(email?: string, status = NOT_CONNECTED) {
  return buildMailSetupGuide({ email, status, settingsUrl: URL });
}

describe("buildMailSetupGuide", () => {
  it("이메일이 없어도 시작점을 알려 준다", () => {
    // 이메일을 모른다고 안내를 거부하면 사용자는 아무것도 얻지 못한다.
    const g = guide();
    expect(g.steps.length).toBeGreaterThan(0);
    expect(g.steps.join(" ")).toContain(URL);
    expect(g.provider).toBeUndefined();
  });

  it("Gmail은 앱 비밀번호 발급을 절차에 넣는다", () => {
    const g = guide("hong@gmail.com");
    const text = g.steps.join(" ");
    expect(text).toContain("2단계 인증");
    expect(text).toContain("앱 비밀번호");
    expect(text).toContain("myaccount.google.com/apppasswords");
    expect(g.provider?.id).toBe("gmail");
  });

  it("네이버는 SMTP 사용을 켜는 것부터 시작한다", () => {
    // 기본이 꺼져 있어 ECONNREFUSED가 나는데 사용자는 주소 오타로 오해한다.
    const g = guide("hong@naver.com");
    expect(g.steps[0]).toMatch(/IMAP\/SMTP 사용/);
  });

  it("다음 계열은 SSL(465)로 안내한다", () => {
    expect(guide("hong@kakao.com").provider?.security).toBe("SSL");
    expect(guide("hong@gmail.com").provider?.security).toBe("STARTTLS");
  });

  it("회사 메일은 관리자에게 물어볼 것을 먼저 알려 준다", () => {
    const g = guide("hong@contentscoin.co.kr");
    expect(g.provider?.id).toBe("custom");
    expect(g.steps[0]).toMatch(/관리자/);
  });

  it("마지막 단계는 언제나 연결 확인이다", () => {
    // 저장만 하고 끝내면 사용자는 발송이 실패할 때까지 잘못된 설정을 모른다.
    for (const e of ["hong@gmail.com", "hong@naver.com", "hong@x.co.kr", undefined]) {
      expect(guide(e).steps.at(-1)).toMatch(/연결 확인|붙는지/);
    }
  });
});

describe("연결 상태 반영", () => {
  it("이미 확인된 계정이면 절차를 다시 늘어놓지 않는다", () => {
    const g = buildMailSetupGuide({
      status: { connected: true, email: "a@gmail.com", providerLabel: "Gmail", lastStatus: "ok" },
      settingsUrl: URL,
    });
    expect(g.connection.verified).toBe(true);
    expect(g.steps.join(" ")).toContain("이미");
    expect(g.steps.join(" ")).not.toContain("2단계 인증");
  });

  it("저장됐지만 실패한 상태는 원인을 먼저 말한다", () => {
    const g = buildMailSetupGuide({
      status: {
        connected: true,
        email: "a@gmail.com",
        lastStatus: "error",
        lastError: "인증에 실패했습니다.",
      },
      settingsUrl: URL,
    });
    expect(g.connection.verified).toBe(false);
    expect(g.connection.problem).toBe("인증에 실패했습니다.");
    expect(g.steps[0]).toContain("인증에 실패했습니다.");
    // 원인을 말한 뒤에는 고치는 절차가 이어져야 한다.
    expect(g.steps.length).toBeGreaterThan(1);
  });

  it("확인 전 상태를 연결됨으로 단정하지 않는다", () => {
    const g = buildMailSetupGuide({
      status: { connected: true, email: "a@gmail.com" },
      settingsUrl: URL,
    });
    expect(g.connection.verified).toBe(false);
    expect(g.steps[0]).toMatch(/확인하지 않았습니다/);
  });
});

describe("자격증명 취급", () => {
  it("비밀번호를 대화에 붙여넣지 말라고 매번 경고한다", () => {
    for (const g of [guide(), guide("a@gmail.com")]) {
      expect(g.cautions.join(" ")).toMatch(/붙여넣지 마세요/);
    }
  });

  it("이미 연결된 경우에도 경고는 남는다", () => {
    const g = buildMailSetupGuide({
      status: { connected: true, email: "a@gmail.com", lastStatus: "ok" },
      settingsUrl: URL,
    });
    expect(g.cautions.join(" ")).toMatch(/붙여넣지 마세요/);
  });

  it("안내 어디에도 비밀번호를 담는 필드가 없다", () => {
    // 구조상 담을 곳이 없어야 한다 — 문구로만 막으면 언젠가 샌다.
    const json = JSON.stringify(guide("a@gmail.com"));
    expect(json).not.toMatch(/"password"/);
  });
});
