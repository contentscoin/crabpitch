import { describe, expect, it } from "vitest";
import { DEFAULT_ERROR_MESSAGE, toUserMessage } from "./errorMessage";

/**
 * 이 함수의 목적은 **Convex 껍데기를 벗기는 것**이고, 도메인 한글 문구를 삼키지 않는 것이다.
 * 후자가 더 중요하다 — 이 저장소의 서버 오류는 사용자가 무엇을 해야 하는지 알려 주는 문장이다.
 */
describe("toUserMessage", () => {
  it("① Error도 문자열도 아니면 기본 문구", () => {
    expect(toUserMessage(undefined)).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toUserMessage(null)).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toUserMessage({ code: 500 })).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it("① 문자열은 그 값을 쓴다", () => {
    expect(toUserMessage("발신 수단이 연결되지 않았습니다.")).toBe(
      "발신 수단이 연결되지 않았습니다.",
    );
  });

  it("② 앞뒤 공백을 제거한다", () => {
    expect(toUserMessage(new Error("   저장했습니다.   "))).toBe("저장했습니다.");
  });

  it("③ Request ID·Server Error·Uncaught 접두를 벗긴다", () => {
    expect(toUserMessage(new Error("Uncaught Error: 예약할 초안이 없습니다."))).toBe(
      "예약할 초안이 없습니다.",
    );
    expect(toUserMessage(new Error("[Request ID: 1a2b3c] Server Error 권한이 없습니다."))).toBe(
      "권한이 없습니다.",
    );
    expect(toUserMessage(new Error("Uncaught ConvexError: 캠페인을 찾을 수 없습니다."))).toBe(
      "캠페인을 찾을 수 없습니다.",
    );
  });

  it("③ 껍데기만 있는 줄은 걸러내고 다음 줄을 쓴다(Convex 실제 형태)", () => {
    const raw = [
      "[Request ID: 9f8e7d] Server Error",
      "Uncaught Error: 발신 메일(SMTP)이 연결되지 않았습니다. 설정에서 연결한 뒤 예약하세요.",
      "    at handler (../convex/drafts.ts:540:15)",
      "    at async invokeMutation (../convex/_deps/xyz.js:12:3)",
    ].join("\n");
    expect(toUserMessage(new Error(raw))).toBe(
      "발신 메일(SMTP)이 연결되지 않았습니다. 설정에서 연결한 뒤 예약하세요.",
    );
  });

  it("④ 스택 라인 이후는 버린다", () => {
    const raw = "정말 중요한 안내입니다.\nat handler (foo.ts:1:1)\n뒤에 붙은 쓰레기";
    expect(toUserMessage(new Error(raw))).toBe("정말 중요한 안내입니다.");
  });

  it("⑤ 껍데기를 벗긴 뒤 남는 것이 없으면 기본 문구", () => {
    expect(toUserMessage(new Error("[Request ID: abc] Server Error"))).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toUserMessage(new Error("Uncaught Error:"))).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toUserMessage("   ")).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toUserMessage(new Error(""))).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it("⑥ 도메인 한글 문구는 원문 그대로 통과시킨다 — 삼키면 사용자가 할 일을 알 수 없다", () => {
    const domain = [
      "초안을 아직 한 건도 확인하지 않았습니다. 초안 2건 중 최소 1건을 열어 확인해 주세요.",
      "이 작업은 메일을 보내지 않고 ‘발송됨’으로만 기록합니다. 설정에서 Gmail 또는 SMTP를 연결해 실제로 발송하거나, 이미 직접 보냈다면 기록 전용 동의에 체크하세요.",
      "지원하지 않는 자리표시자입니다: {{제목}}. 사용 가능: {{수신거부}}, {{회사명}}",
      "발송 한도 초과: 이번 달 잔여 3통, 요청 12통.",
    ];
    for (const m of domain) {
      expect(toUserMessage(new Error(m))).toBe(m);
    }
  });

  it("괄호·대괄호가 섞인 도메인 문구를 접두로 오인하지 않는다", () => {
    // `[Request ID: ...]` 패턴과 형태가 비슷한 문구가 오탐되면 안 된다.
    const m = "[자료] 항목이 비어 있습니다.";
    expect(toUserMessage(new Error(m))).toBe(m);
  });
});
