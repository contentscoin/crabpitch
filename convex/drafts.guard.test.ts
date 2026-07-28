import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 발송 확정 경로 구조 가드.
 *
 * 컴플라이언스 게이트(파일럿 승인·수신거부 재대조·7일 쿨다운·표현 규정·캠페인당 상한·
 * 월 한도)는 발송을 확정하는 **모든** 경로에서 걸려야 한다. 경로마다 로직을 따로 두면
 * 하나가 반드시 샌다 — 실제로 두 번 샜다:
 *   ① 크론 백업 경로가 수신거부 재대조를 빠뜨린 채 돌고 있었다.
 *   ② Gmail 초안 생성 경로가 확정 로직을 따로 들고 있어 쿨다운·표현 규정·상한을 통째로
 *      건너뛰었다. Gmail 연결 사용자에게는 그게 기본 경로였다.
 *
 * 그래서 네 경로가 공통 함수를 통과하는지를 소스 수준에서 고정한다. 런타임 통합 테스트
 * 하네스(convex-test)가 없는 상태에서 이 불변식을 지킬 수 있는 가장 직접적인 방법이다.
 * 다섯 번째 경로가 생기거나 누군가 공통 함수를 우회하면 여기서 깨진다.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "drafts.ts"), "utf-8");
const GMAIL_SOURCE = readFileSync(join(HERE, "gmailActions.ts"), "utf-8");
const GMAIL_ACCOUNTS_SOURCE = readFileSync(join(HERE, "gmailAccounts.ts"), "utf-8");

/** `export const <name> = ...` 부터 다음 최상위 export 직전까지를 잘라낸다. */
function exportBlock(name: string): string {
  const start = SOURCE.indexOf(`export const ${name} =`);
  expect(start, `${name} 를 찾지 못했습니다`).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 1);
  const nextExport = rest.indexOf("\nexport const ");
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

/**
 * 초안을 확정하는 경로는 넷이다. 앞의 셋은 선별·확정을 한 트랜잭션에서 끝내고,
 * Gmail 초안 생성만 외부 API 호출이 끼어 있어 선별 → 호출 → 확정으로 나뉜다.
 * 그 사정 때문에 Gmail 경로는 한동안 게이트를 통째로 건너뛰고 있었다.
 */
const SEND_PATHS = ["sendCampaign", "executeScheduledSend", "processDueSends"] as const;

/**
 * 초안 확정 코드의 흔적 — 초안을 sent로 바꾸면서 발송 시각을 찍는 패치.
 *
 * 단순히 `status: "sent"` 를 찾으면 **캠페인** 상태 정리까지 걸린다. 그건 확정이 아니라
 * 확정 결과를 반영하는 코드이고, 선별 단계에도 정상적으로 존재한다.
 */
const DRAFT_CONFIRM = /status: "sent",\s*\n\s*sentAt:/;

/** 선별 함수를 잘라낸다 — 최상위 `async function` 경계로 자른다. */
function fnBlock(name: string): string {
  const start = SOURCE.indexOf(`async function ${name}`);
  expect(start, `${name} 를 찾지 못했습니다`).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 1);
  const boundary = [rest.indexOf("\nasync function "), rest.indexOf("\nexport const ")].filter(
    (i) => i !== -1,
  );
  return boundary.length ? rest.slice(0, Math.min(...boundary)) : rest;
}

describe("발송 확정 경로", () => {
  it("선별·확정 함수는 각각 한 곳에만 정의된다", () => {
    expect(SOURCE.match(/async function selectSendableDrafts/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/async function confirmSent/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/async function finalizeCampaignSend/g) ?? []).toHaveLength(1);
  });

  for (const path of SEND_PATHS) {
    it(`${path}는 공통 함수를 통과한다`, () => {
      expect(exportBlock(path)).toContain("finalizeCampaignSend(");
    });
  }

  for (const path of SEND_PATHS) {
    it(`${path}는 발송 확정을 직접 수행하지 않는다`, () => {
      const block = exportBlock(path);
      // 게이트를 건너뛰고 초안을 sent로 바꾸거나 사용량을 올리는 코드가 경로 안에 있으면 안 된다.
      expect(block).not.toMatch(DRAFT_CONFIRM);
      expect(block).not.toContain("bumpSends(");
    });
  }

  it("선별 함수가 다섯 가지 게이트를 모두 호출한다", () => {
    const block = fnBlock("selectSendableDrafts");
    expect(block).toContain("needsPilotApproval(");
    expect(block).toContain("filterSuppressed(");
    expect(block).toContain("partitionByCooldown(");
    expect(block).toContain("checkEmailCompliance(");
    expect(block).toContain("campaignSendCap");
  });

  it("선별 함수는 아무것도 확정하지 않는다", () => {
    const block = fnBlock("selectSendableDrafts");
    expect(block).not.toMatch(DRAFT_CONFIRM);
    expect(block).not.toContain("bumpSends(");
  });

  it("초안을 sent로 바꾸고 사용량을 올리는 곳은 confirmSent 하나뿐이다", () => {
    // 이 파일 전체에서 확정 코드가 두 번 이상 나오면 경로 하나가 게이트를 우회한 것이다.
    expect(SOURCE.match(/status: "sent",\r?\n\s+sentAt:/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/await bumpSends\(/g) ?? []).toHaveLength(1);
    expect(fnBlock("confirmSent")).toContain("await bumpSends(");
  });

  it("쿨다운 조회는 사용자 축 인덱스만 쓴다(교차 테넌트 스캔 차단)", () => {
    expect(SOURCE).toContain('withIndex("by_user_journalist"');
    // 사용자 축 없는 전역 기자 인덱스를 쓰면 다른 사용자의 발송 이력이 판정에 섞인다.
    expect(SOURCE).not.toContain('withIndex("by_journalist"');
  });
});

/**
 * Gmail 초안 생성 경로 가드.
 *
 * 이 경로는 연결 사용자에게 **기본 경로**다. 예전에는 수신거부 재대조만 하고 쿨다운·표현
 * 규정·상한·월 한도를 건너뛰었다 — 확정 로직을 이 경로가 따로 들고 있었기 때문이다.
 * 이제 선별은 `selectForGmailSend`, 확정은 `confirmGmailSent`로 drafts.ts를 통과한다.
 */
describe("Gmail 초안 생성 경로", () => {
  it("선별·확정 모두 drafts.ts를 통과한다", () => {
    expect(GMAIL_SOURCE).toContain("internal.drafts.selectForGmailSend");
    expect(GMAIL_SOURCE).toContain("internal.drafts.confirmGmailSent");
  });

  it("액션 안에서 초안을 직접 확정하지 않는다", () => {
    expect(GMAIL_SOURCE).not.toContain('status: "sent"');
    expect(GMAIL_SOURCE).not.toContain("bumpSends(");
  });

  it("gmailAccounts에는 확정 로직이 남아 있지 않다", () => {
    // 게이트를 우회하는 두 번째 확정 경로가 되살아나면 여기서 깨진다.
    expect(GMAIL_ACCOUNTS_SOURCE).not.toContain('status: "sent"');
    expect(GMAIL_ACCOUNTS_SOURCE).not.toContain("bumpSends(");
  });

  it("선별 mutation은 공통 선별 함수만 쓴다", () => {
    expect(exportBlock("selectForGmailSend")).toContain("selectSendableDrafts(");
  });

  it("확정 mutation은 공통 확정 함수만 쓴다", () => {
    expect(exportBlock("confirmGmailSent")).toContain("confirmSent(");
  });
});

describe("파일럿 게이트", () => {
  it("판정 로직은 lib/pilotGate 단일 소스만 쓴다", () => {
    expect(SOURCE).toContain('from "./lib/pilotGate"');
    // 임계값을 경로마다 다시 적으면 하나가 반드시 어긋난다.
    expect(SOURCE).not.toContain("PILOT_GATE_MIN_DRAFTS =");
  });

  it("공통 선별 함수가 게이트를 통과한다", () => {
    expect(fnBlock("selectSendableDrafts")).toContain("needsPilotApproval(");
  });

  for (const path of ["sendCampaign", "scheduleCampaign"] as const) {
    it(`${path}는 조용히 0통으로 끝내지 않고 사유를 던진다`, () => {
      const block = exportBlock(path);
      expect(block).toContain("needsPilotApproval(");
      expect(block).toContain("pilotGateMessage(");
    });
  }

  it("Gmail 경로도 보류를 조용히 삼키지 않는다", () => {
    expect(GMAIL_SOURCE).toContain("counts.blockedPilot");
    expect(GMAIL_SOURCE).toContain("pilotGateMessage(");
  });
});
