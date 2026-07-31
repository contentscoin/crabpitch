import { describe, expect, it } from "vitest";
import { DEFAULT_ERROR_MESSAGE, toUserMessage } from "./errorMessage";

/**
 * 이 함수의 목적은 **Convex 껍데기를 벗기는 것**이고, 도메인 한글 문구를 삼키지 않는 것이다.
 * 후자가 더 중요하다 — 이 저장소의 서버 오류는 사용자가 무엇을 해야 하는지 알려 주는 문장이다.
 *
 * ⚠️ 픽스처는 **설치된 패키지가 실제로 만드는 형태**여야 한다.
 *    정본: `node_modules/convex/dist/esm/browser/logging.js` `createHybridErrorStacktrace`
 *        `[CONVEX ${prefix}(${udfPath})] ${errorMessage}\n  Called by client`
 *    초기 버전은 `[Request ID: …] Server Error`를 가정했는데 그 문자열은 이 클라이언트에
 *    존재하지 않았다 — 테스트는 초록인데 실제 오류는 하나도 벗겨지지 않았다.
 */

/** 실제 Convex 클라이언트가 던지는 메시지를 그대로 재현한다. */
function convexError(errorMessage: string, udf = "M(smtpActions:sendCampaign)"): Error {
  return new Error(`[CONVEX ${udf}] ${errorMessage}\n  Called by client`);
}

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

  /**
   * 가장 중요한 검사 — 실제 형태에서 UDF 경로가 사용자 화면에 새지 않아야 한다.
   * (이 함수가 존재하는 이유다.)
   */
  it("③ 실제 Convex 형태에서 문구만 남긴다", () => {
    const r = toUserMessage(
      convexError("Uncaught Error: 발신 메일(SMTP)이 연결되지 않았습니다. 설정에서 연결한 뒤 예약하세요."),
    );
    expect(r).toBe("발신 메일(SMTP)이 연결되지 않았습니다. 설정에서 연결한 뒤 예약하세요.");
    // UDF 경로·껍데기가 한 조각도 남지 않아야 한다.
    expect(r).not.toContain("CONVEX");
    expect(r).not.toContain("smtpActions");
    expect(r).not.toContain("Uncaught");
    expect(r).not.toContain("Called by client");
  });

  it("③ ConvexError·쿼리·액션 접두도 벗긴다", () => {
    expect(toUserMessage(convexError("Uncaught ConvexError: 권한이 없습니다.", "Q(campaigns:get)"))).toBe(
      "권한이 없습니다.",
    );
    expect(
      toUserMessage(convexError("Uncaught Error: 캠페인을 찾을 수 없습니다.", "A(aiActions:enhance)")),
    ).toBe("캠페인을 찾을 수 없습니다.");
  });

  it("③ 접두만 있고 문구가 없으면 기본 문구", () => {
    expect(toUserMessage(convexError("Uncaught Error:"))).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toUserMessage(new Error("[CONVEX M(a:b)]"))).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toUserMessage("   ")).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toUserMessage(new Error(""))).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it("④ 스택 라인과 'Called by client' 꼬리를 버린다", () => {
    const raw = [
      "[CONVEX M(drafts:sendCampaign)] Uncaught Error: 정말 중요한 안내입니다.",
      "    at handler (../convex/drafts.ts:455:13)",
      "    at async invokeMutation (../convex/_deps/xyz.js:12:3)",
      "  Called by client",
    ].join("\n");
    expect(toUserMessage(new Error(raw))).toBe("정말 중요한 안내입니다.");
  });

  it("⑥ 도메인 한글 문구는 원문 그대로 통과시킨다 — 삼키면 사용자가 할 일을 알 수 없다", () => {
    const domain = [
      "초안을 아직 한 건도 확인하지 않았습니다. 초안 2건 중 최소 1건을 열어 확인해 주세요.",
      "이 작업은 메일을 보내지 않고 ‘발송됨’으로만 기록합니다. 설정에서 Gmail 또는 SMTP를 연결해 실제로 발송하거나, 이미 직접 보냈다면 기록 전용 동의에 체크하세요.",
      "지원하지 않는 자리표시자입니다: {{제목}}. 사용 가능: {{수신거부}}, {{회사명}}",
      "발송 한도 초과: 이번 달 잔여 3통, 요청 12통.",
    ];
    for (const m of domain) {
      // 껍데기 없이 와도, 껍데기에 싸여 와도 같은 문구가 나와야 한다.
      expect(toUserMessage(new Error(m))).toBe(m);
      expect(toUserMessage(convexError(`Uncaught Error: ${m}`))).toBe(m);
    }
  });

  it("괄호·대괄호가 섞인 도메인 문구를 접두로 오인하지 않는다", () => {
    // `[CONVEX …]` 패턴과 형태가 비슷한 문구가 오탐되면 안 된다.
    for (const m of ["[자료] 항목이 비어 있습니다.", "[긴급] 확인이 필요합니다."]) {
      expect(toUserMessage(new Error(m))).toBe(m);
    }
  });
});
