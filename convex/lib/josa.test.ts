import { describe, expect, it } from "vitest";
import { finalConsonant, josa, withJosa } from "./josa";

describe("josa — 한글 받침", () => {
  it("받침이 있으면 은/이/을/과", () => {
    expect(josa("크랩피치먹", "은는")).toBe("은");
    expect(josa("삼성전자관", "이가")).toBe("이");
    expect(josa("이것", "을를")).toBe("을");
    expect(josa("사람", "과와")).toBe("과");
  });

  it("받침이 없으면 는/가/를/와", () => {
    expect(josa("크랩피치", "은는")).toBe("는");
    expect(josa("회사", "이가")).toBe("가");
    expect(josa("자료", "을를")).toBe("를");
    expect(josa("기자", "과와")).toBe("와");
  });

  it("ㄹ 받침 뒤에서는 '으로'가 아니라 '로'다", () => {
    expect(josa("서울", "으로로")).toBe("로");
    expect(josa("이것", "으로로")).toBe("으로"); // ㅅ 받침
    expect(josa("회사", "으로로")).toBe("로"); // 받침 없음
  });
});

describe("josa — 로마자", () => {
  it("한 글자씩 읽었을 때 받침으로 끝나는 알파벳만 '은'", () => {
    // 엘·엠·엔·아르
    expect(josa("AAPL", "은는")).toBe("은");
    expect(josa("IBM", "은는")).toBe("은");
    expect(josa("CNN", "은는")).toBe("은");
    expect(josa("VR", "은는")).toBe("은");
  });

  it("나머지 알파벳은 '는'", () => {
    // 실제 발송 메일에서 「(주)더에이치클럽/FMG은(는)」이 나갔던 케이스 — G는 '지'다.
    expect(josa("(주)더에이치클럽/FMG", "은는")).toBe("는");
    expect(josa("AI", "은는")).toBe("는");
    expect(josa("IT", "은는")).toBe("는");
    expect(josa("MCP", "은는")).toBe("는");
  });

  it("대소문자를 가리지 않는다", () => {
    expect(josa("aapl", "은는")).toBe(josa("AAPL", "은는"));
  });
});

describe("josa — 숫자", () => {
  it("영·일·삼·육·칠·팔은 받침이 있다", () => {
    for (const n of ["10", "1", "3", "6", "7", "8"]) {
      expect(josa(n, "이가")).toBe("이");
    }
  });

  it("이·사·오·구는 받침이 없다", () => {
    for (const n of ["2", "4", "5", "9"]) {
      expect(josa(n, "이가")).toBe("가");
    }
  });

  it("1·7·8은 ㄹ 받침이라 '로'를 쓴다", () => {
    expect(josa("1", "으로로")).toBe("로");
    expect(josa("3", "으로로")).toBe("으로");
  });
});

describe("josa — 발음되지 않는 꼬리표", () => {
  it("닫는 괄호·따옴표·마침표는 건너뛰고 판정한다", () => {
    expect(josa("크랩피치(CrabPitch)", "은는")).toBe("는"); // h → 에이치
    expect(josa("'서울'", "으로로")).toBe("로");
    expect(josa("회사.", "이가")).toBe("가");
  });

  it("판정할 글자가 없으면 받침 없음 쪽 — 병기는 절대 만들지 않는다", () => {
    expect(josa("", "은는")).toBe("는");
    expect(josa("   ", "은는")).toBe("는");
    expect(josa("...", "은는")).toBe("는");
  });
});

describe("finalConsonant", () => {
  it("모르는 문자는 undefined — '없음'과 구분한다", () => {
    expect(finalConsonant("株")).toBeUndefined();
    expect(finalConsonant("회사")).toBe("none");
    expect(finalConsonant("서울")).toBe("rieul");
    expect(finalConsonant("이것")).toBe("other");
  });
});

describe("withJosa", () => {
  it("단어와 조사를 붙여 돌려준다", () => {
    expect(withJosa("크랩피치", "은는")).toBe("크랩피치는");
    expect(withJosa("(주)더에이치클럽/FMG", "은는")).toBe("(주)더에이치클럽/FMG는");
  });
});

describe("어떤 조사도 병기 형태를 만들지 않는다", () => {
  it("모든 입력에서 괄호 병기가 나오지 않는다", () => {
    const words = ["회사", "FMG", "서울", "", "株", "2026", "크랩피치(CrabPitch)"];
    const pairs = ["은는", "이가", "을를", "과와", "으로로", "이라라"] as const;
    for (const w of words) {
      for (const p of pairs) {
        expect(josa(w, p)).not.toMatch(/[()]/);
      }
    }
  });
});
