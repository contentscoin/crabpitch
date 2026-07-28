import { describe, expect, it } from "vitest";
import {
  CUSTOM_SMTP_FALLBACK,
  SMTP_PRESETS,
  detectSmtpProvider,
  emailDomain,
  explainSmtpError,
  smtpPresetById,
} from "./smtpProviders";

describe("emailDomain", () => {
  it("도메인만 소문자로 뽑는다", () => {
    expect(emailDomain(" Hong@Naver.COM ")).toBe("naver.com");
  });

  it("+ 태그가 붙어도 도메인은 그대로", () => {
    expect(emailDomain("hong+pr@gmail.com")).toBe("gmail.com");
  });

  it("@가 여럿이면 마지막을 기준으로 한다", () => {
    expect(emailDomain('"a@b"@example.com')).toBe("example.com");
  });

  it("이메일이 아니면 null", () => {
    for (const bad of ["hong", "@naver.com", "hong@", "hong@localhost", ""]) {
      expect(emailDomain(bad)).toBeNull();
    }
  });
});

describe("detectSmtpProvider", () => {
  it("국내 주요 제공자를 판별한다", () => {
    expect(detectSmtpProvider("a@gmail.com").id).toBe("gmail");
    expect(detectSmtpProvider("a@naver.com").id).toBe("naver");
    expect(detectSmtpProvider("a@daum.net").id).toBe("daum");
    expect(detectSmtpProvider("a@kakao.com").id).toBe("daum");
    expect(detectSmtpProvider("a@outlook.com").id).toBe("outlook");
  });

  it("다음 계열은 465/SSL이다 — 587이 아니다", () => {
    // 제공자마다 포트가 다르다. 하나로 통일하면 다음만 연결에 실패한다.
    const daum = detectSmtpProvider("a@hanmail.net");
    expect(daum.port).toBe(465);
    expect(daum.secure).toBe(true);
  });

  it("나머지는 587/STARTTLS다", () => {
    for (const email of ["a@gmail.com", "a@naver.com", "a@outlook.com"]) {
      const p = detectSmtpProvider(email);
      expect(p.port).toBe(587);
      expect(p.secure).toBe(false);
    }
  });

  it("모르는 도메인은 custom + mail.{도메인} 제안", () => {
    // 확정이 아니라 제안이다 — 연결 테스트가 실패하면 사용자가 고친다.
    const p = detectSmtpProvider("hong@contentscoin.co.kr");
    expect(p.id).toBe("custom");
    expect(p.host).toBe("mail.contentscoin.co.kr");
  });

  it("이메일이 아니어도 null이 아니라 custom을 돌려준다", () => {
    // 호출부가 매번 분기하지 않도록 항상 쓸 수 있는 값을 준다.
    expect(detectSmtpProvider("hong").id).toBe("custom");
    expect(detectSmtpProvider("").host).toBe("");
  });

  it("Gmail은 앱 비밀번호 안내와 발급 링크를 함께 준다", () => {
    const g = detectSmtpProvider("a@gmail.com");
    expect(g.credentialNote).toMatch(/앱 비밀번호/);
    expect(g.setupUrl).toBe("https://myaccount.google.com/apppasswords");
  });

  it("네이버·다음은 SMTP 사용 설정을 켜라고 안내한다", () => {
    // 기본 꺼져 있어 ECONNREFUSED가 나는데, 사용자는 주소 오타로 오해한다.
    expect(detectSmtpProvider("a@naver.com").credentialNote).toMatch(/SMTP/);
    expect(detectSmtpProvider("a@daum.net").setupUrl).toBeTruthy();
  });
});

describe("SMTP_PRESETS 무결성", () => {
  it("도메인이 프리셋 간에 겹치지 않는다", () => {
    // 겹치면 앞선 항목이 이기므로 판별이 순서에 의존하게 된다.
    const seen = new Set<string>();
    for (const p of SMTP_PRESETS) {
      for (const d of p.domains) {
        expect(seen.has(d)).toBe(false);
        seen.add(d);
      }
    }
  });

  it("도메인은 전부 소문자다 — 비교 전에 소문자화하므로", () => {
    for (const p of SMTP_PRESETS) {
      for (const d of p.domains) expect(d).toBe(d.toLowerCase());
    }
  });

  it("secure=true면 465, false면 587", () => {
    for (const p of SMTP_PRESETS) {
      expect(p.port).toBe(p.secure ? 465 : 587);
    }
  });
});

describe("smtpPresetById", () => {
  it("저장된 provider 문자열을 프리셋으로 되살린다", () => {
    expect(smtpPresetById("naver").host).toBe("smtp.naver.com");
  });

  it("모르는 id는 custom 폴백", () => {
    expect(smtpPresetById("kakao-work")).toBe(CUSTOM_SMTP_FALLBACK);
  });
});

describe("explainSmtpError", () => {
  it("Gmail 인증 실패는 앱 비밀번호를 지목한다", () => {
    // 열에 아홉은 계정 비밀번호를 넣은 경우다.
    const msg = explainSmtpError("Invalid login: 535-5.7.8 EAUTH", "gmail");
    expect(msg).toMatch(/앱 비밀번호/);
  });

  it("다른 제공자의 인증 실패는 일반 안내", () => {
    const msg = explainSmtpError("EAUTH", "custom");
    expect(msg).toMatch(/아이디와 비밀번호/);
    expect(msg).not.toMatch(/앱 비밀번호/);
  });

  it("네이버 연결 거부는 SMTP 사용 설정을 지목한다", () => {
    const msg = explainSmtpError("connect ECONNREFUSED", "naver");
    expect(msg).toMatch(/SMTP 사용/);
  });

  it("타임아웃은 방화벽을 짚는다", () => {
    expect(explainSmtpError("ETIMEDOUT", "custom")).toMatch(/방화벽/);
  });

  it("모르는 오류는 원문을 그대로 준다 — 삼키지 않는다", () => {
    expect(explainSmtpError("메일함 용량 초과", "custom")).toBe("메일함 용량 초과");
  });
});
