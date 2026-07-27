import { describe, expect, it } from "vitest";
import {
  checkBoilerplate,
  checkNumbersAgainstFactSheet,
  extractNumericClaims,
} from "./factCheck";

const BOILER =
  "크랩피치는 2023년 설립된 언론 홍보 자동화 기업입니다. 스타트업이 직접 기자에게 소식을 전할 수 있도록 매칭·초안·발송 기록을 한 흐름으로 제공합니다.";

describe("보일러플레이트 단일 소스 대조", () => {
  it("원본이 없으면 검사하지 않는다", () => {
    expect(checkBoilerplate("본문", undefined).verdict).toBe("skipped");
    expect(checkBoilerplate("본문", "  ").verdict).toBe("skipped");
  });

  it("너무 짧은 원본은 우연히 겹치므로 대조하지 않는다", () => {
    expect(checkBoilerplate("아무 본문", "크랩피치입니다").verdict).toBe("skipped");
  });

  it("본문에 그대로 실려 있으면 통과한다", () => {
    const body = `회사가 시리즈A를 유치했다.\n\n${BOILER}`;
    expect(checkBoilerplate(body, BOILER).verdict).toBe("ok");
  });

  it("띄어쓰기·문장부호만 다른 경우도 통과한다", () => {
    const body = `소식입니다.\n\n${BOILER.replace(/ /g, "")}`;
    expect(checkBoilerplate(body, BOILER).verdict).toBe("ok");
  });

  it("설립연도만 바뀐 사본 표류를 잡는다", () => {
    const drifted = BOILER.replace("2023년", "2021년");
    const r = checkBoilerplate(`소식입니다.\n\n${drifted}`, BOILER);
    expect(r.verdict).toBe("drifted");
    expect(r.closestParagraph).toContain("2021년");
  });

  it("회사 소개가 아예 없으면 missing", () => {
    const r = checkBoilerplate("회사가 시리즈A를 유치했다. 투자는 3월에 마무리됐다.", BOILER);
    expect(r.verdict).toBe("missing");
  });

  it("문단 단위로 본다 — 다른 문단의 일치에 묻히지 않는다", () => {
    const drifted = BOILER.replace("2023년", "2021년");
    const body = `${BOILER.slice(0, 20)} 관련 소식입니다.\n\n다른 문단입니다.\n\n${drifted}`;
    expect(checkBoilerplate(body, BOILER).verdict).toBe("drifted");
  });
});

describe("수치 추출", () => {
  it("자릿수 접두를 곱한다", () => {
    expect(extractNumericClaims("누적 이용자 30만 명을 넘었다.")).toEqual([
      { value: 300_000, unit: "명", raw: "30만 명" },
    ]);
  });

  it("천 단위 구분 쉼표를 처리한다", () => {
    expect(extractNumericClaims("1,200건 접수")[0]).toMatchObject({ value: 1200, unit: "건" });
  });

  it("퍼센트와 퍼센트포인트를 구분한다", () => {
    const claims = extractNumericClaims("점유율은 42%, 전년 대비 3%p 상승했다.");
    expect(claims).toContainEqual(expect.objectContaining({ value: 42, unit: "%" }));
    expect(claims).toContainEqual(expect.objectContaining({ value: 3, unit: "%p" }));
  });

  it("날짜·기간은 주장으로 세지 않는다", () => {
    expect(extractNumericClaims("2026년 3월 12일, 6개월간 진행했다.")).toEqual([]);
    expect(extractNumericClaims("3분기 실적")).toEqual([]);
  });

  it("단위도 자릿수도 없는 맨숫자는 세지 않는다", () => {
    expect(extractNumericClaims("방법은 3가지다.")).toEqual([]);
  });

  it("억원 단위 금액을 실제 값으로 환산한다", () => {
    expect(extractNumericClaims("100억원을 유치했다.")[0]).toMatchObject({
      value: 1e10,
      unit: "원",
    });
  });
});

describe("본문 수치 ⊆ 팩트시트 수치", () => {
  const FACTS = [
    { label: "누적 이용자", value: "30만 명" },
    { label: "시리즈A", value: "100억원" },
    { label: "전년 대비 성장", value: "42%" },
  ];

  it("팩트시트가 비어 있으면 검사하지 않는다", () => {
    const r = checkNumbersAgainstFactSheet("이용자 50만 명을 넘었다.", []);
    expect(r.skipped).toBe(true);
    expect(r.unsourced).toEqual([]);
  });

  it("팩트시트에 수치가 하나도 없으면 검사하지 않는다", () => {
    const r = checkNumbersAgainstFactSheet("이용자 50만 명", [{ label: "본사", value: "서울" }]);
    expect(r.skipped).toBe(true);
  });

  it("팩트시트에 있는 값만 쓰면 통과한다", () => {
    const body = "크랩피치는 누적 이용자 30만 명을 확보했고 100억원 규모 시리즈A를 유치했다.";
    expect(checkNumbersAgainstFactSheet(body, FACTS).unsourced).toEqual([]);
  });

  it("팩트시트에 없는 숫자를 잡는다", () => {
    const r = checkNumbersAgainstFactSheet("이용자 50만 명을 확보했다.", FACTS);
    expect(r.skipped).toBe(false);
    expect(r.unsourced).toHaveLength(1);
    expect(r.unsourced[0]).toMatchObject({ value: 500_000, unit: "명" });
  });

  it("같은 수치가 여러 번 나와도 한 번만 보고한다", () => {
    const body = "50만 명을 넘었다. 50만 명은 전년의 두 배다.";
    expect(checkNumbersAgainstFactSheet(body, FACTS).unsourced).toHaveLength(1);
  });

  it("본문의 날짜는 근거 없음으로 보지 않는다", () => {
    const body = "2026년 3월 12일 30만 명을 넘었다.";
    expect(checkNumbersAgainstFactSheet(body, FACTS).unsourced).toEqual([]);
  });

  it("단위가 다르면 값이 같아도 근거로 보지 않는다", () => {
    const r = checkNumbersAgainstFactSheet("가맹점 42곳을 확보했다.", FACTS);
    expect(r.unsourced).toHaveLength(1);
    expect(r.unsourced[0]).toMatchObject({ value: 42, unit: "곳" });
  });

  it("팩트시트에 단위 없이 적힌 값도 근거로 인정한다", () => {
    const facts = [{ label: "누적 이용자", value: "30만" }];
    expect(checkNumbersAgainstFactSheet("이용자 30만 명", facts).unsourced).toEqual([]);
  });
});
