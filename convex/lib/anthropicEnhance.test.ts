import { describe, expect, it } from "vitest";
import {
  parseEnhanceEmailResult,
  parseJsonObject,
  parsePolishPressResult,
} from "./anthropicEnhance";

describe("anthropicEnhance parsers", () => {
  it("JSON 펜스에서 객체를 추출한다", () => {
    const obj = parseJsonObject('```json\n{"a":1}\n```');
    expect(obj).toEqual({ a: 1 });
  });

  it("메일 결과에 수신거부가 없으면 강제 삽입한다", () => {
    const r = parseEnhanceEmailResult(
      JSON.stringify({ subject: "[회사] 소식", body: "기자님, 안녕하세요.\n본문만" }),
      { subject: "x", body: "y" },
    );
    expect(r.subject).toContain("회사");
    expect(r.body).toContain("수신거부");
    expect(r.body).toContain("기자님");
  });

  it("보도자료 headlines를 3개로 채운다", () => {
    const r = parsePolishPressResult(
      JSON.stringify({ title: "타이틀", headlines: ["A"], body: "본문입니다." }),
      { title: "f", headlines: ["f"], body: "f" },
    );
    expect(r.headlines).toHaveLength(3);
    expect(r.body).toBe("본문입니다.");
  });
});
